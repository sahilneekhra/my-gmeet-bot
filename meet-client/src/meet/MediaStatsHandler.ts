export class MediaStatsHandler {
  private statsInterval?: NodeJS.Timeout | number;
  private readonly intervalMs: number = 2000;

  constructor(
    private readonly dataChannel: RTCDataChannel,
    private readonly peerConnection: RTCPeerConnection,
    private readonly logger?: (level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: unknown) => void
  ) {
    this.setupChannel();
  }

  private setupChannel(): void {
    this.dataChannel.onopen = () => {
      this.logger?.('debug', 'Media stats data channel opened. Starting periodic keepalive.');
      this.startStatsReporting();
    };

    this.dataChannel.onclose = () => {
      this.logger?.('debug', 'Media stats data channel closed. Stopping stats reporting.');
      this.stop();
    };

    this.dataChannel.onmessage = (event: MessageEvent) => {
      this.logger?.('debug', 'Media stats message received from Google Meet', event.data);
    };

    this.dataChannel.onerror = (err) => {
      this.logger?.('error', 'Media stats channel error', err);
    };
  }

  public startStatsReporting(): void {
    if (this.statsInterval) return;

    this.statsInterval = setInterval(() => {
      this.collectAndSendStats();
    }, this.intervalMs);
  }

  public stop(): void {
    if (this.statsInterval) {
      clearInterval(this.statsInterval as any);
      this.statsInterval = undefined;
    }
  }

  private async collectAndSendStats(): Promise<void> {
    if (this.dataChannel.readyState !== 'open') return;

    try {
      const stats = await this.peerConnection.getStats();
      const mediaStatsReport: Record<string, any>[] = [];

      stats.forEach((report) => {
        if (report.type === 'inbound-rtp') {
          mediaStatsReport.push({
            id: report.id,
            timestamp: report.timestamp,
            kind: report.kind,
            ssrc: report.ssrc,
            packetsReceived: report.packetsReceived,
            packetsLost: report.packetsLost,
            jitter: report.jitter,
            bytesReceived: report.bytesReceived,
          });
        }
      });

      const payload = {
        mediaStats: {
          reports: mediaStatsReport,
          timestamp: Date.now(),
        },
      };

      this.dataChannel.send(JSON.stringify(payload));
      this.logger?.('debug', 'Sent media-stats keepalive report', payload);
    } catch (err) {
      this.logger?.('warn', 'Failed to collect and send media stats', err);
    }
  }
}
