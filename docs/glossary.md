# Technical Glossary & Concepts Guide

> **Welcome!** If you are reading this codebase and seeing terms like **WebRTC**, **SDP**, **STT**, **PCM**, or **SFU**, this guide is written specifically for you. 
> Every concept is explained in plain English with everyday analogies, followed by exactly **what it does in this project** and **why we need it**.

---

## Quick Reference Table

| Term / Acronym | Full Name | 5-Second Plain English Summary |
| :--- | :--- | :--- |
| **WebRTC** | Web Real-Time Communication | The technology that lets browsers stream live audio/video with almost zero delay. |
| **STT** | Speech-to-Text | Turning spoken audio into written words (transcription). |
| **SDP** | Session Description Protocol | The digital "business card" exchanged between two computers agreeing on audio/video formats. |
| **ICE** | Interactive Connectivity Establishment | The "navigation system" finding the best network path through firewalls for media. |
| **SFU** | Selective Forwarding Unit | Google's central media server that routes audio tracks between participants. |
| **RTP Opus** | Real-Time Transport Protocol (Opus Codec) | Live compressed voice chunks wrapped in digital delivery packets streamed from Google Meet. |
| **Opus** | *(Audio Codec Name)* | The ultra-fast, high-quality audio compression format used by Google Meet, Discord, and Zoom. |
| **DTLS** | Datagram Transport Layer Security | The encryption lock (like HTTPS) that scrambles audio packets to prevent eavesdropping. |
| **SCTP** | Stream Control Transmission Protocol | The protocol under the hood of `RTCDataChannel` ensuring text messages and participant names arrive safely. |
| **MediaStreamTrack** | *(WebRTC Object)* | The browser's live pipe representing one specific person's microphone stream. |
| **PCM** | Pulse Code Modulation | The raw, uncompressed digital audio format (16-bit integer) required by AI speech models. |
| **Float32 vs Int16** | Float 32-bit vs Signed Integer 16-bit | **Float32** is browser Web Audio (`-1.0` to `+1.0`). **Int16** is AI speech audio (`-32768` to `+32767`). |
| **DSP** | Digital Signal Processing | Math techniques used to clean, convert, and downsample audio (e.g. 48kHz to 16kHz). |
| **RMS** | Root Mean Square | The mathematical formula used to calculate audio loudness for volume meters. |
| **VU Meter** | Volume Unit Meter | The green/yellow/red jumping visual bar showing who is speaking. |
| **OAuth 2.0** | Open Authorization 2.0 | The standard "Sign in with Google" protocol that gives our bot permission to join meetings. |
| **CORS** | Cross-Origin Resource Sharing | A security rule allowing our frontend (Port 5173) to fetch credentials from the backend (Port 8000). |
| **WebSocket** | Web Socket | A two-way, open phone call between browser and server for instantaneous streaming. |
| **Nova-2** | *(Deepgram Model Name)* | Deepgram's state-of-the-art AI model for fast, accurate live conversational transcription. |
| **WAL Mode** | Write-Ahead Logging | A database setting allowing readers and writers to work simultaneously without locks. |
| **RAG** | Retrieval-Augmented Generation | Giving an AI memory of meeting transcripts so it answers questions with exact citations. |

---

## 1. WebRTC & Networking Concepts

### 🎙️ WebRTC (Web Real-Time Communication)
* **What it stands for:** Web Real-Time Communication.
* **Analogy:** Traditional web browsing is like **sending letters back and forth** (click, wait, load). WebRTC is like a **direct live phone call**.
* **What it does in this bot:** It allows our TypeScript client (`meet-client`) to directly connect to Google Meet's media servers and receive live audio tracks from meeting participants in sub-second latency without needing any screen recorders.
* **Why it matters:** Instead of running heavy browsers recording video screens (which costs $1/hour per bot on platforms like Recall.ai), WebRTC pulls the raw audio directly from the Google Meet server for pennies.

---

### 📄 SDP (Session Description Protocol) & Offer / Answer
* **What it stands for:** Session Description Protocol.
* **Analogy:** Two people negotiating before a meeting: *"I speak English and have an HD microphone. What about you?"* — *"I speak English too, and I'm ready to receive audio on port 5004."*
* **What it does in this bot:** 
  1. Our bot creates an **SDP Offer** describing what media channels it wants (3 audio receivers, data channels, 3 video receivers).
  2. Our backend sends this offer to Google via `spaces.connectActiveConference`.
  3. Google returns an **SDP Answer** telling the bot which server IP and media formats to use.

