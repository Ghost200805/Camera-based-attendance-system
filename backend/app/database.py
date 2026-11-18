"""MongoDB connection + indexes.

Collections (names follow the project spec):
  Users, Timetable, Attendance, Locations, Review_Queue
Extra helper collections:
  Cameras (camera_id -> RTSP url), Sessions (what ran today), Admins (logins)
"""
import logging

from pymongo import ASCENDING, DESCENDING, MongoClient

from .config import settings

log = logging.getLogger("db")
_client = None
_db = None


def get_db():
    global _client, _db
    if _db is None:
        if settings.mongo_uri.startswith("mongomock"):
            import mongomock  # dev/demo only

            log.warning("Using in-memory mongomock database - data is NOT persisted!")
            _client = mongomock.MongoClient(tz_aware=True)
        else:
            _client = MongoClient(
                settings.mongo_uri, tz_aware=True, serverSelectionTimeoutMS=5000
            )
        _db = _client[settings.mongo_db]
    return _db


def init_db():
    db = get_db()
    # Fail early with a clear message if MongoDB is unreachable
    try:
        _client.admin.command("ping")
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            f"Cannot connect to MongoDB at '{settings.mongo_uri}'. "
            "Start MongoDB (docker compose up -d mongo) or fix MONGO_URI in .env. "
            f"Details: {exc}"
        ) from exc

    db.Users.create_index("student_id", unique=True)
    db.Cameras.create_index("camera_id", unique=True)
    db.Timetable.create_index("class_id", unique=True)
    db.Admins.create_index("username", unique=True)
    db.Attendance.create_index(
        [("student_id", ASCENDING), ("date", ASCENDING), ("class_id", ASCENDING)],
        unique=True,
    )
    db.Attendance.create_index([("date", DESCENDING)])
    db.Locations.create_index("student_id", unique=True)
    db.Review_Queue.create_index([("status", ASCENDING), ("timestamp", DESCENDING)])
    db.Sessions.create_index(
        [("class_id", ASCENDING), ("date", ASCENDING)], unique=True
    )
    log.info("Database ready (%s)", settings.mongo_db)
    return db