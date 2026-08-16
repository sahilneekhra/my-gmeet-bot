from fastapi import FastAPI

from app.routers import auth, health, meetings


tags_metadata = [
    {"name": "Health", "description": "Service health and useful entry points."},
    {"name": "Authentication", "description": "Google OAuth 2.0 authorization endpoints."},
    {"name": "Meetings", "description": "Read Google Meet conference records and artifacts."},
]

app = FastAPI(
    title="Google Meet Bot API",
    summary="Access Google Meet conference records through a simple API.",
    description=(
        "Authorize the application first with **GET /auth**, then use the "
        "meeting endpoints to retrieve conference records, participants, and "
        "available transcripts."
    ),
    version="0.1.0",
    openapi_tags=tags_metadata,
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(meetings.router)
