import os
import secrets

from fastapi import FastAPI
from fastapi.responses import RedirectResponse

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build


tags_metadata = [
    {
        "name": "Health",
        "description": "Service health and useful entry points.",
    },
    {
        "name": "Authentication",
        "description": "Google OAuth 2.0 authorization endpoints.",
    },
    {
        "name": "Meetings",
        "description": "Read Google Meet conference records and artifacts.",
    },
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

CLIENT_SECRET_FILE = "google_client_secret.json"
TOKEN_FILE = "token.json"

SCOPES = [
    "https://www.googleapis.com/auth/meetings.space.readonly"
]

REDIRECT_URI = "http://localhost:8000/oauth2callback"

# Stores the PKCE verifier between /auth and /oauth2callback
oauth_states = {}


def create_flow(code_verifier: str):
    return Flow.from_client_secrets_file(
        CLIENT_SECRET_FILE,
        scopes=SCOPES,
        redirect_uri=REDIRECT_URI,
        code_verifier=code_verifier,
        autogenerate_code_verifier=False,
    )

def get_meet_client():
    if not os.path.exists(TOKEN_FILE):
        raise Exception("Not authenticated. Open /auth first.")

    credentials = Credentials.from_authorized_user_file(
        TOKEN_FILE,
        SCOPES,
    )

    return build(
        "meet",
        "v2",
        credentials=credentials,
    )

def get_conference_name(conference_id):
    return f"conferenceRecords/{conference_id}"

@app.get(
    "/",
    tags=["Health"],
    summary="Get service status",
    response_description="Service status and API entry points.",
)
def home():
    return {
        "message": "Google Meet Bot is running",
        "auth": "/auth",
        "meetings": "/meetings",
    }


@app.get(
    "/auth",
    tags=["Authentication"],
    summary="Start Google authorization",
    description="Redirects the browser to Google so the user can authorize access.",
    response_description="Redirect to Google's OAuth consent page.",
)
def authenticate():

    code_verifier = secrets.token_urlsafe(96)

    flow = create_flow(code_verifier)

    authorization_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )

    oauth_states[state] = code_verifier

    return RedirectResponse(authorization_url)


@app.get(
    "/oauth2callback",
    tags=["Authentication"],
    summary="Complete Google authorization",
    description="OAuth callback used by Google. Call `/auth` instead of invoking this endpoint directly.",
)
def oauth2callback(code: str, state: str):

    code_verifier = oauth_states.pop(state, None)

    if not code_verifier:
        return {
            "error": "Invalid or expired OAuth state. Start /auth again."
        }

    flow = create_flow(code_verifier)

    flow.fetch_token(code=code)

    credentials = flow.credentials

    with open(TOKEN_FILE, "w") as token:
        token.write(credentials.to_json())

    return {
        "message": "Google OAuth successful!",
        "token_saved": True,
    }


@app.get(
    "/meetings",
    tags=["Meetings"],
    summary="List conference records",
    description="Returns conferences visible to the authorized Google account.",
)
def get_meetings():

    meet = get_meet_client()

    response = meet.conferenceRecords().list().execute()

    return {
        "raw_response": response,
        "conference_records": response.get("conferenceRecords", []),
        "count": len(response.get("conferenceRecords", [])),
    }

@app.get(
    "/meetings/{conference_id}",
    tags=["Meetings"],
    summary="Get a conference record",
    description="Use the conference ID without the `conferenceRecords/` prefix.",
)
def get_meeting(conference_id: str):

    meet = get_meet_client()

    conference_name = get_conference_name(conference_id)

    response = meet.conferenceRecords().get(
        name=conference_name
    ).execute()

    return response

@app.get(
    "/meetings/{conference_id}/participants",
    tags=["Meetings"],
    summary="List conference participants",
    description="Returns participant records for a conference.",
)
def get_participants(conference_id: str):

    meet = get_meet_client()

    parent = get_conference_name(conference_id)

    return meet.conferenceRecords().participants().list(
        parent=parent
    ).execute()

@app.get(
    "/meetings/{conference_id}/transcripts",
    tags=["Meetings"],
    summary="List conference transcripts",
    description="Returns transcripts only when transcription was enabled for the conference.",
)
def get_transcripts(conference_id: str):

    meet = get_meet_client()

    parent = get_conference_name(conference_id)

    response = meet.conferenceRecords().transcripts().list(
        parent=parent
    ).execute()

    return response
