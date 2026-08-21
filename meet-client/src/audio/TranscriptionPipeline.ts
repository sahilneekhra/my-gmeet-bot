import { ParticipantManager } from '../meet/ParticipantManager';
import { ISTTEngine, TranscriptSegment } from '../stt';
import { ParticipantInfo } from '../types';
import { AudioProcessor } from './AudioProcessor';
import { AudioSink } from './AudioSink';

export interface AudioLevelEvent {
  trackId: string;
  volume: number;
  participant?: ParticipantInfo;
}

export interface TranscriptionPipelineOptions {
  sampleRate?: number;
  bufferSize?: number;
  logger?: (level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: unknown) => void;
}

/**
 * TranscriptionPipeline orchestrates incoming audio streams from AudioSink,
 * downsamples/resamples audio via AudioProcessor, associates speakers via ParticipantManager,
 * and streams to an ISTTEngine to deliver real-time transcript segments.
 */
export class TranscriptionPipeline {
  private processors: Map<string, AudioProcessor> = new Map();
  private isRunning = false;

  private transcriptListeners: Set<(segment: TranscriptSegment) => void> = new Set();
  private audioLevelListeners: Set<(event: AudioLevelEvent) => void> = new Set();

  private unsubscribeSinkAttached?: () => void;
  private unsubscribeSinkDetached?: () => void;
  private unsubscribeSTTTranscript?: () => void;

  constructor(
    private readonly audioSink: AudioSink,
    private readonly participantManager: ParticipantManager | undefined,
    private readonly sttEngine: ISTTEngine,
    private readonly options: TranscriptionPipelineOptions = {}
  ) {}

  /**
   * Starts the transcription pipeline.
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.log('info', 'Starting Transcription Pipeline...');

    // 1. Connect STT Engine
    await this.sttEngine.connect();

    // 2. Listen to STT Engine transcripts
    this.unsubscribeSTTTranscript = this.sttEngine.onTranscript((segment) => {
      // Enrich with latest participant info if available
      if (segment.trackId && this.participantManager) {
        const participant = this.participantManager.getParticipantByTrackId(segment.trackId);
        if (participant) {
          segment.speaker = participant.displayName;
          segment.participantId = participant.id;
        }
      }

      for (const listener of this.transcriptListeners) {
        listener(segment);
      }
    });

    // 3. Attach processor to existing tracks in sink
    for (const track of this.audioSink.getTracks()) {
      this.attachTrackProcessor(track);
    }

    // 4. Listen for future tracks attached/detached in sink
    this.unsubscribeSinkAttached = this.audioSink.onTrackAttached((track) => {
      this.attachTrackProcessor(track);
    });

    this.unsubscribeSinkDetached = this.audioSink.onTrackDetached((trackId) => {
      this.detachTrackProcessor(trackId);
    });

    this.log('info', 'Transcription Pipeline running.');
  }

  /**
   * Returns the underlying STT engine instance.
   */
  public getSTTEngine(): ISTTEngine {
    return this.sttEngine;
  }

  /**
   * Stops the transcription pipeline and detaches all audio processors.
   */
  public async stop(): Promise<void> {
    this.isRunning = false;

    if (this.unsubscribeSinkAttached) {
      this.unsubscribeSinkAttached();
      this.unsubscribeSinkAttached = undefined;
    }

    if (this.unsubscribeSinkDetached) {
      this.unsubscribeSinkDetached();
      this.unsubscribeSinkDetached = undefined;
    }

    if (this.unsubscribeSTTTranscript) {
      this.unsubscribeSTTTranscript();
      this.unsubscribeSTTTranscript = undefined;
    }

    // Stop all audio processors
    for (const [trackId, processor] of this.processors.entries()) {
      processor.stop();
      this.processors.delete(trackId);
    }

    await this.sttEngine.disconnect();
    this.log('info', 'Transcription Pipeline stopped.');
  }

  /**
   * Subscribe to interim and finalized transcript segments.
   */
  public onTranscript(listener: (segment: TranscriptSegment) => void): () => void {
    this.transcriptListeners.add(listener);
    return () => this.transcriptListeners.delete(listener);
  }

  /**
   * Subscribe to real-time audio volume levels for UI VU meters.
   */
  public onAudioLevel(listener: (event: AudioLevelEvent) => void): () => void {
    this.audioLevelListeners.add(listener);
    return () => this.audioLevelListeners.delete(listener);
  }

  private attachTrackProcessor(track: MediaStreamTrack): void {
    if (this.processors.has(track.id)) {
      return;
    }

    this.log('info', `Attaching AudioProcessor to track ${track.id}`);

    const processor = new AudioProcessor(
      track,
      {
        targetSampleRate: this.options.sampleRate || 16000,
        bufferSize: this.options.bufferSize || 4096,
        onAudioData: (pcmData, volume) => {
          if (!this.isRunning) return;

          const participant = this.participantManager?.getParticipantByTrackId(track.id);
          const speaker = participant?.displayName || 'Speaker';
          const participantId = participant?.id;

          this.sttEngine.sendAudioChunk(pcmData, {
            trackId: track.id,
            speaker,
            participantId,
          });

          for (const listener of this.audioLevelListeners) {
            listener({
              trackId: track.id,
              volume,
              participant,
            });
          }
        },
      },
      this.options.logger
    );

    this.processors.set(track.id, processor);
    processor.start();
  }

  private detachTrackProcessor(trackId: string): void {
    const processor = this.processors.get(trackId);
    if (processor) {
      processor.stop();
      this.processors.delete(trackId);
      this.log('info', `Detached AudioProcessor for track ${trackId}`);
    }
  }

  private log(level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: unknown): void {
    if (this.options.logger) {
      this.options.logger(level, `[TranscriptionPipeline] ${message}`, data);
    } else {
      console.log(`[TranscriptionPipeline] ${message}`, data ?? '');
    }
  }
}
