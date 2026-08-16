import os
import secrets

from fastapi import FastAPI
from fastapi.responses import RedirectResponse

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build


app = FastAPI()

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

@app.get("/")
def home():
    return {
        "message": "Google Meet Bot is running",
        "auth": "/auth",
        "meetings": "/meetings",
    }


@app.get("/auth")
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


@app.get("/oauth2callback")
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


@app.get("/meetings")
def get_meetings():

    meet = get_meet_client()

    response = meet.conferenceRecords().list().execute()

    return {
        "raw_response": response,
        "conference_records": response.get("conferenceRecords", []),
        "count": len(response.get("conferenceRecords", [])),
    }

@app.get("/meetings/{conference_id}")
def get_meeting(conference_id: str):

    meet = get_meet_client()

    conference_name = get_conference_name(conference_id)

    response = meet.conferenceRecords().get(
        name=conference_name
    ).execute()

    return response

@app.get("/meetings/{conference_id}/participants")
def get_participants(conference_id: str):

    meet = get_meet_client()

    parent = get_conference_name(conference_id)

    return meet.conferenceRecords().participants().list(
        parent=parent
    ).execute()

@app.get("/meetings/{conference_id}/transcripts")
def get_transcripts(conference_id: str):

    meet = get_meet_client()

    parent = get_conference_name(conference_id)

    response = meet.conferenceRecords().transcripts().list(
        parent=parent
    ).execute()

    return response