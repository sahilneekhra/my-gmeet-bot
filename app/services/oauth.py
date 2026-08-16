import secrets

from fastapi import HTTPException
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
