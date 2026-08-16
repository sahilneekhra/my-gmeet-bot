# My Google Meet Bot — Implementation Plan

## Goal

Build a **Fireflies-like Google Meet meeting bot** that can:

1. Join a Google Meet as a participant.
2. Receive the live meeting audio.
3. Continuously convert speech to text.
4. Preserve speaker and timestamp information.
5. Store finalized transcript segments while the meeting is happening.
6. Generate AI meeting notes after the meeting.
7. Let users search and ask questions about past meetings.

> **Important:** This plan is for the same `my-gmeet-bot` project. The Google Cloud/OAuth setup and the existing REST API work are the foundation; the next major milestone is live media access.

---

## Current Status

```text
[✅] Google Cloud / OAuth
        ↓
[✅] Google Meet REST API
        ↓
[🔴] Meet Media API access
        ↓
[ ] Bot joins live Meet
        ↓
[ ] Receive live audio
        ↓
[ ] Streaming Speech-to-Text
        ↓
[ ] Persist transcript segments
        ↓
[ ] Associate speakers
        ↓
[ ] Handle meeting termination
        ↓
[ ] Generate AI summary
        ↓
[ ] Meeting history
        ↓
[ ] Search / RAG
        ↓
[ ] Chat over meetings
```

---

# Phase 1 — Google Cloud Foundation

Already completed.

```text
Google Cloud Project
        ↓
Google Meet API enabled
        ↓
OAuth consent configured
        ↓
Test users added
        ↓
OAuth Web Client created
        ↓
Redirect URI configured
        ↓
OAuth working
```

Keep this configuration. It will remain useful for the rest of the project.

---

# Phase 2 — Bot Identity and Meeting Creation

## Goal

The bot should have its own Google account and eventually appear in Google Meet as a visible participant such as:

```text
Meeting Bot
```

The application should eventually support a flow like:

```text
User
 ↓
Submits Meet URL
 ↓
Meeting Job created
 ↓
Bot joins meeting
```

Initially, testing should use meetings that we control because Google Meet permissions and Media API restrictions can make arbitrary meetings more complicated.

### Initial deliverable

A meeting job should contain information similar to:

```json
{
  "meeting_url": "...",
  "status": "queued"
}
```

---

# Phase 3 — Make the Bot Join the Google Meet

## This is the first major technical milestone

The Google Meet REST API is useful for meeting/conference data, but it is not the mechanism we should rely on for the bot's live media participation.

For the Fireflies-like functionality, investigate and implement the **Google Meet Media API**.

Conceptually:

```text
                    Google Meet
                         ↑
                         │
                    Bot joins
                         │
                  Meet Media API
                         ↑
                         │
                   Our bot service
```

The first goal is simply:

```text
Bot starts
   ↓
Connects to Meet
   ↓
Joins conference
   ↓
Bot appears as participant
```

### Important

The Google Meet Media API is currently a Developer Preview. Before building the whole system around it, verify the current enrollment, OAuth, participant, and meeting eligibility requirements.

Do not assume that every arbitrary Google Meet meeting can be accessed through the Media API.

---

# Phase 4 — Receive Live Audio

Once the bot can join the conference, the next goal is to receive live audio.

```text
Google Meet
     │
     │ live media
     ▼
Meet Media API
     │
     ▼
Our media service
```

At this stage we are **not doing AI yet**.

We only need to prove:

> Audio from the live meeting is successfully reaching our application.

---

# Phase 5 — Separate the Media Component

The existing Python FastAPI backend should remain responsible for application logic.

A possible project structure is:

```text
my-gmeet-bot/
│
├── backend/
│   └── Python FastAPI
│
└── media-bot/
    └── Meet Media / WebRTC component
```

## Backend responsibilities

- API endpoints
- Meeting jobs
- Database
- Authentication
- Meeting metadata
- AI processing
- Search
- Meeting history

## Media service responsibilities

- Connect to Google Meet
- Join the conference
- Handle WebRTC/media
- Receive audio
- Forward audio to Speech-to-Text

This separation keeps real-time media handling out of the main FastAPI application.

---

# Phase 6 — Streaming Speech-to-Text

Once live audio is available, add a streaming Speech-to-Text service.

The basic flow is:

```text
Meet audio
     ↓
Continuous audio stream
     ↓
Speech-to-Text
     ↓
Interim results
     ↓
Final results
```

We should **not wait for a speaker to finish a 20-minute speech**.

The transcript is built continuously.

Example:

```text
10:00
John starts talking

10:00–10:05
        ↓
      STT
        ↓
"I wanted to discuss..."

10:05–10:10
        ↓
      STT
        ↓
"The first issue is..."

10:10–10:15
        ↓
      STT
        ↓
"We should move the deadline..."
```

