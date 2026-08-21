import { BatchRecorderEngine } from './BatchRecorderEngine';
import { DeepgramSTTEngine } from './DeepgramSTTEngine';
import { ISTTEngine, STTConfig } from './types';
import { WebSpeechSTTEngine } from './WebSpeechSTTEngine';

export * from './types';
export * from './DeepgramSTTEngine';
export * from './WebSpeechSTTEngine';
export * from './BatchRecorderEngine';

/**
 * Factory function to create the appropriate STT engine according to config.
 */
export function createSTTEngine(config: STTConfig): ISTTEngine {
  if (config.provider === 'deepgram') {
    return new DeepgramSTTEngine(config);
  } else if (config.provider === 'webspeech') {
    return new WebSpeechSTTEngine(config);
  } else if (config.provider === 'batch') {
    return new BatchRecorderEngine(config);
  }

  throw new Error(`Unsupported STT provider: "${(config as any).provider}". Supported: "deepgram", "webspeech", "batch"`);
}

