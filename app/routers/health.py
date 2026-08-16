from fastapi import APIRouter

from app.schemas import ServiceStatusResponse


router = APIRouter(tags=["Health"])


@router.get(
    "/",
    summary="Get service status",
    response_description="Service status and API entry points.",
    response_model=ServiceStatusResponse,
)
def home():
    return {
        "message": "Google Meet Bot is running",
        "auth": "/auth",
        "meetings": "/meetings",
    }