The exact audio chunking/streaming behavior will depend on the selected Speech-to-Text service.

---

# Phase 7 — Interim vs Final Transcript

Streaming STT systems can return temporary/interim results while speech is still being processed.

Example:

```text
INTERIM

"I think we should..."
```

Then:

```text
INTERIM

"I think we should move the deadline..."
```

Eventually:

```text
FINAL

"I think we should move the deadline to Friday."
```

## Database rule

Do not permanently save every interim result because that would create duplicates.

Instead:

```text
Audio
 ↓
STT
 ↓
INTERIM ──→ temporary state / live UI
 ↓
FINAL ────→ database
```

Only finalized transcript segments should normally be persisted as the permanent transcript.

---

# Phase 8 — Transcript Database

Every finalized segment should be stored.

A useful initial structure is:

| Field | Example |
|---|---|
| meeting_id | `meeting_123` |
| participant_id | `participant_45` |
| speaker_name | `John` |
| text | `Let's move the deadline to Friday.` |
| start_time | `10:10:03` |
| end_time | `10:10:08` |
| sequence | `142` |

A long meeting therefore becomes:

```text
Meeting
 │
 ├── Segment 1
 ├── Segment 2
 ├── Segment 3
 ├── Segment 4
 ├── ...
 └── Segment 500
```

## Why persist continuously?

If a 60-minute meeting is running and the bot crashes at minute 45, we should not lose the first 44 minutes.

Instead:

```text
minutes 0–44 → already stored
minute 45     → current processing
```

This makes the system much more resilient.

---

# Phase 9 — Speaker Identification

Speaker identification needs to be handled carefully.

The preferred architecture is to use participant/media information from the Meet media layer where available.

Conceptually:

```text
Participant A
     ↓
Audio stream
     ↓
STT
     ↓
John: "Let's start."
```

and:

```text
Participant B
     ↓
Audio stream
     ↓
STT
     ↓
Sarah: "Sure."
```

The exact relationship between Meet media streams and participants must be verified against the current Meet Media API behavior before implementation.

## Do not assume perfect speaker identification

Real meetings can contain interruptions and overlapping speech:

```text
John:  "I think we should—"
Sarah: "No, I disagree—"
John:  "—Friday."
```

The system should preserve timestamps and participant information where possible instead of forcing all speech into an artificially perfect sequence.

---

# Phase 10 — Long Speaking Turns

A participant might speak for:

- 5 seconds
- 5 minutes
- 30 minutes

The pipeline remains the same:

```text
Continuous audio
       ↓
Streaming STT
       ↓
Finalized segments
       ↓
Database
```

We do not create one huge 30-minute transcription request.

For example:

```text
John
│
├── 10:00:01 "Today I'd like to..."
├── 10:00:08 "discuss the project..."
├── 10:00:16 "The first issue..."
├── 10:00:25 "is the deadline..."
├── ...
└── 10:29:51 "That's everything from me."
```

This also makes the transcript searchable and easier to process later.

---

# Phase 11 — Meeting Completion

When the conference ends:

```text
Meeting
   ↓
Bot leaves
   ↓
Finalize outstanding transcript
   ↓
Mark meeting COMPLETE
```

The database should then contain something similar to:

```text
meeting.status = "completed"
```

At this point, the complete transcript is available for post-meeting processing.

---

# Phase 12 — Generate AI Meeting Notes

AI summarization should happen after the meeting transcript is complete.

```text
Complete transcript
       ↓
Chunk if necessary
       ↓
LLM
       ↓
Executive Summary
Key Decisions
Action Items
Important Topics
Open Questions
```

Example:

```text
Executive Summary
The team discussed the launch timeline and agreed to
move the release to Friday.

Key Decisions
- Release moved to Friday.

Action Items
- John: update deployment configuration.
- Sarah: inform the client.

Open Questions
- Final production approval is still pending.
```

The exact output format can be refined later.

---

# Phase 13 — Meeting History

The application should eventually provide a meeting history.

```text
                    My Meeting Bot

Meetings
────────────────────────────────
Monday — Project Planning
Tuesday — Client Discussion
Wednesday — Engineering Sync
Thursday — Product Review
```

Each meeting can contain:

```text
Meeting
 ├── Metadata
 ├── Participants
 ├── Transcript
 ├── Summary
 ├── Decisions
 └── Action Items
```

---

# Phase 14 — Ask Questions About Meetings

This is the Fireflies-like conversational layer.

Example:

> What did John say about the launch date last week?

