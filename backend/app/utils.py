from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo
from bson import ObjectId
from .config import settings

DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
TZ = ZoneInfo(settings.timezone)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def local_now() -> datetime:
    return datetime.now(TZ)


def today_str() -> str:
    return local_now().date().isoformat()


def parse_hhmm(value: str):
    h, m = value.split(":")
    return int(h), int(m)


def serialize(obj):
    if isinstance(obj, dict):
        return {("id" if k == "_id" else k): serialize(v) for k, v in obj.items() if k != "face_encoding"}
    if isinstance(obj, (list, tuple)):
        return [serialize(v) for v in obj]
    if isinstance(obj, ObjectId):
        return str(obj)
    if isinstance(obj, datetime):
        if obj.tzinfo is None:
            obj = obj.replace(tzinfo=timezone.utc)
        return obj.astimezone(timezone.utc).isoformat()
    if isinstance(obj, date):
        return obj.isoformat()
    return obj
