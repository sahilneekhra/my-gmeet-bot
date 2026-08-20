from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
        "## Authentication\n\n"
        "Before using the meeting endpoints, open "
        "[http://localhost:8000/auth](http://localhost:8000/auth) directly "
        "in your browser and complete Google authorization. The OAuth routes "
        "are intentionally hidden from Swagger because they are browser-only.\n\n"
        "After authorization, use the meeting endpoints to retrieve conference "
        "records, participants, and available transcripts."
    ),
    version="0.1.0",
    openapi_tags=tags_metadata,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(meetings.router)
