import { ISTTEngine, STTConfig, STTEngineState, TranscriptSegment } from './types';

/**
 * Helper to encode raw 16-bit Linear PCM (16kHz) samples into a standard WAV file Blob.
 */
export function encodeWAV(samples: Int16Array, sampleRate = 16000, numChannels = 1): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // RIFF chunk length
  view.setUint32(4, 36 + samples.length * 2, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // format chunk identifier
  writeString(view, 12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw PCM = 1)
  view.setUint16(20, 1, true);
  // channel count
  view.setUint16(22, numChannels, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sampleRate * blockAlign)
  view.setUint32(28, sampleRate * numChannels * 2, true);
  // block align (numChannels * bytesPerSample)
  view.setUint16(32, numChannels * 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier
  writeString(view, 36, 'data');
  // data chunk length
  view.setUint32(40, samples.length * 2, true);

  // Write the PCM samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    view.setInt16(offset, samples[i], true);
  }

  return new Blob([view], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * BatchRecorderEngine collects 16kHz PCM audio throughout the meeting
 * and encodes it into a standard WAV audio payload for post-meeting batch transcription.
 */
export class BatchRecorderEngine implements ISTTEngine {
  private config: STTConfig;
  private state: STTEngineState = 'DISCONNECTED';
  private recordedChunks: Int16Array[] = [];
  private totalSamples = 0;
  private transcriptListeners: Set<(segment: TranscriptSegment) => void> = new Set();
  private errorListeners: Set<(err: Error) => void> = new Set();
  private stateListeners: Set<(state: STTEngineState) => void> = new Set();

  constructor(config: STTConfig) {
    this.config = config;
  }

  public async connect(): Promise<void> {
    this.recordedChunks = [];
    this.totalSamples = 0;
    this.setState('LISTENING');
    this.config.logger?.('info', '[BatchRecorderEngine] Ready to record audio buffers for batch upload');
  }

  public sendAudioChunk(chunk: Int16Array | ArrayBuffer, metadata?: { trackId?: string; speaker?: string; participantId?: number }): void {
    if (this.state !== 'LISTENING') return;

    const pcmChunk = chunk instanceof Int16Array ? chunk : new Int16Array(chunk);
    this.recordedChunks.push(pcmChunk);
    this.totalSamples += pcmChunk.length;
  }

  /**
   * Returns the total recorded duration in seconds.
   */
  public getDurationSeconds(): number {
    const sampleRate = this.config.sampleRate || 16000;
    return this.totalSamples / sampleRate;
  }

  /**
   * Compiles all recorded chunks into a single WAV Blob.
   */
  public getWavBlob(): Blob {
    const combined = new Int16Array(this.totalSamples);
    let offset = 0;
    for (const chunk of this.recordedChunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    return encodeWAV(combined, this.config.sampleRate || 16000, 1);
  }

  /**
   * Uploads the recorded WAV to FastAPI batch transcription endpoint.
   */
  public async finalizeAndUpload(meetingId: string, apiBaseUrl = 'http://localhost:8000'): Promise<TranscriptSegment[]> {
    if (this.totalSamples === 0) {
      this.config.logger?.('warn', '[BatchRecorderEngine] No audio recorded to upload');
      return [];
    }

    const wavBlob = this.getWavBlob();
    this.config.logger?.('info', `[BatchRecorderEngine] Uploading ${wavBlob.size} bytes (${this.getDurationSeconds().toFixed(1)}s) to ${apiBaseUrl}/api/meetings/${meetingId}/transcribe-batch`);

    const formData = new FormData();
    formData.append('audio_file', wavBlob, `meeting_${meetingId}.wav`);

    try {
      const response = await fetch(`${apiBaseUrl}/api/meetings/${meetingId}/transcribe-batch`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Batch upload failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const segments: TranscriptSegment[] = data.segments || [];

      for (const seg of segments) {
        for (const listener of this.transcriptListeners) {
          listener(seg);
        }
      }

      return segments;
    } catch (err: any) {
      this.config.logger?.('error', '[BatchRecorderEngine] Upload error', err);
      for (const listener of this.errorListeners) {
        listener(err);
      }
      throw err;
    }
  }

  public async disconnect(): Promise<void> {
    this.setState('DISCONNECTED');
    this.config.logger?.('info', `[BatchRecorderEngine] Recording stopped. Recorded ${this.getDurationSeconds().toFixed(1)}s of audio.`);
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

  public getState(): STTEngineState {
    return this.state;
  }

  private setState(state: STTEngineState) {
    this.state = state;
    for (const listener of this.stateListeners) {
      listener(state);
    }
  }
}
