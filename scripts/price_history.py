#!/usr/bin/env python3
"""Shared price-history bookkeeping for advice_log.py and etoro_import.py.

Keeps a single canonical implementation of how an intraday price point is
appended and how older points are pruned, so the two callers can't drift.
"""
from __future__ import annotations

from datetime import datetime


def push_price_point(hist: list[dict], price: float, now: datetime | None = None) -> list[dict]:
    """Append (or update) today's price point in ``hist`` and prune old intraday points.

    ``hist`` is the priceHistory list of ``{"date", "price"}`` dicts; it's mutated
    in place and returned. ``now`` is injectable for testing.

    Rules:
    - skip when the last point is from today AND already at this price (no flatline dupes),
    - overwrite when the last point is from this exact minute,
    - otherwise append a new point,
    - keep every point from today, collapse each earlier day to its last point (date only).
    """
    if now is None:
        import nyse
        now = nyse.nyse_now()
    now_str = now.isoformat("T", "minutes")
    today_str = now.strftime("%Y-%m-%d")

    if hist:
        last_point = hist[-1]
        if last_point["date"][:10] == today_str and last_point["price"] == price:
            return hist

    if hist and hist[-1]["date"] == now_str:
        hist[-1]["price"] = price
    else:
        hist.append({"date": now_str, "price": price})

    pruned = []
    for i, point in enumerate(hist):
        date_str = point["date"][:10]
        if date_str == today_str:
            pruned.append(point)
        else:
            is_last = not (i + 1 < len(hist) and hist[i + 1]["date"][:10] == date_str)
            if is_last:
                pruned.append({"date": date_str, "price": point["price"]})
    hist[:] = pruned
    return hist
