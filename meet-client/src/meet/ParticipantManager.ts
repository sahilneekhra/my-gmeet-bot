import { MediaEntryInfo, ParticipantInfo } from '../types';

export class ParticipantManager {
  private participantsById: Map<number, ParticipantInfo> = new Map();
  private mediaEntriesById: Map<number, MediaEntryInfo> = new Map();
  private trackIdToMediaEntryId: Map<string, number> = new Map();

  private participantJoinedListeners: Set<(participant: ParticipantInfo) => void> = new Set();
  private participantLeftListeners: Set<(participant: ParticipantInfo) => void> = new Set();
  private mediaEntryChangedListeners: Set<(entry: MediaEntryInfo) => void> = new Set();

  constructor(
    private readonly participantsChannel?: RTCDataChannel,
    private readonly mediaEntriesChannel?: RTCDataChannel,
    private readonly logger?: (level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: unknown) => void
  ) {
    if (this.participantsChannel) {
      this.setupParticipantsChannel(this.participantsChannel);
    }
    if (this.mediaEntriesChannel) {
      this.setupMediaEntriesChannel(this.mediaEntriesChannel);
    }
  }

  public getAllParticipants(): ParticipantInfo[] {
    return Array.from(this.participantsById.values());
  }

  public getParticipantById(id: number): ParticipantInfo | undefined {
    return this.participantsById.get(id);
  }

  public getParticipantByTrackId(trackId: string): ParticipantInfo | undefined {
    const entryId = this.trackIdToMediaEntryId.get(trackId);
    if (!entryId) return undefined;
    const entry = this.mediaEntriesById.get(entryId);
    if (!entry || entry.participantId === undefined) return undefined;
    return this.participantsById.get(entry.participantId);
  }

  public getMediaEntryById(id: number): MediaEntryInfo | undefined {
    return this.mediaEntriesById.get(id);
  }

  public onParticipantJoined(listener: (p: ParticipantInfo) => void): () => void {
    this.participantJoinedListeners.add(listener);
    return () => this.participantJoinedListeners.delete(listener);
  }

  public onParticipantLeft(listener: (p: ParticipantInfo) => void): () => void {
    this.participantLeftListeners.add(listener);
    return () => this.participantLeftListeners.delete(listener);
  }

  public onMediaEntryChanged(listener: (entry: MediaEntryInfo) => void): () => void {
    this.mediaEntryChangedListeners.add(listener);
    return () => this.mediaEntryChangedListeners.delete(listener);
  }

  public bindTrackToMediaEntry(trackId: string, mediaEntryId: number): void {
    this.trackIdToMediaEntryId.set(trackId, mediaEntryId);
    const entry = this.mediaEntriesById.get(mediaEntryId);
    if (entry) {
      entry.trackId = trackId;
    }
  }

  private setupParticipantsChannel(channel: RTCDataChannel): void {
    channel.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        this.handleParticipantsMessage(data);
      } catch (err) {
        this.logger?.('error', 'Error parsing participants channel data', err);
      }
    };
  }

  private handleParticipantsMessage(data: Record<string, any>): void {
    // Handle deleted participants
    if (Array.isArray(data.deletedResources)) {
      for (const deleted of data.deletedResources) {
        const existing = this.participantsById.get(deleted.id);
        if (existing) {
          this.participantsById.delete(deleted.id);
          this.logger?.('info', `Participant left: ${existing.displayName} (${existing.name})`);
          for (const listener of this.participantLeftListeners) {
            listener(existing);
          }
        }
      }
    }

    // Handle added / updated participants
    if (Array.isArray(data.resources)) {
      for (const res of data.resources) {
        if (res.id === undefined) continue;

        const participantObj = res.participant || {};
        let displayName = 'Unknown Participant';

        if (participantObj.signedinUser?.displayName) {
          displayName = participantObj.signedinUser.displayName;
        } else if (participantObj.anonymousUser?.displayName) {
          displayName = participantObj.anonymousUser.displayName;
        } else if (participantObj.phoneUser?.displayName) {
          displayName = participantObj.phoneUser.displayName;
        }

        const participant: ParticipantInfo = {
          id: res.id,
          name: participantObj.name || `participants/${res.id}`,
          displayName,
          role: participantObj.role,
          isHost: participantObj.isHost ?? false,
        };

        const isNew = !this.participantsById.has(res.id);
        this.participantsById.set(res.id, participant);

        if (isNew) {
          this.logger?.('info', `Participant joined: ${displayName} [ID: ${res.id}]`);
          for (const listener of this.participantJoinedListeners) {
            listener(participant);
          }
        }
      }
    }
  }

  private setupMediaEntriesChannel(channel: RTCDataChannel): void {
    channel.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMediaEntriesMessage(data);
      } catch (err) {
        this.logger?.('error', 'Error parsing media-entries channel data', err);
      }
    };
  }

  private handleMediaEntriesMessage(data: Record<string, any>): void {
    if (Array.isArray(data.resources)) {
      for (const res of data.resources) {
        if (res.id === undefined) continue;

        const existing: MediaEntryInfo = this.mediaEntriesById.get(res.id) || { id: res.id };
        if (res.mediaEntry?.participantId !== undefined) {
          existing.participantId = res.mediaEntry.participantId;
        }
        if (res.mediaEntry?.isMuted !== undefined) {
          existing.isMuted = res.mediaEntry.isMuted;
        }
        if (res.mediaEntry?.mediaType) {
          existing.mediaType = res.mediaEntry.mediaType === 'MEDIA_TYPE_AUDIO' ? 'audio' : 'video';
        }

        this.mediaEntriesById.set(res.id, existing);

        for (const listener of this.mediaEntryChangedListeners) {
          listener(existing);
        }
      }
    }
  }
}