---

### 🌐 ICE (Interactive Connectivity Establishment) & ICE Candidates
* **What it stands for:** Interactive Connectivity Establishment.
* **Analogy:** Trying to find a way to a friend's house: *"Can we go through the front gate? No, it's locked (firewall). How about the side door (STUN server)?"*
* **What it does in this bot:** Discovers public IP addresses and network paths so the bot and Google Meet's media server can send audio packets to each other even through home Wi-Fi routers and firewalls.

---

### 🏢 SFU (Selective Forwarding Unit)
* **What it stands for:** Selective Forwarding Unit.
* **Analogy:** A postal sorting facility. Instead of each person in a 10-person meeting sending 9 separate audio streams to everyone, everyone sends 1 stream to Google's SFU, and the SFU copies and forwards it to everyone else.
* **What it does in this bot:** Google Meet uses an SFU architecture. Our bot registers with Google's SFU to receive separate audio tracks for active speakers.

---

### 📦 RTP (Real-Time Transport Protocol)
* **What it stands for:** Real-Time Transport Protocol.
* **Analogy:** The conveyor belt moving packages of voice data as fast as possible. If a package drops, it doesn't stop or wait; it keeps playing live.
* **What it does in this bot:** The underlying protocol that delivers raw audio packets over UDP from Google Meet into our browser's `RTCPeerConnection`.

---

### 💬 RTCDataChannel (Data Channels)
* **What it is:** A direct, low-latency side-channel in WebRTC used for sending text/JSON messages rather than audio/video.
* **What it does in this bot:** Google Meet sends 4 critical data channels to our bot:
  1. `session-control`: Tells us when the meeting starts, when we are admitted, or when the meeting ends.
  2. `participants`: Sends real-time updates of who joins or leaves, including their full display names.
  3. `media-entries`: Links a specific incoming audio stream to a specific participant ID.
  4. `media-stats`: The heartbeat channel where our bot reports health stats every 2 seconds to stay connected.

---

### 🔀 Transceivers (`recvonly`, `sendonly`, `sendrecv`)
* **What it means:** A transceiver is a pipeline inside WebRTC configured to either **send**, **receive**, or **both**.
* **What it does in this bot:** Because our bot is a "listener" (not speaking or broadcasting video), we configure all audio and video transceivers as `recvonly` (receive-only).

---

## 2. Audio Processing & Speech-to-Text (STT)

### 🗣️ STT (Speech-to-Text)
* **What it stands for:** Speech-to-Text (also known as Automatic Speech Recognition or ASR).
* **What it does in this bot:** Takes live audio chunks coming out of Google Meet and turns them into text strings in real time. We support:
  - **Deepgram Nova-2**: High-accuracy cloud AI transcription via streaming WebSockets.
  - **Web Speech API**: Zero-config browser-native transcription built into Chrome and Edge.

---

### 🎛️ PCM (Pulse Code Modulation) & 16-bit Linear PCM
* **What it stands for:** Pulse Code Modulation.
* **Analogy:** Taking digital snapshots of a sound wave thousands of times every second.
* **What it does in this bot:** WebRTC gives us compressed Web Audio (Float32 numbers between `-1.0` and `+1.0`). Deepgram and AI models expect **16-bit signed integer Linear PCM** (numbers between `-32768` and `+32767`). Our `AudioProcessor.ts` converts the audio into this exact format.

---

### ⏱️ Sample Rate & Resampling (48kHz vs 16kHz)
* **What it means:** 
  - **48kHz (48,000 Hz):** Standard high-fidelity audio (Google Meet uses this for music/voice clarity). 48,000 snapshots per second.
  - **16kHz (16,000 Hz):** The gold standard for Speech-to-Text models. It strips unnecessary frequencies and cuts bandwidth by 66%.
* **What it does in this bot:** Our `AudioProcessor.ts` performs **downsampling**, smoothly converting incoming 48kHz audio into 16kHz before streaming it to Deepgram.

---

### 📊 RMS Volume & VU Meter
* **What RMS stands for:** Root Mean Square (a math formula calculating the true average energy of an audio waveform).
* **What a VU Meter is:** Volume Unit Meter (the animated green-to-red audio level bar).
* **What it does in this bot:** Calculates how loudly a participant is talking (0% to 100%) and animates the audio bar next to their name in the UI.

