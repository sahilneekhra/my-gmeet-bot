from fastapi import APIRouter
from fastapi.responses import RedirectResponse

from app.schemas import ErrorResponse, OAuthSuccessResponse
from app.services.oauth import exchange_code_for_token, get_authorization_url, get_current_token


router = APIRouter(tags=["Authentication"])


@router.get(
    "/auth",
    include_in_schema=False,
    summary="Start Google authorization",
    description="Redirects the browser to Google so the user can authorize access.",
    response_description="Redirect to Google's OAuth consent page.",
)
def authenticate():
    return RedirectResponse(get_authorization_url())


@router.get(
    "/oauth2callback",
    include_in_schema=False,
    summary="Complete Google authorization",
    description="OAuth callback used by Google. Call `/auth` instead of invoking this endpoint directly.",
    response_model=OAuthSuccessResponse,
    responses={400: {"model": ErrorResponse, "description": "Invalid or expired OAuth state."}},
)
def oauth2callback(code: str, state: str):
    exchange_code_for_token(code, state)
    return {"message": "Google OAuth successful!", "token_saved": True}


@router.get(
    "/auth/token",
    summary="Get active OAuth access token",
    description="Returns the currently active Google OAuth access token for WebRTC / bot client.",
)
def get_token():
    token = get_current_token()
    return {"access_token": token}
