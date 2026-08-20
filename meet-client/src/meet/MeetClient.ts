import { AudioSink } from '../audio/AudioSink';
import { MeetClientConfig } from '../types';
import { MediaStatsHandler } from './MediaStatsHandler';
import { MeetingSession } from './MeetingSession';
import { ParticipantManager } from './ParticipantManager';

const DEFAULT_MEET_API_URL = 'https://meet.googleapis.com/v2beta/';
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
];
const NUM_AUDIO_TRANSCEIVERS = 3;

export class MeetClient {
  private peerConnection?: RTCPeerConnection;
  private session?: MeetingSession;
  private participantManager?: ParticipantManager;
  private mediaStatsHandler?: MediaStatsHandler;
  private audioSink: AudioSink;

  private onTrackListeners: Set<(track: MediaStreamTrack, receiver: RTCRtpReceiver) => void> = new Set();

  constructor(private readonly config: MeetClientConfig) {
    this.audioSink = new AudioSink({}, this.config.logger);
  }

  public getSession(): MeetingSession | undefined {
    return this.session;
  }

  public getParticipantManager(): ParticipantManager | undefined {
    return this.participantManager;
  }

  public getMediaStatsHandler(): MediaStatsHandler | undefined {
    return this.mediaStatsHandler;
  }

  public getAudioSink(): AudioSink {
    return this.audioSink;
  }

  public onTrack(listener: (track: MediaStreamTrack, receiver: RTCRtpReceiver) => void): () => void {
    this.onTrackListeners.add(listener);
    return () => this.onTrackListeners.delete(listener);
  }

  /**
   * Connects the bot to the active Google Meet conference via WebRTC.
   */
  public async join(): Promise<MeetingSession> {
    this.log('info', 'Starting Google Meet WebRTC connection...');

    const pcConfig: RTCConfiguration = {
      iceServers: this.config.iceServers || DEFAULT_ICE_SERVERS,
      bundlePolicy: 'max-bundle',
    };

    const pc = new RTCPeerConnection(pcConfig);
    this.peerConnection = pc;

    // Connection & ICE state monitoring
    pc.oniceconnectionstatechange = () => {
      this.log('info', `ICE Connection State: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed') {
        this.log('error', 'ICE Connection failed. Check network firewall and STUN configuration.');
      }
    };

    pc.onconnectionstatechange = () => {
      this.log('info', `PeerConnection State: ${pc.connectionState}`);
    };

    // Handle incoming media tracks (audio / video)
    pc.ontrack = (event: RTCTrackEvent) => {
      this.log('info', `Received WebRTC track: ${event.track.kind} (${event.track.id})`);

      if (event.track.kind === 'audio') {
        this.audioSink.attachTrack(event.track);
      }

      for (const listener of this.onTrackListeners) {
        listener(event.track, event.receiver);
      }
    };

    // 1. Add Audio Transceivers (Strict order: Audio first)
    const enableAudio = this.config.enableAudio ?? true;
    if (enableAudio) {
      for (let i = 0; i < NUM_AUDIO_TRANSCEIVERS; i++) {
        pc.addTransceiver('audio', { direction: 'recvonly' });
      }
    }

    // 2. Add Data Channels (Ordered & reliable)
    const dcConfig: RTCDataChannelInit = {
      ordered: true,
    };

    const sessionControlChannel = pc.createDataChannel('session-control', dcConfig);
    const mediaStatsChannel = pc.createDataChannel('media-stats', dcConfig);
    const mediaEntriesChannel = pc.createDataChannel('media-entries', dcConfig);
    const participantsChannel = pc.createDataChannel('participants', dcConfig);

    const videoStreamsCount = this.config.numberOfVideoStreams ?? 0;
    if (videoStreamsCount > 0) {
      pc.createDataChannel('video-assignment', dcConfig);
    }

    // Instantiate Managers & Handlers
    this.session = new MeetingSession(sessionControlChannel, this.config.logger);
    this.participantManager = new ParticipantManager(
      participantsChannel,
      mediaEntriesChannel,
      this.config.logger
    );
    this.mediaStatsHandler = new MediaStatsHandler(mediaStatsChannel, pc, this.config.logger);

    // 3. Create initial offer before adding video transceivers to lock media section order
    let offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // 4. Add Video Transceivers (if enabled)
    for (let i = 0; i < videoStreamsCount; i++) {
      pc.addTransceiver('video', { direction: 'recvonly' });
    }

    // 5. Generate final SDP Offer
    offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    if (!offer.sdp) {
      throw new Error('Failed to generate local SDP offer');
    }

    this.log('debug', 'Local SDP offer generated, sending to Google Meet Media API...');

    // 6. Send Offer to Google Meet REST API
    const spaceId = this.normalizeSpaceId(this.config.meetingSpaceId);
    const apiUrl = (this.config.apiUrl || DEFAULT_MEET_API_URL).replace(/\/+$/, '');
    const connectUrl = `${apiUrl}/${spaceId}:connectActiveConference`;

    const response = await fetch(connectUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        offer: offer.sdp,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorDetails: unknown = errorText;
      try {
        errorDetails = JSON.parse(errorText);
      } catch {
        // use raw text
      }
      this.log('error', `connectActiveConference failed [${response.status}]`, errorDetails);
      throw new Error(`Google Meet API rejected connection (${response.status}): ${errorText}`);
    }

    const payload = (await response.json()) as { answer?: string };
    if (!payload.answer) {
      throw new Error('Google Meet API response did not contain an SDP answer');
    }

    this.log('info', 'Received SDP answer from Google Meet API, setting remote description...');

    // 7. Apply Remote SDP Answer
    await pc.setRemoteDescription({
      type: 'answer',
      sdp: payload.answer,
    });

    this.log('info', 'WebRTC negotiation completed successfully.');
    return this.session;
  }

  /**
   * Disconnects the WebRTC peer connection and cleans up all resources.
   */
  public async disconnect(): Promise<void> {
    if (this.mediaStatsHandler) {
      this.mediaStatsHandler.stop();
      this.mediaStatsHandler = undefined;
    }

    if (this.session) {
      await this.session.leave();
    }

    this.audioSink.destroy();

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = undefined;
    }

    this.log('info', 'MeetClient disconnected and cleaned up.');
  }

  private normalizeSpaceId(spaceId: string): string {
    const trimmed = spaceId.trim();
    if (trimmed.startsWith('spaces/')) {
      return trimmed;
    }
    return `spaces/${trimmed}`;
  }

  private log(level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: unknown): void {
    if (this.config.logger) {
      this.config.logger(level, message, data);
    } else if (level === 'error') {
      console.error(`[MeetClient] ${message}`, data ?? '');
    } else {
      console.log(`[MeetClient] ${message}`, data ?? '');
    }
  }
}
