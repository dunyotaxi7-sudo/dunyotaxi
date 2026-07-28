"""JWT creation/verification and small auth helpers."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings

ACCESS = "access"
REFRESH = "refresh"


# Operator passwords (no other account type uses a password — everyone else is
# phone + OTP). Use bcrypt directly; it only considers the first 72 bytes, and
# bcrypt 5+ raises rather than truncating, so we truncate explicitly.
def _pw_bytes(password: str) -> bytes:
    return password.encode("utf-8")[:72]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_pw_bytes(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(_pw_bytes(password), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def _create_token(
    subject: str, role: str, token_type: str, expires_minutes: int
) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": subject,
        "role": role,
        "type": token_type,
        "iat": now,
        "exp": now + timedelta(minutes=expires_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_access_token(user_id: str, role: str) -> str:
    return _create_token(
        user_id, role, ACCESS, settings.access_token_expire_minutes
    )


def create_refresh_token(user_id: str, role: str) -> str:
    return _create_token(
        user_id, role, REFRESH, settings.refresh_token_expire_minutes
    )


def decode_token(token: str) -> dict[str, Any]:
    """Decode & validate a JWT. Raises ``JWTError`` on failure."""
    return jwt.decode(
        token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
    )


def safe_decode(token: str) -> dict[str, Any] | None:
    try:
        return decode_token(token)
    except JWTError:
        return None
