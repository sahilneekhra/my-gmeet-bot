# My Google Meet Bot

A Fireflies-like Google Meet AI bot that connects to live Google Meet conferences via WebRTC, captures audio streams, tracks active speakers, and transcribes speech in real time with Deepgram or browser-native Web Speech API.

### Key Features
* 🔗 **Direct WebRTC Client**: Connects to Google Meet Media API without third-party bot vendor lock-in.
* 🎙️ **Audio Processing Pipeline**: 16kHz resampling and Linear PCM conversion with real-time RMS volume metering.
* ⚡ **Streaming Speech-to-Text (STT)**: Integrated Deepgram Nova-2 WebSocket streaming and zero-config Web Speech API fallback.
* 👥 **Speaker Attribution**: Maps data-channel participant identities directly to incoming audio streams.
* 🖥️ **Live Web UI**: Real-time transcript box with interim typing previews, VU meters, copy-to-clipboard, and OAuth token auto-sync.

---

## Prerequisites

1. **Google Cloud & OAuth Setup**: Complete the [Google Cloud Setup Guide](docs/google-cloud-setup.md).
2. **Python 3.10+** (with virtual environment in `venv`).
3. **Node.js 18+** and `npm`.

---

## How to Run

### 1. Start the FastAPI Backend (Port `8000`)

From the root project directory:

```powershell
# Activate virtual environment
.\venv\Scripts\Activate.ps1

# Run with standard uvicorn
uvicorn main:app --reload --port 8000

# Or run with uv (if installed)
uv run uvicorn main:app --reload --port 8000
```

* **Swagger API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
* **Google OAuth Sign-in**: [http://localhost:8000/auth](http://localhost:8000/auth)
* **Active Token Endpoint**: [http://localhost:8000/auth/token](http://localhost:8000/auth/token)

---

### 2. Start the WebRTC Client (Port `5173`)

From a new terminal tab:

```powershell
cd meet-client

# Install dependencies (first time only)
npm install

# Start Vite dev server
npm run dev
```

* **Interactive Web Test Runner**: [http://localhost:5173](http://localhost:5173)

---

### 3. Other Commands

#### Build the TypeScript WebRTC Client:
```powershell
cd meet-client
npm run build
```

#### Install Python Dependencies:
```powershell
pip install -r requirements.txt

# Or with uv:
uv pip install -r requirements.txt
```

---

## Documentation

* [System Architecture & Scaling Guide](docs/architecture.md)
* [Final Implementation Plan & Roadmap](docs/final-implementation-plan.md)
* [Google Cloud & OAuth Prerequisites](docs/google-cloud-setup.md)
* [Product Future Plan](docs/future-plan.md)
