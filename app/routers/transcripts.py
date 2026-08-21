import uuid
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.services.batch_transcriber import process_batch_audio_file
from app.services.database import (
    get_meeting_transcripts,
    save_meeting,
    save_transcript_segment,
)

router = APIRouter(prefix="/api", tags=["Transcripts & Batch Processing"])


class TranscriptSegmentPayload(BaseModel):
    id: Optional[str] = None
    speaker: str
    participant_id: Optional[int] = None
    track_id: Optional[str] = None
    text: str
    is_final: bool = True
    timestamp: float
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    words: Optional[List[Dict[str, Any]]] = None


class BatchTranscriptionResponse(BaseModel):
    meeting_id: str
    duration_seconds: float
    segments: List[Dict[str, Any]]
    summary: str


@router.post(
    "/meetings/{meeting_id}/transcribe-batch",
    response_model=BatchTranscriptionResponse,
    summary="Post-Meeting Batch Audio Transcription",
    description="Accepts a recorded WAV audio file uploaded when a meeting ends and transcribes it using Gemini 1.5 / Whisper.",
)
async def transcribe_meeting_batch(meeting_id: str, audio_file: UploadFile = File(...)):
    try:
        content = await audio_file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Empty audio file provided")

        result = process_batch_audio_file(
            file_bytes=content,
            meeting_id=meeting_id,
            filename=audio_file.filename or "meeting.wav",
        )

        save_meeting(meeting_id=meeting_id, transcription_mode="batch")

        for seg in result.get("segments", []):
            save_transcript_segment(
                segment_id=seg.get("id", str(uuid.uuid4())),
                meeting_id=meeting_id,
                speaker=seg.get("speaker", "Speaker"),
                text=seg.get("text", ""),
                timestamp=seg.get("timestamp", 0.0),
                is_final=seg.get("is_final", True),
                start_time=seg.get("start_time"),
                end_time=seg.get("end_time"),
            )

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Batch transcription failed: {str(e)}")


@router.post(
    "/transcripts/{meeting_id}",
    summary="Save Live Transcript Segment",
    description="Saves a finalized transcript segment from the real-time streaming STT pipeline into the SQLite database.",
)
def save_live_segment(meeting_id: str, payload: TranscriptSegmentPayload):
    segment_id = payload.id or str(uuid.uuid4())
    saved = save_transcript_segment(
        segment_id=segment_id,
        meeting_id=meeting_id,
        speaker=payload.speaker,
        text=payload.text,
        timestamp=payload.timestamp,
        is_final=payload.is_final,
        participant_id=payload.participant_id,
        start_time=payload.start_time,
        end_time=payload.end_time,
        words=payload.words,
    )
    return {"status": "success", "segment": saved}


@router.get(
    "/transcripts/{meeting_id}",
    summary="Get Meeting Transcripts",
    description="Returns all stored transcript segments for a meeting.",
)
def get_transcripts(meeting_id: str):
    segments = get_meeting_transcripts(meeting_id)
    return {
        "meeting_id": meeting_id,
        "count": len(segments),
        "segments": segments,
    }
