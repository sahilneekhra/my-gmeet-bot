import json
import time
import unittest
from fastapi.testclient import TestClient
from app.main import app
from app.services.database import (
    save_transcript_segment,
    get_meeting_transcripts,
    export_transcripts,
)


class TestTranscriptsAndWebSockets(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_01_database_persistence_and_exports(self):
        meeting_id = f"test-meet-{int(time.time() * 1000)}"
        
        # 1. Insert segments
        seg1 = save_transcript_segment(
            segment_id=f"seg-001-{meeting_id}",
            meeting_id=meeting_id,
            speaker="Alex Smith",
            text="Welcome to the Phase 4 test meeting.",
            timestamp=time.time(),
            start_time=0.0,
            end_time=3.5,
        )
        self.assertEqual(seg1["speaker"], "Alex Smith")
        
        seg2 = save_transcript_segment(
            segment_id=f"seg-002-{meeting_id}",
            meeting_id=meeting_id,
            speaker="Maria Garcia",
            text="Thanks Alex, everything looks solid.",
            timestamp=time.time() + 4.0,
            start_time=4.0,
            end_time=7.2,
        )
        self.assertEqual(seg2["speaker"], "Maria Garcia")
        
        # 2. Query segments
        segments = get_meeting_transcripts(meeting_id)
        self.assertEqual(len(segments), 2)
        self.assertEqual(segments[0]["speaker"], "Alex Smith")
        self.assertEqual(segments[1]["speaker"], "Maria Garcia")
        
        # 3. Test Markdown Export
        md_export = export_transcripts(meeting_id, "markdown")
        self.assertIn(f"# Meeting Transcript: {meeting_id}", md_export)
        self.assertIn("Alex Smith", md_export)
        self.assertIn("Maria Garcia", md_export)
        
        # 4. Test SRT Subtitles Export
        srt_export = export_transcripts(meeting_id, "srt")
        self.assertIn("00:00:00,000 --> 00:00:03,500", srt_export)
        self.assertIn("[Alex Smith]: Welcome to the Phase 4 test meeting.", srt_export)
        self.assertIn("00:00:04,000 --> 00:00:07,200", srt_export)
        self.assertIn("[Maria Garcia]: Thanks Alex, everything looks solid.", srt_export)
        
        # 5. Test TXT Export
        txt_export = export_transcripts(meeting_id, "txt")
        self.assertIn("Alex Smith: Welcome to the Phase 4 test meeting.", txt_export)
        
        # 6. Test JSON Export
        json_export = export_transcripts(meeting_id, "json")
        parsed = json.loads(json_export)
        self.assertEqual(parsed["meeting_id"], meeting_id)
        self.assertEqual(len(parsed["segments"]), 2)

    def test_02_rest_export_endpoints(self):
        meeting_id = f"test-export-{int(time.time() * 1000)}"
        save_transcript_segment(
            segment_id=f"seg-exp-1-{meeting_id}",
            meeting_id=meeting_id,
            speaker="Test User",
            text="Testing REST export endpoints.",
            timestamp=time.time(),
        )
        
        # Markdown
        res_md = self.client.get(f"/api/meetings/{meeting_id}/export?format=markdown")
        self.assertEqual(res_md.status_code, 200)
        self.assertIn("text/markdown", res_md.headers.get("content-type", ""))
        self.assertIn("Testing REST export endpoints.", res_md.text)
        
        # SRT
        res_srt = self.client.get(f"/api/meetings/{meeting_id}/export?format=srt")
        self.assertEqual(res_srt.status_code, 200)
        self.assertIn("[Test User]: Testing REST export endpoints.", res_srt.text)
        
        # JSON
        res_json = self.client.get(f"/api/meetings/{meeting_id}/export?format=json")
        self.assertEqual(res_json.status_code, 200)
        data = res_json.json()
        self.assertEqual(data["meeting_id"], meeting_id)

    def test_03_websocket_gateway_and_live_broadcast(self):
        meeting_id = f"test-ws-{int(time.time() * 1000)}"
        
        # 1. Connect WebSocket client
        with self.client.websocket_connect(f"/api/ws/transcripts/{meeting_id}") as websocket:
            # Verify initial history replay on connect
            history_msg = websocket.receive_json()
            self.assertEqual(history_msg["event"], "history")
            self.assertEqual(history_msg["meeting_id"], meeting_id)
            self.assertEqual(history_msg["count"], 0)
            
            # 2. Post a live segment via REST endpoint
            res = self.client.post(
                f"/api/transcripts/{meeting_id}",
                json={
                    "speaker": "Bot Broadcaster",
                    "text": "Broadcasting live sentence across WebSockets!",
                    "timestamp": time.time(),
                    "is_final": True,
                },
            )
            self.assertEqual(res.status_code, 200)
            
            # 3. Verify WebSocket received broadcast
            broadcast_msg = websocket.receive_json()
            self.assertEqual(broadcast_msg["event"], "segment")
            self.assertEqual(broadcast_msg["meeting_id"], meeting_id)
            self.assertEqual(broadcast_msg["segment"]["speaker"], "Bot Broadcaster")
            self.assertEqual(broadcast_msg["segment"]["text"], "Broadcasting live sentence across WebSockets!")


if __name__ == "__main__":
    unittest.main()
