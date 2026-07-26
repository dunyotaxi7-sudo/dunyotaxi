"""Fixed (flat per-trip) commission option, alongside percent.

Adds commission_type + commission_fixed to commission_config and updates the
process_ride_completion() trigger to charge a flat so'm amount per trip when
type = 'fixed' (capped at the fare so a driver never earns negative).

The two function bodies below are byte-for-byte the original
process_ride_completion() from buxoro_taxi_schema.sql except for the commission
computation block — total_earned, tx_type 'ride_earning', and the total_rides
increment are all preserved.

Revision ID: 0005_commission_fixed
Revises: 0004_doc_type_car_photos
Create Date: 2026-07-25
"""
from __future__ import annotations

from typing import Union

from alembic import op

revision: str = "0005_commission_fixed"
down_revision: Union[str, None] = "0004_doc_type_car_photos"
branch_labels = None
depends_on = None


def _fn(commission_block: str) -> str:
    return f"""
CREATE OR REPLACE FUNCTION process_ride_completion()
RETURNS TRIGGER AS $$
DECLARE
    v_commission_type VARCHAR(10);
    v_commission_pct  NUMERIC(5,2);
    v_commission_fix  INTEGER;
    v_commission_sum  INTEGER;
    v_driver_earning  INTEGER;
    v_wallet_id       UUID;
    v_new_balance     INTEGER;
    v_driver_user_id  UUID;
BEGIN
    IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN

{commission_block}
        v_driver_earning := NEW.price_sum - v_commission_sum;

        INSERT INTO driver_commissions
            (ride_id, driver_id, ride_amount, commission_pct, commission_sum, driver_earning)
        VALUES
            (NEW.id, NEW.driver_id, NEW.price_sum, v_commission_pct, v_commission_sum, v_driver_earning);

        SELECT user_id INTO v_driver_user_id FROM drivers WHERE id = NEW.driver_id;

        SELECT id INTO v_wallet_id FROM wallets WHERE user_id = v_driver_user_id;
        IF v_wallet_id IS NULL THEN
            INSERT INTO wallets (user_id) VALUES (v_driver_user_id) RETURNING id INTO v_wallet_id;
        END IF;

        IF NEW.payment_method = 'cash' THEN
            UPDATE wallets
            SET balance = balance - v_commission_sum,
                updated_at = NOW()
            WHERE id = v_wallet_id
            RETURNING balance INTO v_new_balance;

            INSERT INTO wallet_transactions
                (wallet_id, amount, tx_type, reference_id, description, balance_after)
            VALUES
                (v_wallet_id, -v_commission_sum, 'commission', NEW.id,
                 'Naqd sayohat komissiyasi', v_new_balance);
        ELSE
            UPDATE wallets
            SET balance = balance + v_driver_earning,
                total_earned = total_earned + v_driver_earning,
                updated_at = NOW()
            WHERE id = v_wallet_id
            RETURNING balance INTO v_new_balance;

            INSERT INTO wallet_transactions
                (wallet_id, amount, tx_type, reference_id, description, balance_after)
            VALUES
                (v_wallet_id, v_driver_earning, 'ride_earning', NEW.id,
                 'Sayohat daromadi', v_new_balance);
        END IF;

        UPDATE drivers SET total_rides = total_rides + 1 WHERE id = NEW.driver_id;

    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""


# type-aware commission: driver-specific config first, else global; 'fixed'
# charges a flat amount capped at the fare.
_BLOCK_WITH_FIXED = """\
        SELECT commission_type, commission_pct, commission_fixed
          INTO v_commission_type, v_commission_pct, v_commission_fix
        FROM commission_config
        WHERE (driver_id = NEW.driver_id OR driver_id IS NULL)
          AND valid_from <= CURRENT_DATE
          AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
        ORDER BY driver_id NULLS LAST
        LIMIT 1;

        v_commission_type := COALESCE(v_commission_type, 'percent');
        v_commission_pct  := COALESCE(v_commission_pct, 15.00);
        v_commission_fix  := COALESCE(v_commission_fix, 0);

        IF v_commission_type = 'fixed' THEN
            v_commission_sum := LEAST(v_commission_fix, NEW.price_sum);
            v_commission_pct := 0;
        ELSE
            v_commission_sum := ROUND(NEW.price_sum * v_commission_pct / 100);
        END IF;
"""

# original percent-only block, for downgrade
_BLOCK_PERCENT_ONLY = """\
        SELECT commission_pct INTO v_commission_pct
        FROM commission_config
        WHERE (driver_id = NEW.driver_id OR driver_id IS NULL)
          AND valid_from <= CURRENT_DATE
          AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
        ORDER BY driver_id NULLS LAST
        LIMIT 1;

        v_commission_pct := COALESCE(v_commission_pct, 15.00);
        v_commission_sum := ROUND(NEW.price_sum * v_commission_pct / 100);
"""


def upgrade() -> None:
    op.execute(
        "ALTER TABLE commission_config "
        "ADD COLUMN IF NOT EXISTS commission_type VARCHAR(10) NOT NULL DEFAULT 'percent'"
    )
    op.execute(
        "ALTER TABLE commission_config "
        "ADD COLUMN IF NOT EXISTS commission_fixed INTEGER NOT NULL DEFAULT 0"
    )
    op.execute(_fn(_BLOCK_WITH_FIXED))


def downgrade() -> None:
    # The percent-only body still declares the extra vars (harmless) but never
    # reads the dropped columns, so it's valid after the columns are gone.
    op.execute(_fn(_BLOCK_PERCENT_ONLY))
    op.execute("ALTER TABLE commission_config DROP COLUMN IF EXISTS commission_fixed")
    op.execute("ALTER TABLE commission_config DROP COLUMN IF EXISTS commission_type")
