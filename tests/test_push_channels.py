"""Which Android channel a push lands on, and therefore how loud it is.

Omitting channelId is not harmless: expo-notifications then invents a fallback
channel called "Miscellaneous", so a ride offer — which a driver has fifteen
seconds to accept — arrived with the prominence of a marketing message.
"""
from __future__ import annotations

import pytest

from app.services import push


class CapturingClient:
    """Stands in for httpx, keeping whatever was about to be sent to Expo."""

    sent: list = []

    def __init__(self, *a, **kw):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, _url, json=None, headers=None):
        CapturingClient.sent.append(json)

        class R:
            status_code = 200

            @staticmethod
            def json():
                return {"data": []}

        return R()


class FakeRedis:
    async def smembers(self, _key):
        return {"ExponentPushToken[abc]"}


@pytest.fixture
def sent(monkeypatch):
    CapturingClient.sent = []
    monkeypatch.setattr(push.httpx, "AsyncClient", CapturingClient)
    return CapturingClient.sent


async def test_every_push_names_its_channel(sent):
    """The bug: no channelId at all, so Android chose for us."""
    await push.send_to_user(FakeRedis(), "user-1", "Salom", "Xabar")

    assert sent[0][0]["channelId"] == "default"


async def test_an_ordinary_push_does_not_ring(sent):
    await push.send_to_user(FakeRedis(), "user-1", "Salom", "Xabar")

    assert sent[0][0]["sound"] == "default"
    assert sent[0][0]["channelId"] == "default"


async def test_an_order_push_rings_on_the_orders_channel(sent):
    await push.send_to_user(
        FakeRedis(), "user-1", "Yangi buyurtma!", "Yaqiningizda buyurtma bor",
        data={"type": "new_order"}, channel_id="orders", sound="order.wav",
    )

    assert sent[0][0]["channelId"] == "orders"
    assert sent[0][0]["sound"] == "order.wav"
    assert sent[0][0]["priority"] == "high"


async def test_the_payload_still_carries_what_routes_the_tap(sent):
    """The sound matters at 3am; the data is what opens the right screen."""
    await push.send_to_user(
        FakeRedis(), "user-1", "t", "b",
        data={"type": "ride_offer", "ride_id": "r-1"},
        channel_id="orders", sound="order.wav",
    )

    assert sent[0][0]["data"] == {"type": "ride_offer", "ride_id": "r-1"}
