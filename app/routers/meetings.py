from fastapi import APIRouter

from app.schemas import (
    ConferenceListResponse,
    ConferenceRecordResponse,
    ErrorResponse,
    ParticipantListResponse,
    TranscriptListResponse,
)
from app.services.meet import get_conference_name, get_meet_client


router = APIRouter(tags=["Meetings"])
AUTH_RESPONSES = {401: {"model": ErrorResponse, "description": "Google authorization is required."}}


@router.get(
    "/meetings",
    summary="List conference records",
    description="Returns conferences visible to the authorized Google account.",
    response_model=ConferenceListResponse,
    responses=AUTH_RESPONSES,
)
def get_meetings():
    response = get_meet_client().conferenceRecords().list().execute()
    return {
        "raw_response": response,
        "conference_records": response.get("conferenceRecords", []),
        "count": len(response.get("conferenceRecords", [])),
    }


@router.get(
    "/meetings/{conference_id}",
    summary="Get a conference record",
    description="Use the conference ID without the `conferenceRecords/` prefix.",
    response_model=ConferenceRecordResponse,
    responses=AUTH_RESPONSES,
)
def get_meeting(conference_id: str):
    return get_meet_client().conferenceRecords().get(
        name=get_conference_name(conference_id)
    ).execute()


@router.get(
    "/meetings/{conference_id}/participants",
    summary="List conference participants",
    description="Returns participant records for a conference.",
    response_model=ParticipantListResponse,
    responses=AUTH_RESPONSES,
)
def get_participants(conference_id: str):
    return get_meet_client().conferenceRecords().participants().list(
        parent=get_conference_name(conference_id)
    ).execute()


@router.get(
    "/meetings/{conference_id}/transcripts",
    summary="List conference transcripts",
    description="Returns transcripts only when transcription was enabled for the conference.",
    response_model=TranscriptListResponse,
    responses=AUTH_RESPONSES,
)
def get_transcripts(conference_id: str):
    return get_meet_client().conferenceRecords().transcripts().list(
        parent=get_conference_name(conference_id)
    ).execute()
