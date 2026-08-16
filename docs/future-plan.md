# Future Plan

This document describes the intended direction of `my-gmeet-bot`. It is a product and architecture roadmap, not an implementation guide.

## Goal

Create a meeting assistant that can join a Google Meet, retain what was discussed, and answer questions about individual meetings or the broader meeting history.

## Planned flow

```text
Meeting link submitted
        ↓
Bot is instructed to join the Google Meet
        ↓
Meeting conversation is captured and stored
        ↓
Transcript and meeting metadata are available for search
        ↓
Chat UI answers questions about discussions and past meetings
```

## Phase 1 — Submit a meeting link

Initially, provide the Google Meet URL through the Swagger interface. A proper web UI can replace or sit alongside Swagger later.

The submission should create a meeting job with, at minimum:

- the Google Meet URL;
- the requester or owner;
- a status such as `queued`, `joining`, `in_progress`, `completed`, or `failed`; and
- timestamps for creation and processing.

## Phase 2 — Join the meeting

Use the submitted meeting job to instruct the bot to join the Google Meet.

This phase needs a clear, policy-compliant joining approach. The Google Meet REST API is useful for authorized meeting records, but it does not by itself place a bot into a live meeting. The project will need to choose and validate a separate bot-participant approach, including how it authenticates and how participants are informed that recording or transcription is taking place.

### Intended meeting-creation flow

The bot/service should create the Google Meet link used for the meeting. That gives the system a predictable meeting to join and lets the organizer start the workflow from one place. The implementation must still account for Google Meet host, admission, and organization policies that may affect whether the bot can enter a meeting.

### Bot identity

The bot should be immediately recognizable as a meeting assistant, not as a human participant:

- **Display name:** `Meet Notes Bot — recording/transcribing`
- **Avatar:** a simple microphone-and-document icon
- **Join message:** “Meet Notes Bot joined to capture meeting notes. The organizer can remove it at any time.”

The final name and branding can change later, but clarity about the bot’s purpose is a product requirement from the beginning.

## Phase 3 — Capture and store meeting discussions

Once the bot has joined, retain the discussion in durable storage. The exact source may be a Google Meet-generated transcript when available, or a separately captured and transcribed audio stream if that becomes necessary.

Store data so that one meeting can have multiple related records rather than one large, opaque file. A useful logical model is:

- **Meeting**: link, title, start/end time, status, and ownership.
- **Participant**: identity and display name when available.
- **Transcript segment**: speaker, text, start/end timestamps, and source.
- **Derived notes**: optional summary, decisions, action items, and topics.

This structure supports incremental storage during a meeting and later consolidation into a full transcript or summary.

## Phase 4 — Chatbot interface

Build a chat UI over the stored meeting content. The assistant should be able to answer questions such as:

- “What was discussed in yesterday’s meeting?”
- “When did we discuss the launch date?”
- “What decisions were made in the design review?”
- “What action items were assigned to me?”

Responses should identify the relevant meeting and, where possible, point to timestamps and speakers so users can verify the source discussion.

## Important product considerations

- Meeting creation, recording/transcription controls, and access to saved content are restricted to the organizer and users explicitly granted permission by that organizer.
- Obtain appropriate consent and follow organizational, Google Meet, and local privacy requirements before joining, recording, or transcribing meetings.
- Keep raw audio, transcripts, tokens, and OAuth credentials protected and out of source control.
- Keep meetings separate. Users may query only meetings they organize or that they have been explicitly permitted to access.
- Design for transcript unavailability: Google Meet transcript data exists only when Google generated it and the account can access it.
- Retain original timestamps and speaker attribution where available; they make chatbot answers more trustworthy.

## Prototype and production direction

The prototype should remain free and intentionally minimal:

- Use Swagger as the initial interface for submitting a meeting URL and checking its status.
- Prioritize the end-to-end proof of concept over a polished product UI.
- Use free or local development-friendly storage and services where practical.

The production version can introduce paid infrastructure where it provides necessary reliability, scale, security, or AI capability. It should include a polished user interface, stronger permission management, data-retention controls, and operational monitoring.

## Suggested milestone order

1. Accept and validate a meeting URL through Swagger.
2. Persist the meeting job and expose its status.
3. Decide and validate the bot-joining method.
4. Capture or retrieve a transcript and save structured segments.
5. Create meeting summaries, decisions, and action items.
6. Add searchable retrieval across stored meetings.
7. Build the chatbot UI with citations back to meeting timestamps.
