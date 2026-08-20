# Google Meet Bot — Final Implementation Plan & Architecture

This document details the complete end-to-end architecture, progress achieved to date, and the step-by-step roadmap for building the **Fireflies-like AI Meeting Bot** for Google Meet.

---

## 1. System Overview & Architecture

The application is structured into two core decoupled subsystems:

```text
                                 ┌────────────────────────┐
                                 │      User Browser      │
                                 │ (http://localhost:5173)│
                                 └───────────┬────────────┘
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       │                                           │
                       ▼                                           ▼
             ┌───────────────────┐                       ┌───────────────────┐
             │  FastAPI Backend  │                       │   WebRTC Client   │
             │   (Port 8000)     │                       │  (`meet-client`)  │
             └─────────┬─────────┘                       └─────────┬─────────┘
                       │                                           │
         ┌─────────────┼─────────────┐                             │
         ▼             ▼             ▼                             ▼
    OAuth & Token  Conference   AI Processing /             Google Meet
     Auto-Refresh   Records      RAG Engine                  Media API
   (GET /auth/token)  API                                   (WebRTC & DC)
```

---

## 2. Completed Milestones (Current State)

### Milestone 1: Google Cloud & OAuth Foundation
- [x] Configured Google Cloud project and OAuth 2.0 Web Client.
- [x] Enabled Google Meet REST API and Google Meet Media API scopes:
  - `https://www.googleapis.com/auth/meetings.space.readonly`
  - `https://www.googleapis.com/auth/meetings.conference.media.readonly`
  - `https://www.googleapis.com/auth/meetings.conference.media.audio.readonly`
- [x] Built OAuth authorization flow in `app/routers/auth.py` and `app/services/oauth.py`.
- [x] Implemented automatic token refresh (`get_current_token()`) and exposed `GET /auth/token` with CORS middleware.

### Milestone 2: Custom WebRTC Client (`meet-client/`)
- [x] Designed and built a modular TypeScript WebRTC client without third-party sample bloat:
  - **`MeetClient.ts`**: Manages `RTCPeerConnection`, creates strict SDP transceiver sequence (`Audio (3 recvonly) -> DataChannels -> Video (recvonly)`), calls `spaces.connectActiveConference`, and applies SDP answers.
  - **`MeetingSession.ts`**: Listens to `session-control` channel to track state (`INITIALIZING`, `WAITING`, `JOINED`, `DISCONNECTED`) and handles graceful `leave()` requests.
  - **`ParticipantManager.ts`**: Parses `participants` and `media-entries` data channels to map audio tracks to participant identities and display names.
  - **`MediaStatsHandler.ts`**: Collects inbound RTP stats every 2 seconds and sends keepalive reports across the `media-stats` channel to prevent `SESSION_UNHEALTHY` timeouts.
  - **`AudioSink.ts`**: Captures incoming WebRTC audio tracks (`MediaStreamTrack`) for downstream processing.
- [x] Built interactive Web test UI (`index.html` + `demo.ts` with Vite) for joining meetings, monitoring logs, and viewing active participants.

### Milestone 3: Streaming Speech-to-Text (STT) Engine & Live UI
- [x] Designed high-performance audio resampler & PCM converter in `AudioProcessor.ts` (downsamples Web Audio Float32 to 16kHz 16-bit Linear PCM with real-time RMS volume metering).
- [x] Built `TranscriptionPipeline.ts` orchestrating multiple incoming WebRTC audio tracks, speaker attribution via `ParticipantManager`, and continuous streaming to STT engines.
- [x] Built modular STT engines:
  - **`DeepgramSTTEngine.ts`**: Real-time WebSocket streaming with subprotocol auth, Nova-2 model, interim/final results, and word-level timestamps.
  - **`WebSpeechSTTEngine.ts`**: Zero-config browser-native fallback for Chrome/Edge.
- [x] Built modern real-time Web UI (`index.html` + `demo.ts`) with live speaker transcripts, interim speech bubbles, VU meters per participant, copy/clear transcript actions, and OAuth token auto-fetch.

---

## 3. Remaining Implementation Phases

### Phase 4 — Real-Time Transcript Persistence & WebSockets
**Goal**: Persist transcript segments incrementally and broadcast them live to frontend users.

