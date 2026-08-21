import logging
from typing import Dict, List
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WebSocketManager:
    """
    Manages active WebSocket subscribers listening to real-time meeting transcripts.
    Subscribers are partitioned by meeting_id.
    """

    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, meeting_id: str, websocket: WebSocket):
        await websocket.accept()
        if meeting_id not in self.active_connections:
            self.active_connections[meeting_id] = []
        self.active_connections[meeting_id].append(websocket)
        logger.info(
            f"[WebSocketManager] Client connected to meeting {meeting_id}. Total active: {len(self.active_connections[meeting_id])}"
        )

    def disconnect(self, meeting_id: str, websocket: WebSocket):
        if meeting_id in self.active_connections:
            if websocket in self.active_connections[meeting_id]:
                self.active_connections[meeting_id].remove(websocket)
            if not self.active_connections[meeting_id]:
                del self.active_connections[meeting_id]
        logger.info(f"[WebSocketManager] Client disconnected from meeting {meeting_id}.")

    async def broadcast(self, meeting_id: str, message: dict):
        """
        Broadcasts a JSON message to all active WebSocket clients listening to the specified meeting.
        Automatically removes dead/disconnected connections.
        """
        if meeting_id not in self.active_connections:
            return

        dead_connections: List[WebSocket] = []
        for connection in self.active_connections[meeting_id]:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning(f"[WebSocketManager] Failed to send message to client, marking for cleanup: {e}")
                dead_connections.append(connection)

        for dead in dead_connections:
            self.disconnect(meeting_id, dead)

    def get_active_count(self, meeting_id: str) -> int:
        return len(self.active_connections.get(meeting_id, []))


# Global singleton instance
ws_manager = WebSocketManager()
