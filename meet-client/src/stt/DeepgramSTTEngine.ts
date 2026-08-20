import { ISTTEngine, STTConfig, STTEngineState, TranscriptSegment, TranscriptWord } from './types';

export class DeepgramSTTEngine implements ISTTEngine {
  private ws?: WebSocket;
  private state: STTEngineState = 'DISCONNECTED';
  private keepAliveInterval?: number;
  private currentMetadata: { trackId?: string; speaker?: string; participantId?: number } = {};

  private transcriptListeners: Set<(segment: TranscriptSegment) => void> = new Set();
  private errorListeners: Set<(err: Error) => void> = new Set();
  private stateListeners: Set<(state: STTEngineState) => void> = new Set();

  constructor(private readonly config: STTConfig) {}

  public getState(): STTEngineState {
    return this.state;
  }

  public async connect(): Promise<void> {
    if (this.state === 'CONNECTING' || this.state === 'LISTENING') {
      return;
    }

    if (!this.config.apiKey) {
      const err = new Error('Deepgram API Key is required for DeepgramSTTEngine.');
      this.notifyError(err);
      throw err;
    }

    this.setState('CONNECTING');
    this.log('info', 'Connecting to Deepgram Live Streaming STT WebSocket...');

    const sampleRate = this.config.sampleRate || 16000;
    const model = this.config.model || 'nova-2';
    const language = this.config.language || 'en';
    const punctuate = this.config.punctuate !== false;
    const smartFormat = this.config.smartFormat !== false;
    const interimResults = this.config.interimResults !== false;
    const endpointing = this.config.endpointing || 300;

    const params = new URLSearchParams({
      encoding: 'linear16',
      sample_rate: sampleRate.toString(),
      channels: '1',
      model,
      language,
      punctuate: punctuate.toString(),
      smart_format: smartFormat.toString(),
      interim_results: interimResults.toString(),
      endpointing: endpointing.toString(),
    });

    const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;

    return new Promise((resolve, reject) => {
      try {
        // Deepgram browser WebSocket auth via subprotocol ['token', apiKey]
        const ws = new WebSocket(url, ['token', this.config.apiKey!]);
        this.ws = ws;
        ws.binaryType = 'arraybuffer';

        ws.onopen = () => {
          this.setState('LISTENING');
          this.log('info', `Deepgram STT connected successfully (Model: ${model}, Language: ${language})`);
          this.startKeepAlive();
          resolve();
        };

        ws.onmessage = (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            this.handleDeepgramMessage(data);
          } catch (e) {
            this.log('warn', 'Failed to parse Deepgram message', e);
          }
        };

        ws.onerror = (event) => {
          const err = new Error('Deepgram WebSocket error');
          this.log('error', 'Deepgram WebSocket error encountered', event);
          this.notifyError(err);
          this.setState('ERROR');
          reject(err);
        };

        ws.onclose = (event) => {
          this.log('info', `Deepgram WebSocket closed [code: ${event.code}, reason: ${event.reason || 'Normal'}]`);
          this.stopKeepAlive();
          this.setState('DISCONNECTED');
        };
      } catch (err: any) {
        this.setState('ERROR');
        this.notifyError(err);
        reject(err);
      }
    });
  }

  public sendAudioChunk(
    chunk: Int16Array | ArrayBuffer,
    metadata?: { trackId?: string; speaker?: string; participantId?: number }
  ): void {
    if (metadata) {
      this.currentMetadata = { ...this.currentMetadata, ...metadata };
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      const buffer = chunk instanceof Int16Array ? chunk.buffer : chunk;
      this.ws.send(buffer);
    } catch (err: any) {
      this.log('warn', 'Failed to send audio chunk to Deepgram', err);
    }
  }

  public async disconnect(): Promise<void> {
    this.stopKeepAlive();

    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'CloseStream' }));
        } catch {
          // ignore
        }
        this.ws.close();
      }
      this.ws = undefined;
    }

    this.setState('DISCONNECTED');
    this.log('info', 'Deepgram STT engine disconnected.');
  }

  public onTranscript(listener: (segment: TranscriptSegment) => void): () => void {
    this.transcriptListeners.add(listener);
    return () => this.transcriptListeners.delete(listener);
  }

  public onError(listener: (err: Error) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  public onStateChange(listener: (state: STTEngineState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  private handleDeepgramMessage(data: Record<string, any>): void {
    if (data.type === 'Results' && data.channel?.alternatives?.[0]) {
      const alt = data.channel.alternatives[0];
      const text = (alt.transcript || '').trim();

      if (!text) {
        return;
      }

      const isFinal = Boolean(data.is_final || data.speech_final);
      const startTime = data.start ? Math.round(data.start * 1000) : undefined;
      const duration = data.duration ? Math.round(data.duration * 1000) : 0;
      const endTime = startTime !== undefined ? startTime + duration : undefined;

      const words: TranscriptWord[] = Array.isArray(alt.words)
        ? alt.words.map((w: any) => ({
            word: w.word,
            start: Math.round(w.start * 1000),
            end: Math.round(w.end * 1000),
            confidence: w.confidence,
            punctuatedWord: w.punctuated_word,
          }))
        : [];

      const segment: TranscriptSegment = {
        id: `dg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        speaker: this.currentMetadata.speaker || 'Meeting Participant',
        participantId: this.currentMetadata.participantId,
        trackId: this.currentMetadata.trackId,
        text,
        isFinal,
        confidence: alt.confidence,
        timestamp: Date.now(),
        startTime,
        endTime,
        words,
      };

      for (const listener of this.transcriptListeners) {
        listener(segment);
      }
    }
  }

  private startKeepAlive(): void {
    this.stopKeepAlive();
    this.keepAliveInterval = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'KeepAlive' }));
      }
    }, 8000);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = undefined;
    }
  }

  private setState(newState: STTEngineState): void {
    if (this.state !== newState) {
      this.state = newState;
      for (const listener of this.stateListeners) {
        listener(newState);
      }
    }
  }

  private notifyError(err: Error): void {
    for (const listener of this.errorListeners) {
      listener(err);
    }
  }

  private log(level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: unknown): void {
    if (this.config.logger) {
      this.config.logger(level, `[DeepgramSTT] ${message}`, data);
    } else {
      console.log(`[DeepgramSTT] ${message}`, data ?? '');
    }
  }
}