```text
Finalized Segment ──► WebSocket Gateway ──► Live Web UI
         │
         ▼
Database (SQLite / PostgreSQL)
 - meeting_id
 - participant_name
 - text
 - start_timestamp
 - end_timestamp
 - sequence_number
```

1. Create database schema for Meetings, Participants, and Transcript Segments in FastAPI backend.
2. Provide WebSocket endpoint `/ws/transcripts/{meeting_id}` for streaming live transcript updates.
3. Save finalized segments to database every time a speaker finishes a sentence/segment.

---

### Phase 5 — AI Meeting Intelligence & Notes Generation
**Goal**: Automatically produce structured notes after a meeting completes.

```text
Full Meeting Transcript ──► LLM (Gemini 1.5 / GPT-4o) ──► Structured Meeting Notes
                                                          ├── Executive Summary
                                                          ├── Key Decisions
                                                          ├── Action Items (Owner + Task)
                                                          └── Open Questions
```

1. Create post-meeting summary service in `app/services/summary.py`.
2. Trigger summarization automatically when `MeetingSession` transitions to `DISCONNECTED` / `CONFERENCE_ENDED`.
3. Save AI notes and action items in the database.

---

### Phase 6 — Meeting History & RAG Chatbot
**Goal**: Search across past meetings and ask natural language questions with exact citations.

```text
User Question ──► Semantic Search / Vector Retrieval ──► Transcript Context ──► LLM Answer + Timestamp Citation
```

1. Index transcripts with embeddings (e.g. ChromaDB / pgvector / SQLite full-text search).
2. Create `/meetings/{id}/chat` and `/search` endpoints.
3. Answer user questions with citations pointing to specific speakers and timestamps.

---

### Phase 7 — Headless Bot Runner for Production
**Goal**: Allow users to paste a meeting link on the web, spawning an automated headless bot runner that joins without keeping a browser tab open.

1. Package `meet-client` into a headless container (Node.js + Puppeteer / Docker).
2. FastAPI triggers bot jobs on demand:
   - `POST /meetings/join { "url": "https://meet.google.com/..." }`
   - Spawns headless runner ➔ Joins meeting ➔ Streams transcripts ➔ Generates summary.

---

## 4. File Structure

```text
my-gmeet-bot/
├── app/                        # FastAPI Backend
│   ├── routers/
│   │   ├── auth.py             # OAuth login & /auth/token endpoint
│   │   ├── health.py           # Health check endpoint
│   │   └── meetings.py         # Google Meet conference records
│   ├── services/
│   │   ├── meet.py             # Google Meet REST client
│   │   └── oauth.py            # OAuth flows & token refresh
│   ├── config.py               # Credentials & OAuth scopes
│   ├── schemas.py              # Pydantic models
│   └── main.py                 # FastAPI application
├── docs/                       # Project documentation & plans
│   ├── final-implementation-plan.md
│   ├── bot-implementation-plan-alternate.md
│   ├── future-plan.md
│   └── google-cloud-setup.md
├── meet-client/                # WebRTC Client Service
│   ├── src/
│   │   ├── audio/
│   │   │   ├── AudioSink.ts    # WebRTC audio stream receiver
│   │   │   ├── AudioProcessor.ts # PCM 16kHz resampling & VU volume metering
│   │   │   └── TranscriptionPipeline.ts # Audio & STT stream coordinator
│   │   ├── meet/
│   │   │   ├── MeetClient.ts   # WebRTC peer connection & signaling
│   │   │   ├── MeetingSession.ts # Session control channel & lifecycle
│   │   │   ├── ParticipantManager.ts # Speaker attribution & participants
│   │   │   └── MediaStatsHandler.ts  # Keepalive heartbeats
│   │   ├── stt/                # Speech-to-Text Engines
│   │   │   ├── DeepgramSTTEngine.ts  # Deepgram Nova-2 streaming WebSocket
│   │   │   ├── WebSpeechSTTEngine.ts # Browser native Web Speech API
│   │   │   ├── types.ts        # STT interfaces & TranscriptSegment model
│   │   │   └── index.ts        # Engine factory & exports
│   │   ├── types/
│   │   │   └── index.ts        # Type definitions
│   │   ├── demo.ts             # Interactive test runner logic
│   │   └── index.ts            # Public API exports
│   ├── index.html              # Web test runner UI
│   ├── package.json
│   └── tsconfig.json
├── requirements.txt            # Python dependencies
└── token.json                  # Saved OAuth credentials
```
