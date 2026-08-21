import { MeetClient } from './meet/MeetClient';
import { BatchRecorderEngine, STTConfig, TranscriptSegment } from './stt';
import { ParticipantInfo, SessionState } from './types';

let client: MeetClient | null = null;
let isSTTRunning = false;
const transcriptHistory: TranscriptSegment[] = [];

// DOM Elements - Connection
const spaceInput = document.getElementById('meeting-space') as HTMLInputElement;
const tokenInput = document.getElementById('access-token') as HTMLInputElement;
const fetchTokenBtn = document.getElementById('fetch-token-btn') as HTMLButtonElement;
const joinBtn = document.getElementById('join-btn') as HTMLButtonElement;
const leaveBtn = document.getElementById('leave-btn') as HTMLButtonElement;
const sessionStatusBadge = document.getElementById('session-status-badge') as HTMLElement;

// DOM Elements - STT Engine
const sttProviderSelect = document.getElementById('stt-provider') as HTMLSelectElement;
const deepgramKeyGroup = document.getElementById('deepgram-key-group') as HTMLElement;
const deepgramApiKeyInput = document.getElementById('deepgram-api-key') as HTMLInputElement;
const startSttBtn = document.getElementById('start-stt-btn') as HTMLButtonElement;
const stopSttBtn = document.getElementById('stop-stt-btn') as HTMLButtonElement;
const sttStatusBadge = document.getElementById('stt-status-badge') as HTMLElement;

// DOM Elements - Participants
const participantCountEl = document.getElementById('participant-count') as HTMLElement;
const participantsList = document.getElementById('participants-list') as HTMLElement;

// DOM Elements - Transcripts
const copyTranscriptBtn = document.getElementById('copy-transcript-btn') as HTMLButtonElement;
const clearTranscriptBtn = document.getElementById('clear-transcript-btn') as HTMLButtonElement;
const transcriptFeed = document.getElementById('transcript-feed') as HTMLElement;
const transcriptPlaceholder = document.getElementById('transcript-placeholder') as HTMLElement;
const interimContainer = document.getElementById('interim-container') as HTMLElement;
const interimSpeaker = document.getElementById('interim-speaker') as HTMLElement;
const interimText = document.getElementById('interim-text') as HTMLElement;

// DOM Elements - Logs & Media
const logArea = document.getElementById('log-area') as HTMLElement;
const clearLogsBtn = document.getElementById('clear-logs-btn') as HTMLButtonElement;
const audioContainer = document.getElementById('audio-container') as HTMLElement;

// --- Logger Utility ---
function addLog(msg: string, type: 'info' | 'warn' | 'error' | 'debug' = 'info') {
  const line = document.createElement('div');
  line.className = `log-line log-${type}`;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logArea.appendChild(line);
  logArea.scrollTop = logArea.scrollHeight;
}

// --- Status Badge Utilities ---
function updateSessionStatus(state: SessionState) {
  sessionStatusBadge.textContent = state;
  sessionStatusBadge.className = `badge badge-${state.toLowerCase()}`;
}

function updateSTTStatus(state: 'IDLE' | 'CONNECTING' | 'LISTENING' | 'ERROR') {
  sttStatusBadge.textContent = `STT ${state}`;
  sttStatusBadge.className = `badge badge-${state.toLowerCase()}`;
}

// --- STT Engine Toggle ---
function syncSTTProviderUI() {
  const tipEl = document.getElementById('stt-tip');
  if (sttProviderSelect.value === 'deepgram') {
    deepgramKeyGroup.style.display = 'flex';
    if (tipEl) tipEl.textContent = 'Tip: Deepgram streaming requires an API key for live WebSocket transcription.';
  } else if (sttProviderSelect.value === 'batch') {
    deepgramKeyGroup.style.display = 'none';
    if (tipEl) tipEl.textContent = 'Tip: Batch mode records audio in memory and uploads WAV to /api/meetings/{id}/transcribe-batch on Leave.';
  } else {
    deepgramKeyGroup.style.display = 'none';
    if (tipEl) tipEl.textContent = 'Tip: Web Speech API is 100% free and built into your browser (Chrome/Edge).';
  }
}
sttProviderSelect.addEventListener('change', syncSTTProviderUI);
syncSTTProviderUI();

