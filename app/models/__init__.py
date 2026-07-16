"""SQLAlchemy ORM models — mirror of buxoro_taxi_schema.sql.

Triggers (rating update, ride-completion commission, bonus payout) live in
the database and are intentionally NOT reproduced here.
"""
from app.models.user import User, Driver, DriverDocument
from app.models.ride import Ride, Payment, Rating
from app.models.finance import (
    PricingConfig,
    CommissionConfig,
    DriverCommission,
    Wallet,
    WalletTransaction,
)
from app.models.bonus import (
    BonusCampaign,
    BonusAchievement,
    PromoCode,
    PromoUsage,
)
from app.models.system import Notification, AdminAuditLog, ServiceArea

__all__ = [
    "User",
    "Driver",
    "DriverDocument",
    "Ride",
    "Payment",
    "Rating",
    "PricingConfig",
    "CommissionConfig",
    "DriverCommission",
    "Wallet",
    "WalletTransaction",
    "BonusCampaign",
    "BonusAchievement",
    "PromoCode",
    "PromoUsage",
    "Notification",
    "AdminAuditLog",
    "ServiceArea",
]
