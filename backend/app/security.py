"""Password hashing (PBKDF2, stdlib) + JWT login for the admin dashboard."""
import hashlib
import hmac
import logging
import os
from datetime import timedelta

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import settings
from .database import get_db
from .utils import now_utc

log = logging.getLogger("security")
_bearer = HTTPBearer(auto_error=False)
_ITER = 200_000


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _ITER)
    return f"{salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, dk_hex = stored.split("$")
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), _ITER)
        return hmac.compare_digest(dk.hex(), dk_hex)
    except Exception:  # noqa: BLE001
        return False


def create_token(username: str) -> str:
    payload = {
        "sub": username,
        "exp": now_utc() + timedelta(minutes=settings.token_expire_minutes),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def require_admin(creds: HTTPAuthorizationCredentials = Depends(_bearer)) -> str:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not logged in")
    try:
        data = jwt.decode(creds.credentials, settings.secret_key, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired. Log in again.")
    username = data.get("sub")
    if not get_db().Admins.find_one({"username": username}):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown account")
    return username


def ensure_admin():
    db = get_db()
    if db.Admins.count_documents({}) == 0:
        db.Admins.insert_one(
            {
                "username": settings.admin_username,
                "password_hash": hash_password(settings.admin_password),
                "created_at": now_utc(),
            }
        )
        log.warning(
            "Created admin account '%s'. Change the password after first login!",
            settings.admin_username,
        )