// --- Participant Rendering & VU Meters ---
function renderParticipants(participants: ParticipantInfo[]) {
  participantsList.innerHTML = '';
  participantCountEl.textContent = `${participants.length} participant${participants.length === 1 ? '' : 's'}`;

  if (participants.length === 0) {
    participantsList.innerHTML = '<li class="empty-text">No active participants detected in conference.</li>';
    return;
  }

  for (const p of participants) {
    const li = document.createElement('li');
    li.className = 'participant-item';
    li.id = `participant-${p.id}`;

    const initial = (p.displayName || 'U').charAt(0).toUpperCase();
    const roleBadge = p.isHost ? ' (Host)' : '';

    li.innerHTML = `
      <div class="participant-meta">
        <div class="avatar">${initial}</div>
        <span class="participant-name">${p.displayName}${roleBadge}</span>
      </div>
      <div class="vu-meter-wrap" title="Audio Level">
        <div class="vu-bar" id="vu-bar-${p.id}"></div>
      </div>
    `;
    participantsList.appendChild(li);
  }
}

function updateParticipantVU(participantId: number | undefined, volume: number) {
  if (participantId === undefined) return;
  const bar = document.getElementById(`vu-bar-${participantId}`);
  if (bar) {
    bar.style.width = `${Math.min(100, volume)}%`;
  }
}

