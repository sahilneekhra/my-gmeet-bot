from typing import Any

from pydantic import BaseModel, Field


class ErrorResponse(BaseModel):
    detail: str = Field(description="Human-readable explanation of the error.")


class ServiceStatusResponse(BaseModel):
    message: str
    auth: str
    meetings: str


class OAuthSuccessResponse(BaseModel):
    message: str
    token_saved: bool


class ConferenceRecordResponse(BaseModel):
    name: str = Field(description="Conference resource name.")
    startTime: str | None = Field(default=None, description="Conference start time in RFC 3339 format.")
    endTime: str | None = Field(default=None, description="Conference end time, or null while active.")
    expireTime: str | None = Field(default=None, description="When Google deletes this conference record.")
    space: str | None = Field(default=None, description="Meeting space resource name.")


class ConferenceListResponse(BaseModel):
    raw_response: dict[str, Any] = Field(description="Complete response returned by Google Meet.")
    conference_records: list[ConferenceRecordResponse]
    count: int


class SignedInUserResponse(BaseModel):
    user: str
    displayName: str


class DisplayNameResponse(BaseModel):
    displayName: str


class ParticipantResponse(BaseModel):
    name: str
    earliestStartTime: str | None = None
    latestEndTime: str | None = None
    signedinUser: SignedInUserResponse | None = None
    anonymousUser: DisplayNameResponse | None = None
    phoneUser: DisplayNameResponse | None = None


class ParticipantListResponse(BaseModel):
    participants: list[ParticipantResponse] = Field(default_factory=list)
    nextPageToken: str | None = None


class DocsDestinationResponse(BaseModel):
    document: str | None = Field(default=None, description="Google Docs resource containing the transcript.")


class TranscriptResponse(BaseModel):
    name: str
    state: str
    startTime: str | None = None
    endTime: str | None = None
    docsDestination: DocsDestinationResponse | None = None


class TranscriptListResponse(BaseModel):
    transcripts: list[TranscriptResponse] = Field(default_factory=list)
    nextPageToken: str | None = None
