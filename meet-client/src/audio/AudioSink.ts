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
 * AudioSink attaches to WebRTC audio tracks to receive and manage audio streams.
 */
export class AudioSink {
  private attachedTracks: Map<string, MediaStreamTrack> = new Map();
  private trackAttachedListeners: Set<(track: MediaStreamTrack) => void> = new Set();
  private trackDetachedListeners: Set<(trackId: string) => void> = new Set();

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

    if (this.attachedTracks.has(track.id)) {
      return;
    }

    this.attachedTracks.set(track.id, track);
    this.logger?.('info', `Audio track attached to sink: ${track.id} (label: ${track.label})`);

    track.onended = () => {
      this.detachTrack(track.id);
    };

    for (const listener of this.trackAttachedListeners) {
      listener(track);
    }
  }

  /**
   * Detach an audio track from the sink.
   */
  public detachTrack(trackId: string): void {
    const track = this.attachedTracks.get(trackId);
    if (track) {
      this.attachedTracks.delete(trackId);
      this.logger?.('info', `Audio track detached from sink: ${trackId}`);

      for (const listener of this.trackDetachedListeners) {
        listener(trackId);
      }
    }
  }

  public onTrackAttached(listener: (track: MediaStreamTrack) => void): () => void {
    this.trackAttachedListeners.add(listener);
    return () => this.trackAttachedListeners.delete(listener);
  }

  public onTrackDetached(listener: (trackId: string) => void): () => void {
    this.trackDetachedListeners.add(listener);
    return () => this.trackDetachedListeners.delete(listener);
  }

  /**
   * Get all active attached audio tracks.
   */
  public getTracks(): MediaStreamTrack[] {
    return Array.from(this.attachedTracks.values());
  }

  /**
   * Get track by ID.
   */
  public getTrack(trackId: string): MediaStreamTrack | undefined {
    return this.attachedTracks.get(trackId);
  }

  /**
   * Cleanup all tracks.
   */
  public destroy(): void {
    for (const trackId of Array.from(this.attachedTracks.keys())) {
      this.detachTrack(trackId);
    }
    this.attachedTracks.clear();
    this.trackAttachedListeners.clear();
    this.trackDetachedListeners.clear();
  }
}