async function persistSegmentToBackend(segment: TranscriptSegment) {
  const meetingId = spaceInput.value.trim().replace(/^spaces\//, '') || 'default-meeting';
  try {
    await fetch(`http://localhost:8000/api/transcripts/${meetingId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(segment),
    });
  } catch {
    // background persistence best-effort
  }
}

// --- Live Transcript Handling ---
function appendFinalTranscript(segment: TranscriptSegment) {
  if (transcriptPlaceholder && transcriptPlaceholder.parentElement === transcriptFeed) {
    transcriptFeed.removeChild(transcriptPlaceholder);
  }

  transcriptHistory.push(segment);
  persistSegmentToBackend(segment);

  const segmentEl = document.createElement('div');
  segmentEl.className = 'transcript-segment';
  segmentEl.id = segment.id;

  const timeString = new Date(segment.timestamp).toLocaleTimeString();

  segmentEl.innerHTML = `
    <div class="segment-header">
      <span class="segment-speaker">${escapeHtml(segment.speaker)}</span>
      <span class="segment-time">${timeString}</span>
    </div>
    <p class="segment-text">${escapeHtml(segment.text)}</p>
  `;

  transcriptFeed.appendChild(segmentEl);
  transcriptFeed.scrollTop = transcriptFeed.scrollHeight;

  // Hide interim container if it was displaying this speaker
  interimContainer.style.display = 'none';
}

function updateInterimTranscript(segment: TranscriptSegment) {
  if (!segment.text.trim()) return;

  interimSpeaker.textContent = segment.speaker || 'Speaker';
  interimText.textContent = segment.text;
  interimContainer.style.display = 'block';
  transcriptFeed.scrollTop = transcriptFeed.scrollHeight;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// --- Transcript Actions ---
clearTranscriptBtn.addEventListener('click', () => {
  transcriptHistory.length = 0;
  transcriptFeed.innerHTML = `
    <div id="transcript-placeholder" class="empty-text">
      Transcripts will appear here in real time when participants speak...
    </div>
  `;
  interimContainer.style.display = 'none';
  addLog('Transcript history cleared.', 'debug');
});

copyTranscriptBtn.addEventListener('click', async () => {
  if (transcriptHistory.length === 0) {
    alert('No transcripts available to copy.');
    return;
  }

  const formattedText = transcriptHistory
    .map((s) => `[${new Date(s.timestamp).toLocaleTimeString()}] ${s.speaker}: ${s.text}`)
    .join('\n');

  try {
    await navigator.clipboard.writeText(formattedText);
    const originalText = copyTranscriptBtn.textContent;
    copyTranscriptBtn.textContent = 'Copied!';
    setTimeout(() => {
      copyTranscriptBtn.textContent = originalText;
    }, 2000);
    addLog('Transcripts copied to clipboard.', 'info');
  } catch {
    addLog('Failed to copy to clipboard', 'warn');
  }
});

// --- Transcript Export Actions ---
function triggerDownload(format: 'markdown' | 'srt' | 'txt' | 'json') {
  const rawSpace = spaceInput.value.trim();
  const meetingId = rawSpace.includes('meet.google.com/')
    ? rawSpace.split('meet.google.com/')[1].split('?')[0]
    : rawSpace.replace(/^spaces\//, '') || 'default-meeting';

  const downloadUrl = `http://localhost:8000/api/meetings/${meetingId}/export?format=${format}`;
  addLog(`Downloading transcript export in ${format.toUpperCase()} format from ${downloadUrl}...`, 'info');
  window.open(downloadUrl, '_blank');
}

const exportMdBtn = document.getElementById('export-md-btn') as HTMLButtonElement;
const exportSrtBtn = document.getElementById('export-srt-btn') as HTMLButtonElement;
const exportTxtBtn = document.getElementById('export-txt-btn') as HTMLButtonElement;
const exportJsonBtn = document.getElementById('export-json-btn') as HTMLButtonElement;
const wsStatusBadge = document.getElementById('ws-status-badge') as HTMLElement;

exportMdBtn?.addEventListener('click', () => triggerDownload('markdown'));
exportSrtBtn?.addEventListener('click', () => triggerDownload('srt'));
exportTxtBtn?.addEventListener('click', () => triggerDownload('txt'));
exportJsonBtn?.addEventListener('click', () => triggerDownload('json'));

// --- WebSocket Gateway Subscription ---
let dashboardSocket: WebSocket | null = null;

function initWebSocketGateway(meetingId: string) {
  if (dashboardSocket) {
    dashboardSocket.close();
    dashboardSocket = null;
  }

  const wsUrl = `ws://localhost:8000/api/ws/transcripts/${meetingId}`;
  addLog(`Connecting to live WebSocket gateway at ${wsUrl}...`, 'debug');

  try {
    dashboardSocket = new WebSocket(wsUrl);

    dashboardSocket.onopen = () => {
      if (wsStatusBadge) {
        wsStatusBadge.textContent = 'WS Gateway Live';
        wsStatusBadge.className = 'badge badge-joined';
      }
      addLog('Connected to FastAPI WebSocket Gateway! Live transcript broadcast active.', 'info');
    };

    dashboardSocket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === 'segment' && msg.segment) {
          if (!transcriptHistory.some((s) => s.id === msg.segment.id)) {
            appendFinalTranscript(msg.segment);
          }
        } else if (msg.event === 'history' && Array.isArray(msg.segments)) {
          if (msg.segments.length > 0 && transcriptHistory.length === 0) {
            addLog(`Loaded ${msg.segments.length} historical transcript segment(s) from database.`, 'info');
            for (const seg of msg.segments) {
              appendFinalTranscript(seg);
            }
          }
        } else if (msg.event === 'batch_complete') {
          addLog(`📦 Received batch transcription completion event: ${msg.summary}`, 'info');
        }
      } catch {
        // non-json message
      }
    };

    dashboardSocket.onclose = () => {
      if (wsStatusBadge) {
        wsStatusBadge.textContent = 'WS Gateway Offline';
        wsStatusBadge.className = 'badge badge-disconnected';
      }
    };

    dashboardSocket.onerror = () => {
      if (wsStatusBadge) {
        wsStatusBadge.textContent = 'WS Offline';
        wsStatusBadge.className = 'badge badge-disconnected';
      }
    };
  } catch (err: any) {
    addLog(`Could not connect to WebSocket Gateway: ${err.message}`, 'debug');
  }
}

