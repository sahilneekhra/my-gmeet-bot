export interface AudioChunk {
  trackId: string;
  data: ArrayBuffer | Float32Array;
  timestamp: number;
}

export interface AudioSinkOptions {
  sampleRate?: number;
  bufferSize?: number;
  onAudioData?: (chunk: AudioChunk) => void;
}

/**
 * AudioSink attaches to WebRTC audio tracks to receive and process audio buffers.
 */
export class AudioSink {
  private attachedTracks: Map<string, MediaStreamTrack> = new Map();
  private isProcessing = false;

  constructor(
    private readonly options: AudioSinkOptions = {},
    private readonly logger?: (level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: unknown) => void
  ) {}

  /**
   * Attach an incoming audio track from WebRTC peer connection.
   */
  public attachTrack(track: MediaStreamTrack): void {
    if (track.kind !== 'audio') {
      throw new Error(`Cannot attach non-audio track of kind "${track.kind}" to AudioSink`);
    }

    this.attachedTracks.set(track.id, track);
    this.logger?.('info', `Audio track attached to sink: ${track.id} (label: ${track.label})`);

    track.onended = () => {
      this.detachTrack(track.id);
    };
  }

  /**
   * Detach an audio track from the sink.
   */
  public detachTrack(trackId: string): void {
    const track = this.attachedTracks.get(trackId);
    if (track) {
      this.attachedTracks.delete(trackId);
      this.logger?.('info', `Audio track detached from sink: ${trackId}`);
    }
  }

  /**
   * Get all active attached audio tracks.
   */
  public getTracks(): MediaStreamTrack[] {
    return Array.from(this.attachedTracks.values());
  }

  /**
   * Cleanup all tracks.
   */
  public destroy(): void {
    this.attachedTracks.clear();
    this.isProcessing = false;
  }
}
