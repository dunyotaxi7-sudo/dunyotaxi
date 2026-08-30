"""Signed URLs for private uploads (driver documents).

Files under ``/uploads`` are NOT public: the URL carries a short-lived HMAC
signature that the ``/uploads`` route verifies. API responses hand freshly
signed URLs to authenticated callers (the owning driver, or an admin/operator),
so an ``<img src>`` works without an auth header — but a leaked or guessed path
stops working once the signature expires, and can't be forged without the key.
"""
from __future__ import annotations

import hashlib
import hmac
import time

from app.core.config import settings

# Long enough for an admin moderation session; the app re-fetches fresh URLs.
_DEFAULT_TTL = 6 * 3600  # 6 hours


def _sig(path: str, exp: int) -> str:
    msg = f"{path}:{exp}".encode()
    return hmac.new(
        settings.jwt_secret.encode(), msg, hashlib.sha256
    ).hexdigest()[:32]


def sign(path: str, ttl: int = _DEFAULT_TTL) -> str:
    """Return ``path`` with ``?exp=…&sig=…`` appended."""
    exp = int(time.time()) + ttl
    return f"{path}?exp={exp}&sig={_sig(path, exp)}"


def verify(path: str, exp: str | None, sig: str | None) -> bool:
    """True if the signature is valid and unexpired."""
    if not exp or not sig:
        return False
    try:
        exp_i = int(exp)
    except (TypeError, ValueError):
        return False
    if exp_i < int(time.time()):
        return False
    return hmac.compare_digest(sig, _sig(path, exp_i))
