import os
import secrets

from fastapi import HTTPException
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow

from app.config import CLIENT_SECRET_FILE, REDIRECT_URI, SCOPES, TOKEN_FILE


_oauth_states: dict[str, str] = {}


def _create_flow(code_verifier: str) -> Flow:
    return Flow.from_client_secrets_file(
        CLIENT_SECRET_FILE,
        scopes=SCOPES,
        redirect_uri=REDIRECT_URI,
        code_verifier=code_verifier,
        autogenerate_code_verifier=False,
    )


def get_authorization_url() -> str:
    code_verifier = secrets.token_urlsafe(96)
    flow = _create_flow(code_verifier)
    authorization_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    _oauth_states[state] = code_verifier
    return authorization_url


def exchange_code_for_token(code: str, state: str) -> None:
    code_verifier = _oauth_states.pop(state, None)
    if not code_verifier:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired OAuth state. Start /auth again.",
        )

    flow = _create_flow(code_verifier)
    flow.fetch_token(code=code)

    with open(TOKEN_FILE, "w") as token:
        token.write(flow.credentials.to_json())


def get_current_token() -> str:
    if not os.path.exists(TOKEN_FILE):
        raise HTTPException(status_code=401, detail="Not authenticated. Open /auth first.")

    credentials = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    if not credentials.valid:
        if credentials.expired and credentials.refresh_token:
            credentials.refresh(Request())
            with open(TOKEN_FILE, "w") as token:
                token.write(credentials.to_json())
        else:
            raise HTTPException(status_code=401, detail="Token expired. Please re-authenticate at /auth.")

    return credentials.token
