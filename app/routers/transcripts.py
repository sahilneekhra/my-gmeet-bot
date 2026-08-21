import uuid
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, File, HTTPException, Query, Response, UploadFile, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from app.services.batch_transcriber import process_batch_audio_file
from app.services.database import (
    export_transcripts,
    get_meeting_transcripts,
    save_meeting,
    save_transcript_segment,
)
from app.services.websocket_manager import ws_manager

router = APIRouter(prefix="/api", tags=["Transcripts, WebSockets & Exports"])


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


@router.websocket("/ws/transcripts/{meeting_id}")
async def transcript_websocket_endpoint(websocket: WebSocket, meeting_id: str):
    """
    Real-time WebSocket feed for live meeting transcripts.
    On connect: Sends full existing transcript history for catch-up.
    Ongoing: Streams real-time finalized segments as they are spoken.
    """
    await ws_manager.connect(meeting_id, websocket)
    try:
        # 1. Send existing transcript history immediately on connection
        history = get_meeting_transcripts(meeting_id)
        await websocket.send_json(
            {
                "event": "history",
                "meeting_id": meeting_id,
                "count": len(history),
                "segments": history,
            }
        )

        # 2. Keep listening for client heartbeats or messages
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(meeting_id, websocket)
    except Exception:
        ws_manager.disconnect(meeting_id, websocket)


@router.post(
    "/transcripts/{meeting_id}",
    summary="Save & Broadcast Live Transcript Segment",
    description="Saves a finalized segment to SQLite and broadcasts it across WebSockets to all connected viewers in real time.",
)
async def save_live_segment(meeting_id: str, payload: TranscriptSegmentPayload):
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

    # Real-time WebSocket Broadcast
    await ws_manager.broadcast(
        meeting_id,
        {
            "event": "segment",
            "meeting_id": meeting_id,
            "segment": saved,
        },
    )

    return {"status": "success", "segment": saved}


@router.post(
    "/meetings/{meeting_id}/transcribe-batch",
    response_model=BatchTranscriptionResponse,
    summary="Post-Meeting Batch Audio Transcription & Broadcast",
    description="Accepts a recorded WAV audio file uploaded when a meeting ends, transcribes it, saves to DB, and broadcasts results.",
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

        # Broadcast batch completion across WebSockets
        await ws_manager.broadcast(
            meeting_id,
            {
                "event": "batch_complete",
                "meeting_id": meeting_id,
                "summary": result["summary"],
                "segments": result["segments"],
            },
        )

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Batch transcription failed: {str(e)}")


@router.get(
    "/transcripts/{meeting_id}",
    summary="Get Meeting Transcripts (JSON)",
    description="Returns all stored transcript segments for a meeting.",
)
def get_transcripts(meeting_id: str):
    segments = get_meeting_transcripts(meeting_id)
    return {
        "meeting_id": meeting_id,
        "count": len(segments),
        "segments": segments,
    }


@router.get(
    "/meetings/{meeting_id}/export",
    summary="Export Meeting Transcript in Multiple Formats",
    description="Exports the complete transcript formatted as Markdown (.md), Subtitles (.srt), Text (.txt), or Raw JSON (.json).",
)
def export_meeting_transcript(
    meeting_id: str,
    format: str = Query("markdown", description="Export format: markdown, srt, txt, or json"),
):
    format_lower = format.lower().strip()
    if format_lower not in ["markdown", "srt", "txt", "json"]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid format '{format}'. Supported formats: markdown, srt, txt, json.",
        )

    formatted_content = export_transcripts(meeting_id, format_lower)

    media_types = {
        "markdown": "text/markdown; charset=utf-8",
        "srt": "text/plain; charset=utf-8",
        "txt": "text/plain; charset=utf-8",
        "json": "application/json; charset=utf-8",
    }
    extensions = {
        "markdown": "md",
        "srt": "srt",
        "txt": "txt",
        "json": "json",
    }

    filename = f"meeting_{meeting_id}.{extensions[format_lower]}"
    return Response(
        content=formatted_content,
        media_type=media_types[format_lower],
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