Pipeline:

```text
Question
   ↓
Search meeting history
   ↓
Find relevant transcript segments
   ↓
Retrieve context
   ↓
LLM
   ↓
Answer
```

The answer should eventually include useful meeting context such as:

```text
John said that the launch should be moved to Friday
during the Project Planning meeting.

Timestamp: 10:10
```

Other possible questions:

```text
"What decisions were made about Project X?"

"Who owns the deployment task?"

"What did Sarah say about the budget?"

"Which meetings discussed the API migration?"
```

---

# Phase 15 — Real-Time Transcript UI

After the core backend works, add a live transcript interface.

Example:

```text
┌─────────────────────────────────────────────┐
│              Project Meeting                │
├─────────────────────────────────────────────┤
│                                             │
│ John     10:02                              │
│ We need to finish the API migration...      │
│                                             │
│ Sarah    10:03                              │
│ I can handle the deployment.                │
│                                             │
│ John     10:04                              │
│ Great, let's target Friday.                 │
│                                             │
└─────────────────────────────────────────────┘
```

The frontend can receive finalized transcript segments through a real-time mechanism such as WebSocket or SSE.

---

# Final Architecture

Eventually the project should look approximately like this:

```text
                         USER
                          │
                          ▼
                    FastAPI Backend
                          │
             ┌────────────┼─────────────┐
             │            │             │
             ▼            ▼             ▼
          Meetings      Jobs        Database
             │
             ▼
       Bot Controller
             │
             ▼
     Meet Media Service
             │
             ▼
        Google Meet
             │
             │ Live Audio
             ▼
      Speech-to-Text
             │
             ▼
     Final Transcript
             │
             ▼
          Database
             │
       ┌─────┴──────┐
       ▼            ▼
   AI Summary    Retrieval
       │            │
       └─────┬──────┘
             ▼
        AI Chatbot
```

---

# Development Order

Implement one milestone at a time.

```text
[✅] Google Cloud / OAuth
        ↓
[✅] Meet REST API
        ↓
[🔴] Meet Media API access
        ↓
[ ] Bot joins live Meet
        ↓
[ ] Receive live audio
        ↓
[ ] Streaming Speech-to-Text
        ↓
[ ] Receive interim/final transcript
        ↓
[ ] Persist transcript segments
        ↓
[ ] Associate speakers
        ↓
[ ] Handle meeting termination
        ↓
[ ] Generate AI summary
        ↓
[ ] Meeting history
        ↓
[ ] Search / RAG
        ↓
[ ] Chat over meetings
```

## Immediate Next Milestone

Do **not** start with Speech-to-Text yet.

First prove:

> **Our bot can connect to a live Google Meet through the Meet Media API and receive audio.**

Once actual audio is flowing into our application, Speech-to-Text becomes the next independent component.

---

# Important Design Principles

### 1. Do not depend entirely on Google's generated transcript

The goal is a Fireflies-like bot that can process the **live meeting audio** itself.

Google-generated transcripts can be useful as an additional source, but they should not be the fundamental assumption of the live bot architecture.

### 2. Save transcript segments continuously

Do not wait until the meeting ends to save everything.

```text
Audio → STT → Final segment → Database
```

### 3. Treat interim and final STT results differently

```text
Interim → temporary
Final   → permanent
```

### 4. Preserve timestamps

Every transcript segment should retain its start/end time.

This will be important for:

- meeting search
- citations
- UI
- action-item context
- answering questions about exactly when something was said

### 5. Do not assume perfect overlapping-speech handling

Two people speaking simultaneously can cause transcription errors. Preserve as much participant/timestamp information as the media layer provides and avoid pretending the resulting transcript is perfect.

### 6. Keep real-time media separate from application logic

The Meet/WebRTC/media component should not turn the FastAPI `main.py` into one giant real-time media application.

---

# Success Criteria

The project can be considered a functional Fireflies-like MVP when it can do all of the following:

- [ ] Accept a Google Meet meeting
- [ ] Have the bot join the meeting
- [ ] Show the bot as a participant
- [ ] Receive live meeting audio
- [ ] Perform streaming speech-to-text
- [ ] Produce finalized transcript segments continuously
- [ ] Associate speakers where possible
- [ ] Store transcript + timestamps
- [ ] Survive long speaking turns
- [ ] Handle meeting completion
- [ ] Generate an AI summary
- [ ] Generate action items and decisions
- [ ] Store meeting history
- [ ] Answer questions about previous meetings

The first concrete target is much smaller:

> **Bot joins → live audio arrives → prove we can see/process the audio.**

Everything else should be built on top of that working foundation.
