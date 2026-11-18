 
import re
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

_HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
Day = Literal["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


class LoginIn(BaseModel):
    username: str
    password: str


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class CameraIn(BaseModel):
    camera_id: str = Field(min_length=1, max_length=50, pattern=r"^[A-Za-z0-9_\-]+$")
    name: str = Field(min_length=1, max_length=100)
    source: str = Field(min_length=1, max_length=500, description="rtsp://..., webcam index (0) or video file path")
    type: Literal["classroom", "hallway"] = "classroom"
    enabled: bool = True


class TimetableIn(BaseModel):
    class_id: str = Field(min_length=1, max_length=50, pattern=r"^[A-Za-z0-9_\-]+$")
    name: str = Field(min_length=1, max_length=120)
    room_camera_id: str
    days: List[Day] = Field(min_length=1)
    start_time: str
    end_time: str
    enrolled_students: List[str] = []

    @field_validator("start_time", "end_time")
    @classmethod
    def _hhmm(cls, v):
        if not _HHMM.match(v):
            raise ValueError("time must be HH:MM (24-hour)")
        return v

    @model_validator(mode="after")
    def _order(self):
        if self.start_time >= self.end_time:
            raise ValueError("end_time must be after start_time")
        self.days = list(dict.fromkeys(self.days))
        self.enrolled_students = list(dict.fromkeys(self.enrolled_students))
        return self


class SessionStartIn(BaseModel):
    class_id: str
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=240)


class ManualAttendanceIn(BaseModel):
    student_id: str
    class_id: str
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    status: Literal["Present", "Absent"]


class ReviewResolveIn(BaseModel):
    action: Literal["approve", "reject"]
    student_id: Optional[str] = None