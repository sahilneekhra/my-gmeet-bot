import { ISTTEngine, STTConfig, STTEngineState, TranscriptSegment } from './types';

// Declare types for Web Speech API in browsers
interface IWindowWithSpeech extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}

export class WebSpeechSTTEngine implements ISTTEngine {
  private recognition: any;
  private state: STTEngineState = 'DISCONNECTED';
  private shouldBeListening = false;
  private currentMetadata: { trackId?: string; speaker?: string; participantId?: number } = {};

  private transcriptListeners: Set<(segment: TranscriptSegment) => void> = new Set();
  private errorListeners: Set<(err: Error) => void> = new Set();
  private stateListeners: Set<(state: STTEngineState) => void> = new Set();

  constructor(private readonly config: STTConfig) {}

  public getState(): STTEngineState {
    return this.state;
  }

  public async connect(): Promise<void> {
    const win = window as unknown as IWindowWithSpeech;
    const SpeechRecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      const err = new Error('Web Speech API is not supported in this browser environment. Use Chrome or Edge.');
      this.notifyError(err);
      this.setState('ERROR');
      throw err;
    }

    try {
      this.recognition = new SpeechRecognitionClass();
      this.recognition.continuous = true;
      this.recognition.interimResults = this.config.interimResults !== false;
      this.recognition.lang = this.config.language || 'en-US';

      this.recognition.onstart = () => {
        this.setState('LISTENING');
        this.log('info', `Web Speech STT started (Language: ${this.recognition.lang})`);
      };

      this.recognition.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const isFinal = result.isFinal;
          const text = result[0]?.transcript?.trim();
          const confidence = result[0]?.confidence;

          if (text) {
            const segment: TranscriptSegment = {
              id: `ws_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              speaker: this.currentMetadata.speaker || 'Meeting Participant',
              participantId: this.currentMetadata.participantId,
              trackId: this.currentMetadata.trackId,
              text,
              isFinal,
              confidence,
              timestamp: Date.now(),
            };

            for (const listener of this.transcriptListeners) {
              listener(segment);
            }
          }
        }
      };

      this.recognition.onerror = (event: any) => {
        if (event.error === 'no-speech') {
          // Normal timeout when no speech is detected; ignore
          return;
        }
        this.log('warn', `Web Speech Recognition error: ${event.error}`, event);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          const err = new Error(`Microphone/Speech permission denied: ${event.error}`);
          this.notifyError(err);
          this.setState('ERROR');
        }
      };

      this.recognition.onend = () => {
        if (this.shouldBeListening) {
          // Automatically restart continuous recognition if unexpected stop
          try {
            this.recognition.start();
          } catch {
            this.setState('DISCONNECTED');
          }
        } else {
          this.setState('DISCONNECTED');
        }
      };

      this.shouldBeListening = true;
      this.recognition.start();
    } catch (err: any) {
      this.setState('ERROR');
      this.notifyError(err);
      throw err;
    }
  }

  public sendAudioChunk(
    _chunk: Int16Array | ArrayBuffer,
    metadata?: { trackId?: string; speaker?: string; participantId?: number }
  ): void {
    if (metadata) {
      this.currentMetadata = { ...this.currentMetadata, ...metadata };
    }
    // Web Speech API captures through browser audio graph / system mic directly.
  }

  public async disconnect(): Promise<void> {
    this.shouldBeListening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // ignore
      }
      this.recognition = undefined;
    }
    this.setState('DISCONNECTED');
    this.log('info', 'Web Speech STT engine stopped.');
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
      this.config.logger(level, `[WebSpeechSTT] ${message}`, data);
    } else {
      console.log(`[WebSpeechSTT] ${message}`, data ?? '');
    }
  }
}
