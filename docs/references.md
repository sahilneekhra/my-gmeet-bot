# Learning Resources, RFC Standards & Technical References

This document provides a **comprehensive curated list of official documentation, RFC protocol specifications, free open-source books, and tutorials** where you can learn everything about the technologies used in this project.

---

## 1. WebRTC, Media Streaming & Network Protocols

### 📚 Recommended Books & Free Guides
* **[WebRTC for the Curious (Free Open-Source Book)](https://webrtcforthecurious.com/)**:
  - *The best beginner-to-advanced book on WebRTC*. Explains SDP, ICE, RTP, DTLS, and DataChannels with clear diagrams.
* **[MDN WebRTC API Guide](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)**:
  - Mozilla’s official JavaScript WebRTC documentation covering `RTCPeerConnection`, `MediaStreamTrack`, and transceivers.
* **[WebRTC Architecture Overview (Web.dev)](https://web.dev/articles/webrtc-architecture)**:
  - Google's official visual guide on WebRTC architecture and peer connection lifecycles.

### 📜 Official IETF RFC Standards (How the Internet Works)
* **[RFC 8829: JavaScript Session Establishment Protocol (JSEP)](https://datatracker.ietf.org/doc/html/rfc8829)**:
  - The standard defining `createOffer()`, `createAnswer()`, and `setRemoteDescription()`.
* **[RFC 8866: Session Description Protocol (SDP)](https://datatracker.ietf.org/doc/html/rfc8866)**:
  - The exact specification of the SDP format and attribute lines (`m=audio`, `a=recvonly`, `a=rtpmap`).
* **[RFC 3550: Real-Time Transport Protocol (RTP)](https://datatracker.ietf.org/doc/html/rfc3550)**:
  - The core protocol used to deliver audio and video packets across the internet with timestamps and sequence numbers.
* **[RFC 6716: Definition of the Opus Audio Codec](https://datatracker.ietf.org/doc/html/rfc6716)**:
  - The specification for the Opus audio compression format used by Google Meet and Discord.
* **[RFC 8831: WebRTC Data Channels](https://datatracker.ietf.org/doc/html/rfc8831)**:
  - The standard explaining how SCTP over DTLS enables bidirectional data channels (`RTCDataChannel`).

---

## 2. Google Meet APIs & Google Cloud Platform

### 🏢 Google Official Developer Documentation
* **[Google Meet Media API Documentation](https://developers.google.com/meet/media-api)**:
  - Official guide on `spaces.connectActiveConference`, WebRTC SDP transceiver sequencing, and data channels.
* **[Google Meet Media API Data Channels Guide](https://developers.google.com/meet/media-api/guides/data-channels)**:
  - Full schema for `session-control`, `participants`, `media-entries`, and `media-stats` keepalive channels.
* **[Google Meet REST API v2 Overview](https://developers.google.com/meet/api/guides/overview)**:
  - Official documentation for managing spaces, conference records, participant lists, and Google Docs transcripts.
* **[Google Identity: OAuth 2.0 with PKCE](https://developers.google.com/identity/protocols/oauth2)**:
  - How Google's OAuth 2.0 authorization, refresh tokens, and scope permissions work.

---

## 3. Audio DSP & Web Audio Processing

### 🎛️ Digital Signal Processing (DSP) & Web Audio
* **[MDN Web Audio API Guide](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)**:
  - Complete documentation on `AudioContext`, `MediaStreamAudioSourceNode`, `AudioWorklet`, and audio buffers.
* **[Pulse Code Modulation (PCM) Fundamentals](https://en.wikipedia.org/wiki/Pulse-code_modulation)**:
  - Overview of raw digital audio, bit depth (16-bit vs 32-bit float), and sampling rates (48kHz vs 16kHz).
* **[Root Mean Square (RMS) Audio Metering](https://en.wikipedia.org/wiki/Root_mean_square)**:
  - The mathematical formulas behind calculating live sound power and building real-time VU volume meters.

---

## 4. Speech-to-Text (STT) & Real-Time Voice AI

### ⚡ Streaming Speech Recognition
* **[Deepgram Streaming WebSocket API Documentation](https://developers.deepgram.com/docs/getting-started-with-live-streaming-audio)**:
  - Complete guide on streaming 16kHz PCM audio buffers, subprotocol authentication, and parsing word-level JSON timestamps.
* **[Deepgram Nova-2 Model Overview](https://deepgram.com/learn/nova-2-speech-to-text-model)**:
  - Architecture and benchmarks of the Nova-2 conversational speech model.
* **[W3C Web Speech API Specification](https://wicg.github.io/speech-api/)**:
  - The web standard behind Chrome's built-in `SpeechRecognition` and `webkitSpeechRecognition` APIs.

---

## 5. Backend Architecture, Databases & Async Python

### ⚙️ FastAPI & Database Engineering
* **[FastAPI Official Tutorial & Architecture](https://fastapi.tiangolo.com/tutorial/)**:
  - Building high-performance asynchronous REST and WebSocket APIs in Python.
* **[Starlette WebSockets Guide](https://www.starlette.io/websockets/)**:
  - Understanding full-duplex WebSocket connections and connection managers in Python.
* **[SQLite Write-Ahead Logging (WAL) Explanation](https://www.sqlite.org/wal.html)**:
  - SQLite's official deep-dive on how WAL mode provides concurrent reading and writing without database lockups.
* **[PostgreSQL + pgvector](https://github.com/pgvector/pgvector)**:
  - Open-source vector similarity search for Postgres, used for production-grade RAG and meeting transcript search.

---

## 6. AI Intelligence, Summarization & RAG

### 🧠 Large Language Models & Semantic Retrieval
* **[Google Gemini 1.5 API Developer Documentation](https://ai.google.dev/gemini-api/docs)**:
  - Official guides on long-context processing with Gemini 1.5 Pro and Gemini 1.5 Flash.
* **[Retrieval-Augmented Generation (RAG) Architecture Guide](https://aws.amazon.com/what-is/rag/)**:
  - How vector embeddings, semantic retrieval, and prompt augmentation work together.
* **[Prompt Engineering Guide (DAIR.AI)](https://www.promptingguide.ai/)**:
  - Best practices for structuring prompts to extract meeting summaries, key decisions, and action items with owners.