clearLogsBtn.addEventListener('click', () => {
  logArea.innerHTML = '';
});

// --- OAuth Auto-Fetch ---
async function fetchTokenFromBackend(): Promise<void> {
  addLog('Fetching active OAuth token from backend (http://localhost:8000/auth/token)...', 'debug');
  try {
    const res = await fetch('http://localhost:8000/auth/token');
    if (res.ok) {
      const data = await res.json();
      if (data.access_token) {
        tokenInput.value = data.access_token;
        addLog('Successfully loaded active OAuth access token from backend!', 'info');
        return;
      }
    }
    addLog('Could not auto-fetch token. Ensure FastAPI backend is running or click "/auth" to authenticate.', 'warn');
  } catch {
    addLog('Backend at localhost:8000 not reachable. You can paste token manually or start the FastAPI server.', 'debug');
  }
}

fetchTokenBtn.addEventListener('click', () => {
  fetchTokenFromBackend();
});

// Auto-try loading token on page load
fetchTokenFromBackend();

// --- STT Start / Stop Controls ---
async function startSTT(): Promise<void> {
  if (!client) {
    alert('Please join a meeting before starting Speech-to-Text.');
    return;
  }

  const provider = sttProviderSelect.value as 'deepgram' | 'webspeech' | 'batch';
  const apiKey = deepgramApiKeyInput.value.trim();

  if (provider === 'deepgram' && !apiKey) {
    alert('Please enter your Deepgram API Key or select "Web Speech API (Browser Native)".');
    return;
  }

  startSttBtn.disabled = true;
  stopSttBtn.disabled = false;
  updateSTTStatus('CONNECTING');
  addLog(`Initializing ${provider.toUpperCase()} Speech-to-Text engine...`, 'info');

  const sttConfig: STTConfig = {
    provider,
    apiKey,
    language: 'en',
    sampleRate: 16000,
    interimResults: true,
  };

  try {
    const pipeline = await client.startTranscription(sttConfig);
    isSTTRunning = true;
    updateSTTStatus('LISTENING');
    if (provider === 'batch') {
      addLog('📦 Batch Mode Active: Recording 16kHz PCM audio. WAV will be uploaded and transcribed when you leave the meeting.', 'info');
    } else {
      addLog(`STT Pipeline running with provider: ${provider}`, 'info');
    }

    // Handle VU meters via pipeline
    pipeline.onAudioLevel((event) => {
      if (event.participant) {
        updateParticipantVU(event.participant.id, event.volume);
      }
    });
  } catch (err: any) {
    addLog(`Failed to start STT: ${err.message || err}`, 'error');
    updateSTTStatus('ERROR');
    startSttBtn.disabled = false;
    stopSttBtn.disabled = true;
  }
}

async function stopSTT(): Promise<void> {
  if (client) {
    await client.stopTranscription();
  }
  isSTTRunning = false;
  updateSTTStatus('IDLE');
  startSttBtn.disabled = false;
  stopSttBtn.disabled = true;
  interimContainer.style.display = 'none';
  addLog('Speech-to-Text stopped.', 'info');
}

startSttBtn.addEventListener('click', startSTT);
stopSttBtn.addEventListener('click', stopSTT);

