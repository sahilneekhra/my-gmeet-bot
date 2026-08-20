import { MeetClient } from './meet/MeetClient';
import { ParticipantInfo, SessionState } from './types';

let client: MeetClient | null = null;

const spaceInput = document.getElementById('meeting-space') as HTMLInputElement;
const tokenInput = document.getElementById('access-token') as HTMLInputElement;
const fetchTokenBtn = document.getElementById('fetch-token-btn') as HTMLButtonElement;
const joinBtn = document.getElementById('join-btn') as HTMLButtonElement;
const leaveBtn = document.getElementById('leave-btn') as HTMLButtonElement;
const statusBadge = document.getElementById('status-badge') as HTMLElement;
const logArea = document.getElementById('log-area') as HTMLElement;
const participantsList = document.getElementById('participants-list') as HTMLElement;
const audioContainer = document.getElementById('audio-container') as HTMLElement;

function addLog(msg: string, type: 'info' | 'warn' | 'error' | 'debug' = 'info') {
  const line = document.createElement('div');
  line.className = `log-line log-${type}`;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logArea.appendChild(line);
  logArea.scrollTop = logArea.scrollHeight;
}

function updateStatus(state: SessionState) {
  statusBadge.textContent = state;
  statusBadge.className = `badge badge-${state.toLowerCase()}`;
}

function renderParticipants(participants: ParticipantInfo[]) {
  participantsList.innerHTML = '';
  if (participants.length === 0) {
    participantsList.innerHTML = '<li class="empty-text">No other participants yet.</li>';
    return;
  }

  for (const p of participants) {
    const li = document.createElement('li');
    li.textContent = `${p.displayName} (ID: ${p.id})`;
    participantsList.appendChild(li);
  }
}

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
  updateStatus('INITIALIZING');
  addLog(`Connecting to meeting: ${spaceId}...`, 'info');

  try {
    client = new MeetClient({
      meetingSpaceId: spaceId,
      accessToken: token,
      logger: (level, msg, data) => {
        addLog(data ? `${msg} | ${JSON.stringify(data)}` : msg, level);
      },
    });

    // Handle incoming audio tracks
    client.onTrack((track) => {
      addLog(`Attached audio stream from track ${track.id}`, 'info');
      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioEl.srcObject = new MediaStream([track]);
      audioContainer.appendChild(audioEl);
    });

    const session = await client.join();

    session.onStateChange((state, reason) => {
      updateStatus(state);
      addLog(`Session State: ${state}${reason ? ` (Reason: ${reason})` : ''}`, 'info');
      if (state === 'DISCONNECTED') {
        joinBtn.disabled = false;
        leaveBtn.disabled = true;
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
    updateStatus('DISCONNECTED');
    joinBtn.disabled = false;
    leaveBtn.disabled = true;
  }
});

leaveBtn.addEventListener('click', async () => {
  if (client) {
    addLog('Leaving meeting...', 'info');
    await client.disconnect();
    client = null;
  }
  joinBtn.disabled = false;
  leaveBtn.disabled = true;
  updateStatus('DISCONNECTED');
});
