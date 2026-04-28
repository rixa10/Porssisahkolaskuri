"""Spot price source: spot-hinta.fi public API.

Returns hourly Finnish (FI) day-ahead prices in snt/kWh (without VAT),
with ISO 8601 UTC timestamps.

API endpoint:
    GET https://api.spot-hinta.fi/Vuosi/{YYYY}
        Returns an array of hourly prices for the given year.

Response shape (as observed):
    [
      { "Rank": 0,
        "DateTime": "2024-01-01T00:00:00.0000000+02:00",
        "PriceWithTax": 0.0512,
        "PriceNoTax": 0.0413 },
      ...
    ]

Prices are in EUR/kWh. We convert to snt/kWh (multiply by 100) and keep
the no-tax value (VAT is applied at calculation time based on date).
"""
from __future__ import annotations

import json
import ssl
import urllib.request
from datetime import datetime, timezone

API_BASE = "https://api.spot-hinta.fi"
USER_AGENT = "porssisahkolaskuri/0.1"


def _ssl_context() -> ssl.SSLContext:
    """Build an SSL context that trusts the certifi CA bundle if available.

    On macOS Python.org installs, the system CA bundle isn't visible to
    Python by default, which causes CERTIFICATE_VERIFY_FAILED errors.
    Using the certifi-bundled roots fixes this everywhere.
    """
    try:
        import certifi  # type: ignore
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def _http_get_json(url: str, timeout: int = 30):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout, context=_ssl_context()) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_year(year: int) -> list[dict]:
    """Fetch all hourly prices for the given year as normalized rows."""
    raw = _http_get_json(f"{API_BASE}/Vuosi/{year}")
    if not isinstance(raw, list):
        raise RuntimeError("Unexpected response: not a list")
    return [_normalize_row(r) for r in raw if _is_valid(r)]


def _is_valid(row) -> bool:
    return (
        isinstance(row, dict)
        and "DateTime" in row
        and "PriceNoTax" in row
    )


def _normalize_row(row: dict) -> dict:
    dt_str = row["DateTime"]
    price_eur_per_kwh = row["PriceNoTax"]
    dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    dt_utc = dt.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)
    return {
        "t": dt_utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "p": round(float(price_eur_per_kwh) * 100.0, 4),  # EUR/kWh -> snt/kWh
    }


if __name__ == "__main__":
    import sys
    year = int(sys.argv[1]) if len(sys.argv) > 1 else datetime.now(timezone.utc).year
    rows = fetch_year(year)
    print(f"{year}: {len(rows)} rows")
    for r in rows[-3:]:
        print(r)
