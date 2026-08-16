import os

from fastapi import HTTPException
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from app.config import SCOPES, TOKEN_FILE


def get_meet_client():
    if not os.path.exists(TOKEN_FILE):
        raise HTTPException(status_code=401, detail="Not authenticated. Open /auth first.")

    credentials = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    return build("meet", "v2", credentials=credentials)


def get_conference_name(conference_id: str) -> str:
    return f"conferenceRecords/{conference_id}"
