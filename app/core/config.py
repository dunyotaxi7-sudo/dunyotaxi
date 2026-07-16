"""Application configuration loaded from environment / .env."""
from __future__ import annotations

from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # App
    app_name: str = "Bukhara Taxi"
    environment: str = "development"
    debug: bool = True

    # Database — async URL used by the app.
    database_url: str = (
        "postgresql+asyncpg://postgres:postgres@localhost:5432/buxoro_taxi"
    )

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # JWT
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 43200
    refresh_token_expire_minutes: int = 129600

    # OTP
    otp_ttl_seconds: int = 120
    otp_length: int = 6
    otp_max_attempts: int = 5
    # Echo the code in the API response. Ignored unless SMS_PROVIDER=mock, so a
    # real code can never leak. Defaults off — production-safe.
    otp_debug_return: bool = False

    # Matching — stored as a raw CSV string; parsed via the property below.
    match_radii_meters_raw: str = Field(
        default="3000,5000,8000",
        validation_alias=AliasChoices("MATCH_RADII_METERS", "match_radii_meters_raw"),
    )
    driver_accept_timeout_seconds: int = 15

    # Driver wallet: the lowest balance (debt limit) a driver may reach and still
    # receive orders. At or below this, dispatch skips them until they top up.
    min_driver_balance: int = -15000

    # SMS delivery. "eskiz" sends real SMS via Eskiz.uz — the default, so a
    # deployment always sends real codes. "mock" only logs them and exists for
    # the automated tests (which must never spend real SMS).
    sms_provider: str = "eskiz"
    sms_api_url: str = ""
    sms_api_token: str = ""

    # Eskiz.uz gateway (https://notify.eskiz.uz/api). The OTP text must be
    # registered/approved in your Eskiz account or sends are rejected.
    eskiz_base_url: str = "https://notify.eskiz.uz/api"
    eskiz_email: str = ""
    eskiz_password: str = ""
    # Optional pre-issued bearer token. Used only when email+password aren't set.
    # It expires (~30 days) and cannot self-renew — prefer email+password.
    eskiz_token: str = ""
    eskiz_from: str = "4546"  # approved sender id
    otp_message_template: str = (
        "Buxoro Taxi: tasdiqlash kodi {code}. Kodni hech kimga bermang."
    )

    # OTP abuse limits (SMS costs money and spamming a number is harassment).
    otp_resend_cooldown_seconds: int = 60
    otp_max_per_phone_hour: int = 5
    otp_max_per_phone_day: int = 10
    otp_max_per_ip_hour: int = 20

    @property
    def match_radii_meters(self) -> list[int]:
        return [
            int(p.strip())
            for p in self.match_radii_meters_raw.split(",")
            if p.strip()
        ]

    @property
    def sync_database_url(self) -> str:
        """Sync URL for Alembic (psycopg v3)."""
        return self.database_url.replace("+asyncpg", "").replace(
            "postgresql://", "postgresql+psycopg://", 1
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
