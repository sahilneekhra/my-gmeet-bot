/**
 * Configuration options for connecting to Google Meet Media API.
 */
export interface MeetClientConfig {
  /**
   * The meeting space ID or resource name (e.g. "spaces/xyz-abcd-efg" or "xyz-abcd-efg").
   */
  meetingSpaceId: string;

  /**
   * Valid OAuth 2.0 Access Token with Google Meet permissions.
   */
  accessToken: string;

  /**
   * Base URL for Google Meet REST API (defaults to https://meet.googleapis.com/v2beta/).
   */
  apiUrl?: string;

  /**
   * Number of incoming video streams to negotiate (0 to 3, default: 0 for audio-only bot).
   */
  numberOfVideoStreams?: number;

  /**
   * Whether to receive audio streams (default: true).
   */
  enableAudio?: boolean;

  /**
   * Custom STUN/TURN ICE servers configuration.
   */
  iceServers?: RTCIceServer[];

  /**
   * Optional custom logger.
   */
  logger?: (level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: unknown) => void;
}

/**
 * Lifecycle states of the Meet session.
 */
export type SessionState =
  | 'DISCONNECTED'
  | 'INITIALIZING'
  | 'WAITING'
  | 'JOINED';

/**
 * Disconnect reasons returned by Google Meet.
 */
export type DisconnectReason =
  | 'CLIENT_LEFT'
  | 'USER_STOPPED'
  | 'CONFERENCE_ENDED'
  | 'SESSION_UNHEALTHY'
  | 'UNKNOWN';

export interface ParticipantInfo {
  id: number;
  name: string; // e.g. "spaces/xxx/participants/yyy"
  displayName: string;
  role?: string;
  isHost?: boolean;
}

export interface MediaEntryInfo {
  id: number;
  participantId?: number;
  trackId?: string;
  ssrc?: number;
  mediaType?: 'audio' | 'video';
  isMuted?: boolean;
}

export interface ActiveSpeakerEvent {
  participant?: ParticipantInfo;
  mediaEntryId: number;
  audioTrack?: MediaStreamTrack;
  timestamp: number;
}