---

### 🧩 Diarization (Speaker Attribution)
* **What it is:** Figuring out *"Who spoke what sentence?"*.
* **Traditional Approach (Acoustic Diarization):** Analyzing vocal pitch to guess when speakers change (often unreliable and slow).
* **Our Approach (Deterministic Data Channels):** Google Meet gives each speaker a dedicated `MediaStreamTrack` and tells us the speaker's name over the `media-entries` data channel. We achieve **100% accurate speaker attribution** without guesswork.

---

### ⏳ Interim vs Final Transcripts
* **Interim Result:** Temporary live preview while a person is still speaking (e.g. *"I think we should..."*). Displayed with a pulsing indicator.
* **Final Result:** The permanent, finalized sentence with punctuation and timestamps generated once the person pauses (e.g. *"I think we should launch next Tuesday."*).

---

## 3. Authentication & Backend Architecture

### 🔑 OAuth 2.0 (Open Authorization)
* **What it is:** The secure standard that lets users say *"Google, give this bot permission to access my meetings, without giving the bot my Google password."*
* **Key Terms:**
  - **Client ID & Secret:** The digital ID badge of our application registered in Google Cloud Console.
  - **Access / Bearer Token:** The temporary digital VIP pass (valid for 1 hour) that our bot presents with each API request.
  - **Refresh Token:** A long-lived key stored in `token.json` used by our backend to automatically get a new Access Token when the old one expires.
  - **Scopes:** The exact permissions requested (e.g. `meetings.space.readonly`, `meetings.conference.media.audio.readonly`).
  - **PKCE (Proof Key for Code Exchange):** A cryptographic security handshake that prevents attackers from intercepting authorization codes.

---

### ⚡ WebSocket
* **What it is:** A continuous, bidirectional connection between the browser and server.
* **Difference from REST:**
  - **REST API:** You ask the server a question, it gives one answer, and closes the connection.
  - **WebSocket:** A permanently open tunnel. As soon as a speaker finishes a sentence, the backend instantly pushes it to all open browsers.

---

### 🗄️ SQLite WAL Mode (Write-Ahead Logging)
* **What it stands for:** Write-Ahead Logging.
* **What it does:** By default, SQLite locks the entire database when writing. In WAL mode, writes are written to a temporary log file first, allowing multiple users to read the database while new transcripts are being saved simultaneously.

---

## 4. AI & Intelligence Layer

### 🧠 LLM (Large Language Model)
* **What it is:** Advanced language models (such as Google Gemini 1.5 Pro or Flash) capable of understanding and reasoning over long text.
* **What it does in this bot:** Ingests complete meeting transcripts to generate:
  1. Executive summaries
  2. Key decisions made
  3. Action items with assignees
  4. Unanswered questions

---

### 🔍 RAG (Retrieval-Augmented Generation) & Vector Embeddings
* **What it stands for:** Retrieval-Augmented Generation.
* **Analogy:** Instead of asking an AI to remember thousands of pages from memory, you give it an **instant search index** to look up the exact paragraphs before answering.
* **Key Terms:**
  - **Vector Embedding:** Converting sentences into mathematical coordinates representing their semantic meaning (e.g. *"launch date"* and *"release schedule"* end up close together).
  - **RAG Chatbot:** When you ask *"When is the product deadline?"*, the system searches past meeting embeddings, finds the exact 10-second segment where the CEO discussed the deadline, and passes it to the LLM to give a cited answer.

---

## 5. Summary Cheat Sheet

```text
[Google Meet SFU] 
       │ (WebRTC + RTP Opus audio stream)
       ▼
[meet-client / AudioSink]
       │ (Web Audio Float32 samples)
       ▼
[AudioProcessor] ──► Downsamples to 16kHz Linear PCM + Calculates RMS Volume
       │ 
       ▼
[TranscriptionPipeline] ──► Matches Track ID with Participant Name (Data Channels)
       │
       ▼
[Deepgram STT Engine] ──► WebSocket stream ──► Real-Time Transcript Segments
       │
       ▼
[FastAPI & SQLite WAL] ──► Stores Transcript ──► Broadcasts via WebSockets
       │
       ▼
[Gemini 1.5 AI / RAG] ──► Summaries, Action Items & Past Meeting Search
```