leaveBtn.addEventListener('click', async () => {
  if (client) {
    const pipeline = client.getTranscriptionPipeline();
    const engine = pipeline?.getSTTEngine();

    if (engine instanceof BatchRecorderEngine) {
      const meetingId = spaceInput.value.trim().replace(/^spaces\//, '') || 'default-meeting';
      addLog(`📦 [Batch Mode] Meeting ending. Uploading recorded WAV audio (${engine.getDurationSeconds().toFixed(1)}s) to backend for AI transcription...`, 'info');
      updateSTTStatus('CONNECTING');

      try {
        const batchSegments = await engine.finalizeAndUpload(meetingId, 'http://localhost:8000');
        addLog(`📦 [Batch Mode] AI Transcription Complete! Received ${batchSegments.length} segment(s).`, 'info');
      } catch (uploadErr: any) {
        addLog(`📦 [Batch Mode] Upload failed: ${uploadErr.message || uploadErr}`, 'error');
      }
    }

    addLog('Leaving meeting and disconnecting all sessions...', 'info');
    await client.disconnect();
    client = null;
  }
  isSTTRunning = false;
  joinBtn.disabled = false;
  leaveBtn.disabled = true;
  startSttBtn.disabled = false;
  stopSttBtn.disabled = true;
  updateSessionStatus('DISCONNECTED');
  updateSTTStatus('IDLE');
  renderParticipants([]);
});

// --- Meeting Connection Lifecycle ---
joinBtn.addEventListener('click', async () => {
  let spaceId = spaceInput.value.trim();
  const token = tokenInput.value.trim();

  if (!spaceId) {
    alert('Please enter a Google Meet Space ID or URL.');
    return;
  }
  if (!token) {
    alert('Please enter your Google OAuth Access Token.');
    return;
  }

  // Extract space code from URL if full URL is pasted
  if (spaceId.includes('meet.google.com/')) {
    const parts = spaceId.split('meet.google.com/');
    spaceId = parts[1].split('?')[0];
  }

  joinBtn.disabled = true;
  leaveBtn.disabled = false;
  updateSessionStatus('INITIALIZING');
  addLog(`Connecting bot to Google Meet space: ${spaceId}...`, 'info');

  // Connect to live WebSocket Gateway for real-time sync & persistence
  initWebSocketGateway(spaceId);

  try {
    client = new MeetClient({
      meetingSpaceId: spaceId,
      accessToken: token,
      logger: (level, msg, data) => {
        addLog(data ? `${msg} | ${JSON.stringify(data)}` : msg, level);
      },
    });

    // Receive incoming WebRTC audio tracks
    client.onTrack((track) => {
      addLog(`Attached audio stream from track ${track.id}`, 'info');
      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioEl.srcObject = new MediaStream([track]);
      audioContainer.appendChild(audioEl);
    });

    // Transcript event stream
    client.onTranscript((segment) => {
      if (segment.isFinal) {
        appendFinalTranscript(segment);
      } else {
        updateInterimTranscript(segment);
      }
    });

    const session = await client.join();

    session.onStateChange((state, reason) => {
      updateSessionStatus(state);
      addLog(`Session State changed to: ${state}${reason ? ` (Reason: ${reason})` : ''}`, 'info');
      if (state === 'DISCONNECTED') {
        joinBtn.disabled = false;
        leaveBtn.disabled = true;
        updateSTTStatus('IDLE');
        startSttBtn.disabled = false;
        stopSttBtn.disabled = true;
      }
    });

    const participantMgr = client.getParticipantManager();
    participantMgr?.onParticipantJoined((p) => {
      addLog(`Participant joined: ${p.displayName}`, 'info');
      renderParticipants(participantMgr.getAllParticipants());
    });

    participantMgr?.onParticipantLeft((p) => {
      addLog(`Participant left: ${p.displayName}`, 'info');
      renderParticipants(participantMgr.getAllParticipants());
    });
  } catch (err: any) {
    addLog(`Join failed: ${err.message || err}`, 'error');
    updateSessionStatus('DISCONNECTED');
    joinBtn.disabled = false;
    leaveBtn.disabled = true;
  }
});

