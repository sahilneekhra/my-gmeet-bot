import json
import sqlite3
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

DB_PATH = Path("gmeet_bot.db")


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # Enable WAL mode for high-concurrency non-blocking reads and writes
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn


def init_db():
    conn = get_db_connection()
    with conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS meetings (
                id TEXT PRIMARY KEY,
                space_id TEXT,
                title TEXT,
                transcription_mode TEXT DEFAULT 'streaming',
                created_at REAL,
                ended_at REAL,
                summary TEXT
            );
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS transcript_segments (
                id TEXT PRIMARY KEY,
                meeting_id TEXT NOT NULL,
                speaker TEXT NOT NULL,
                participant_id INTEGER,
                text TEXT NOT NULL,
                is_final INTEGER DEFAULT 1,
                timestamp REAL NOT NULL,
                start_time REAL,
                end_time REAL,
                words_json TEXT,
                created_at REAL,
                FOREIGN KEY (meeting_id) REFERENCES meetings (id)
            );
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_segments_meeting ON transcript_segments (meeting_id, timestamp);
            """
        )
    conn.close()


def save_meeting(
    meeting_id: str,
    space_id: Optional[str] = None,
    title: Optional[str] = None,
    transcription_mode: str = "streaming",
) -> Dict[str, Any]:
    conn = get_db_connection()
    now = time.time()
    with conn:
        conn.execute(
            """
            INSERT INTO meetings (id, space_id, title, transcription_mode, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                space_id = COALESCE(excluded.space_id, meetings.space_id),
                title = COALESCE(excluded.title, meetings.title),
                transcription_mode = excluded.transcription_mode;
            """,
            (meeting_id, space_id, title or f"Meeting {meeting_id}", transcription_mode, now),
        )
    conn.close()
    return {"id": meeting_id, "space_id": space_id, "title": title, "transcription_mode": transcription_mode}


def save_transcript_segment(
    segment_id: str,
    meeting_id: str,
    speaker: str,
    text: str,
    timestamp: float,
    is_final: bool = True,
    participant_id: Optional[int] = None,
    start_time: Optional[float] = None,
    end_time: Optional[float] = None,
    words: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    conn = get_db_connection()
    now = time.time()
    words_json = json.dumps(words) if words else None

    # Ensure meeting entry exists
    save_meeting(meeting_id)

    with conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO transcript_segments 
            (id, meeting_id, speaker, participant_id, text, is_final, timestamp, start_time, end_time, words_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (
                segment_id,
                meeting_id,
                speaker,
                participant_id,
                text,
                1 if is_final else 0,
                timestamp,
                start_time,
                end_time,
                words_json,
                now,
            ),
        )
    conn.close()
    return {
        "id": segment_id,
        "meeting_id": meeting_id,
        "speaker": speaker,
        "text": text,
        "timestamp": timestamp,
        "is_final": is_final,
    }


def get_meeting_transcripts(meeting_id: str) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.execute(
        """
        SELECT id, meeting_id, speaker, participant_id, text, is_final, timestamp, start_time, end_time, words_json
        FROM transcript_segments
        WHERE meeting_id = ?
        ORDER BY timestamp ASC;
        """,
        (meeting_id,),
    )
    rows = cursor.fetchall()
    conn.close()

    results = []
    for r in rows:
        words = json.loads(r["words_json"]) if r["words_json"] else None
        results.append(
            {
                "id": r["id"],
                "meeting_id": r["meeting_id"],
                "speaker": r["speaker"],
                "participant_id": r["participant_id"],
                "text": r["text"],
                "is_final": bool(r["is_final"]),
                "timestamp": r["timestamp"],
                "start_time": r["start_time"],
                "end_time": r["end_time"],
                "words": words,
            }
        )
    return results


def seconds_to_srt_time(seconds: float) -> str:
    millis = int((seconds % 1) * 1000)
    total_seconds = int(seconds)
    secs = total_seconds % 60
    mins = (total_seconds // 60) % 60
    hours = total_seconds // 3600
    return f"{hours:02d}:{mins:02d}:{secs:02d},{millis:03d}"


def export_transcripts(meeting_id: str, format_type: str = "markdown") -> str:
    segments = get_meeting_transcripts(meeting_id)

    if format_type == "json":
        return json.dumps({"meeting_id": meeting_id, "segments": segments}, indent=2)

    if not segments:
        return f"No transcript recorded for meeting {meeting_id}."

    first_timestamp = segments[0]["timestamp"] if segments else 0.0

    if format_type == "markdown":
        lines = [
            f"# Meeting Transcript: {meeting_id}",
            f"*Total Segments: {len(segments)}*",
            "",
            "---",
            "",
        ]
        for seg in segments:
            time_str = time.strftime("%H:%M:%S", time.localtime(seg["timestamp"]))
            speaker = seg["speaker"]
            text = seg["text"]
            lines.append(f"### `[{time_str}]` **{speaker}**")
            lines.append(f"> {text}")
            lines.append("")
        return "\n".join(lines)

    if format_type == "srt":
        srt_blocks = []
        for idx, seg in enumerate(segments, start=1):
            start = seg.get("start_time")
            if start is None:
                start = max(0.0, seg["timestamp"] - first_timestamp)
            end = seg.get("end_time")
            if end is None:
                end = start + 3.5  # default subtitle duration

            start_str = seconds_to_srt_time(start)
            end_str = seconds_to_srt_time(end)
            speaker = seg["speaker"]
            text = seg["text"]

            srt_blocks.append(f"{idx}\n{start_str} --> {end_str}\n[{speaker}]: {text}\n")
        return "\n".join(srt_blocks)

    if format_type == "txt":
        txt_lines = []
        for seg in segments:
            time_str = time.strftime("%H:%M:%S", time.localtime(seg["timestamp"]))
            txt_lines.append(f"[{time_str}] {seg['speaker']}: {seg['text']}")
        return "\n".join(txt_lines)

    return f"Unsupported format '{format_type}'. Supported: markdown, srt, txt, json."


# Initialize database tables on module import
init_db()
