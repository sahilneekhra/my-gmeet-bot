export interface AudioProcessorOptions {
  targetSampleRate?: number; // default: 16000
  bufferSize?: number; // default: 4096
  onAudioData?: (pcmData: Int16Array, rmsVolume: number) => void;
  onVolumeChange?: (volume: number) => void;
}

/**
 * AudioProcessor captures audio from a MediaStreamTrack, resamples it to 16kHz,
 * converts it into 16-bit Linear PCM (Int16Array), and calculates real-time RMS volume.
 */
export class AudioProcessor {
  private audioContext?: AudioContext;
  private sourceNode?: MediaStreamAudioSourceNode;
  private processorNode?: ScriptProcessorNode;
  private isRunning = false;
  private readonly targetSampleRate: number;
  private readonly bufferSize: number;

  constructor(
    private readonly track: MediaStreamTrack,
    private readonly options: AudioProcessorOptions = {},
    private readonly logger?: (level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: unknown) => void
  ) {
    this.targetSampleRate = options.targetSampleRate || 16000;
    this.bufferSize = options.bufferSize || 4096;
  }

  /**
   * Starts capturing and processing audio from the track.
   */
  public start(): void {
    if (this.isRunning) return;

    if (this.track.readyState === 'ended') {
      this.logger?.('warn', `Cannot start AudioProcessor: track ${this.track.id} has already ended`);
      return;
    }

    try {
      // Create Web Audio context
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioCtx();

      const mediaStream = new MediaStream([this.track]);
      this.sourceNode = this.audioContext.createMediaStreamSource(mediaStream);

      // Create processor node (bufferSize, 1 input channel, 1 output channel)
      this.processorNode = this.audioContext.createScriptProcessor(this.bufferSize, 1, 1);

      const sourceSampleRate = this.audioContext.sampleRate;

      this.processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
        if (!this.isRunning) return;

        const inputBuffer = event.inputBuffer.getChannelData(0);
        if (!inputBuffer || inputBuffer.length === 0) return;

        // Calculate RMS Volume
        let sumSquares = 0;
        for (let i = 0; i < inputBuffer.length; i++) {
          sumSquares += inputBuffer[i] * inputBuffer[i];
        }
        const rms = Math.sqrt(sumSquares / inputBuffer.length);
        const volume = Math.min(100, Math.round(rms * 250)); // Scaled volume 0-100

        this.options.onVolumeChange?.(volume);

        // Resample and convert to 16-bit Linear PCM
        const pcm16 = this.downsampleAndEncodePCM16(inputBuffer, sourceSampleRate, this.targetSampleRate);

        if (this.options.onAudioData) {
          this.options.onAudioData(pcm16, volume);
        }
      };

      // Connect nodes: Source -> ScriptProcessor -> MuteGain -> Destination
      const muteGain = this.audioContext.createGain();
      muteGain.gain.value = 0;

      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(muteGain);
      muteGain.connect(this.audioContext.destination);

      this.isRunning = true;
      this.logger?.('info', `AudioProcessor started for track ${this.track.id} (Resampling: ${sourceSampleRate}Hz -> ${this.targetSampleRate}Hz)`);
    } catch (err) {
      this.logger?.('error', `Failed to start AudioProcessor for track ${this.track.id}`, err);
      this.stop();
    }
  }

  /**
   * Resamples Float32 audio samples from source sample rate to target sample rate,
   * converting to signed 16-bit linear PCM (Int16Array).
   */
  private downsampleAndEncodePCM16(
    input: Float32Array,
    sourceRate: number,
    targetRate: number
  ): Int16Array {
    if (sourceRate === targetRate) {
      const output = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      return output;
    }

    const sampleRateRatio = sourceRate / targetRate;
    const newLength = Math.round(input.length / sampleRateRatio);
    const result = new Int16Array(newLength);

    let offsetResult = 0;
    let offsetInput = 0;

    while (offsetResult < result.length) {
      const nextOffsetInput = Math.round((offsetResult + 1) * sampleRateRatio);
      let accum = 0;
      let count = 0;

      for (let i = offsetInput; i < nextOffsetInput && i < input.length; i++) {
        accum += input[i];
        count++;
      }

      const sample = count > 0 ? accum / count : input[Math.min(offsetInput, input.length - 1)];
      const clamped = Math.max(-1, Math.min(1, sample));
      result[offsetResult] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;

      offsetResult++;
      offsetInput = nextOffsetInput;
    }

    return result;
  }

  /**
   * Stops audio processing and releases Web Audio resources.
   */
  public stop(): void {
    this.isRunning = false;

    if (this.processorNode) {
      this.processorNode.onaudioprocess = null;
      this.processorNode.disconnect();
      this.processorNode = undefined;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = undefined;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = undefined;
    }

    this.logger?.('info', `AudioProcessor stopped for track ${this.track.id}`);
  }

  public getTrack(): MediaStreamTrack {
    return this.track;
  }

  public isActive(): boolean {
    return this.isRunning;
  }
}
