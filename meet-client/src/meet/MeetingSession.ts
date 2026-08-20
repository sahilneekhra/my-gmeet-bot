import { DisconnectReason, SessionState } from '../types';

export class MeetingSession {
  private _state: SessionState = 'DISCONNECTED';
  private _disconnectReason?: DisconnectReason;
  private stateListeners: Set<(state: SessionState, reason?: DisconnectReason) => void> = new Set();
  private leaveResolver?: () => void;

  constructor(
    private readonly dataChannel: RTCDataChannel,
    private readonly logger?: (level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: unknown) => void
  ) {
    this.setupDataChannel();
  }

  public get state(): SessionState {
    return this._state;
  }

  public get disconnectReason(): DisconnectReason | undefined {
    return this._disconnectReason;
  }

  public onStateChange(listener: (state: SessionState, reason?: DisconnectReason) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  private setState(state: SessionState, reason?: DisconnectReason): void {
    if (this._state === state && this._disconnectReason === reason) return;
    this._state = state;
    this._disconnectReason = reason;
    this.logger?.('info', `Session state changed to ${state}`, { reason });
    for (const listener of this.stateListeners) {
      try {
        listener(state, reason);
      } catch (err) {
        this.logger?.('error', 'Error in session state listener', err);
      }
    }
  }

  private setupDataChannel(): void {
    this.dataChannel.onopen = () => {
      this.logger?.('debug', 'Session control data channel opened');
      this.setState('WAITING');
    };

    this.dataChannel.onmessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (err) {
        this.logger?.('error', 'Failed to parse session-control message', { error: err, data: event.data });
      }
    };

    this.dataChannel.onclose = () => {
      this.logger?.('debug', 'Session control data channel closed');
      this.leaveResolver?.();
      if (this._state !== 'DISCONNECTED') {
        this.setState('DISCONNECTED', 'SESSION_UNHEALTHY');
      }
    };

    this.dataChannel.onerror = (event) => {
      this.logger?.('error', 'Session control data channel error', event);
    };
  }

  private handleMessage(msg: Record<string, any>): void {
    this.logger?.('debug', 'Session control message received', msg);

    if (msg?.response) {
      this.leaveResolver?.();
    }

    if (Array.isArray(msg?.resources) && msg.resources.length > 0) {
      const status = msg.resources[0]?.sessionStatus;
      if (!status) return;

      const connectionState = status.connectionState;
      if (connectionState === 'STATE_WAITING') {
        this.setState('WAITING');
      } else if (connectionState === 'STATE_JOINED') {
        this.setState('JOINED');
      } else if (connectionState === 'STATE_DISCONNECTED') {
        const rawReason = status.disconnectReason || '';
        let reason: DisconnectReason = 'UNKNOWN';
        if (rawReason === 'REASON_CLIENT_LEFT') reason = 'CLIENT_LEFT';
        else if (rawReason === 'REASON_USER_STOPPED') reason = 'USER_STOPPED';
        else if (rawReason === 'REASON_CONFERENCE_ENDED') reason = 'CONFERENCE_ENDED';
        else if (rawReason === 'REASON_SESSION_UNHEALTHY') reason = 'SESSION_UNHEALTHY';

        this.setState('DISCONNECTED', reason);
      }
    }
  }

  /**
   * Leave the Google Meet conference gracefully.
   */
  public async leave(): Promise<void> {
    if (this.dataChannel.readyState !== 'open') {
      this.setState('DISCONNECTED', 'CLIENT_LEFT');
      return;
    }

    return new Promise<void>((resolve) => {
      this.leaveResolver = resolve;
      const payload = {
        sessionControl: {
          leaveSession: {},
        },
      };

      try {
        this.dataChannel.send(JSON.stringify(payload));
        // Fallback timeout in case no response packet returns
        setTimeout(() => {
          this.setState('DISCONNECTED', 'CLIENT_LEFT');
          resolve();
        }, 2000);
      } catch (err) {
        this.logger?.('error', 'Failed to send leave request', err);
        this.setState('DISCONNECTED', 'CLIENT_LEFT');
        resolve();
      }
    });
  }
}
