"""JWT creation/verification and small auth helpers."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt

from app.core.config import settings

ACCESS = "access"
REFRESH = "refresh"


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
