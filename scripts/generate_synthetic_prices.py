"""Generate a synthetic but plausible spot price dataset for testing.

Used only when the real spot-hinta.fi API isn't reachable from this
environment. The real production data comes from update_prices.py
running in GitHub Actions or on the user's own machine.

Synthetic model: a baseline price with daily peaks (morning/evening)
and a winter premium, plus a small deterministic noise term so daily
profiles aren't identical. Values aim to roughly match Finnish 2024
spot levels (low single-digit snt/kWh on average).
"""
from __future__ import annotations

import json
import math
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path


def synthetic_price(t: datetime) -> float:
    """Return a deterministic snt/kWh value for the given UTC hour."""
    # Convert to local Finnish hour (UTC+2 winter, UTC+3 summer ≈ UTC+2.5).
    # We use UTC+2 always for simplicity — it's synthetic anyway.
    local_hour = (t.hour + 2) % 24

    # Daily shape: low at night, peaks ~08 and ~18.
    morning = 4.0 * math.exp(-((local_hour - 8) ** 2) / 6.0)
    evening = 5.0 * math.exp(-((local_hour - 18) ** 2) / 6.0)
    daily = morning + evening

    # Seasonal: winter (Dec-Feb) ~3x baseline.
    month = t.month
    seasonal = 1.0 + 1.5 * math.exp(-((((month - 1) % 12) - 1) ** 2) / 6.0)
    if month >= 11 or month <= 2:
        seasonal *= 1.4

    # Baseline
    baseline = 3.0 * seasonal

    # Mild deterministic noise (per day-of-year hash)
    noise = ((t.timetuple().tm_yday * 13 + t.hour * 7) % 100) / 100.0 * 1.5

    price = baseline + daily * seasonal + noise
    return round(max(price, 0.1), 4)  # snt/kWh, ALV 0%


def generate(start_utc: datetime, end_utc: datetime) -> list[dict]:
    rows = []
    t = start_utc.replace(minute=0, second=0, microsecond=0)
    while t <= end_utc:
        rows.append({"t": t.strftime("%Y-%m-%dT%H:%M:%SZ"), "p": synthetic_price(t)})
        t += timedelta(hours=1)
    return rows


def main():
    if len(sys.argv) > 1:
        out_path = Path(sys.argv[1])
    else:
        out_path = Path(__file__).resolve().parent.parent / "data" / "spot-prices.json"

    # Cover a generous range so we have data for any consumption period
    # in the example dataset (2024-06-01 → 2025-06-01) plus headroom.
    start = datetime(2024, 1, 1, tzinfo=timezone.utc)
    end = datetime(2025, 12, 31, 23, tzinfo=timezone.utc)

    rows = generate(start, end)
    doc = {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "currency": "EUR",
        "unit": "snt/kWh",
        "vat_included": False,
        "area": "FI",
        "synthetic": True,  # marker so we know this isn't real data
        "prices": rows,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print(f"Wrote {len(rows)} synthetic rows to {out_path}")
    print(f"Range: {rows[0]['t']} .. {rows[-1]['t']}")


if __name__ == "__main__":
    main()
