"""Combined commission (fixed base + percent) and deterministic config pick.

Two fixes to how driver commission is charged on ride completion:

1. The config SELECT in process_ride_completion() had no recency ordering, so
   with several overlapping active global configs it picked an arbitrary (stale)
   one — a newly-set rate never took effect. Now it orders by
   ``valid_from DESC, id DESC`` (after driver-specific), i.e. the newest wins.

2. Adds a ``combined`` commission type: a flat ``commission_fixed`` base PLUS
   ``commission_pct`` of the fare (capped at the fare). ``percent`` and ``fixed``
   keep their old meaning.

Also collapses the accumulated pile of overlapping GLOBAL configs into a single
clean row (1250 so'm + 0.5%), leaving any per-driver overrides untouched.

Revision ID: 0009_commission_combined
Revises: 0008_car_models
Create Date: 2026-08-23
"""
from __future__ import annotations

from typing import Union

from alembic import op

revision: str = "0009_commission_combined"
down_revision: Union[str, None] = "0008_car_models"
branch_labels = None
depends_on = None


def _fn(select_order: str, commission_block: str) -> str:
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

        SELECT commission_type, commission_pct, commission_fixed
          INTO v_commission_type, v_commission_pct, v_commission_fix
        FROM commission_config
        WHERE (driver_id = NEW.driver_id OR driver_id IS NULL)
          AND valid_from <= CURRENT_DATE
          AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
        ORDER BY {select_order}
        LIMIT 1;

        v_commission_type := COALESCE(v_commission_type, 'percent');
        v_commission_pct  := COALESCE(v_commission_pct, 15.00);
        v_commission_fix  := COALESCE(v_commission_fix, 0);

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


# Newest matching config wins; 'combined' = fixed base + percent of fare.
_ORDER_NEW = "driver_id NULLS LAST, valid_from DESC, id DESC"
_ORDER_OLD = "driver_id NULLS LAST"

_BLOCK_COMBINED = """\
        IF v_commission_type = 'fixed' THEN
            v_commission_sum := LEAST(v_commission_fix, NEW.price_sum);
            v_commission_pct := 0;
        ELSIF v_commission_type = 'combined' THEN
            v_commission_sum := LEAST(
                v_commission_fix + ROUND(NEW.price_sum * v_commission_pct / 100),
                NEW.price_sum);
        ELSE
            v_commission_sum := ROUND(NEW.price_sum * v_commission_pct / 100);
        END IF;
"""

_BLOCK_FIXED_ONLY = """\
        IF v_commission_type = 'fixed' THEN
            v_commission_sum := LEAST(v_commission_fix, NEW.price_sum);
            v_commission_pct := 0;
        ELSE
            v_commission_sum := ROUND(NEW.price_sum * v_commission_pct / 100);
        END IF;
"""


def upgrade() -> None:
    op.execute(_fn(_ORDER_NEW, _BLOCK_COMBINED))
    # Collapse the pile of overlapping GLOBAL configs into one clean row; keep
    # any per-driver overrides. driver_commissions store their own computed
    # values, so removing config rows is safe.
    op.execute("DELETE FROM commission_config WHERE driver_id IS NULL")
    op.execute(
        "INSERT INTO commission_config "
        "(driver_id, commission_type, commission_pct, commission_fixed, valid_from) "
        "VALUES (NULL, 'combined', 0.5, 1250, CURRENT_DATE)"
    )


def downgrade() -> None:
    # Restore the previous (0005) behaviour: no recency ordering, no 'combined'.
    op.execute(_fn(_ORDER_OLD, _BLOCK_FIXED_ONLY))
