export type STTProvider = 'deepgram' | 'webspeech' | 'batch';

export type STTEngineState = 'DISCONNECTED' | 'CONNECTING' | 'LISTENING' | 'ERROR';

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  confidence?: number;
  punctuatedWord?: string;
}

export interface TranscriptSegment {
  id: string;
  speaker: string;
  participantId?: number;
  trackId?: string;
  text: string;
  isFinal: boolean;
  confidence?: number;
  timestamp: number;
  startTime?: number;
  endTime?: number;
  words?: TranscriptWord[];
}

export interface STTConfig {
  provider: STTProvider;
  apiKey?: string;
  language?: string;
  sampleRate?: number;
  model?: string;
  punctuate?: boolean;
  smartFormat?: boolean;
  interimResults?: boolean;
  endpointing?: number;
  logger?: (level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: unknown) => void;
}

export interface ISTTEngine {
  connect(): Promise<void>;
  sendAudioChunk(chunk: Int16Array | ArrayBuffer, metadata?: { trackId?: string; speaker?: string; participantId?: number }): void;
  disconnect(): Promise<void>;
  onTranscript(listener: (segment: TranscriptSegment) => void): () => void;
  onError(listener: (err: Error) => void): () => void;
  onStateChange(listener: (state: STTEngineState) => void): () => void;
  getState(): STTEngineState;
}
