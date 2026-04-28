"""Spot price source: Elering Live API (Viron kantaverkkoyhtiö).

Returns hourly Finnish (FI) day-ahead prices in snt/kWh (without VAT),
with ISO 8601 UTC timestamps.

API endpoint:
    GET https://dashboard.elering.ee/api/nps/price
        ?start=YYYY-MM-DDTHH:mm:ss.SSSZ
        &end=YYYY-MM-DDTHH:mm:ss.SSSZ

Response shape:
    {
      "data": {
        "fi": [
          { "timestamp": 1704067200, "price": 12.34 },  # EUR/MWh
          ...
        ],
        ...
      }
    }

We extract the "fi" series, convert EUR/MWh -> snt/kWh (divide by 10),
and emit our normalized rows.
"""
from __future__ import annotations

import json
import ssl
import urllib.parse
import urllib.request
from datetime import datetime, timezone

API_URL = "https://dashboard.elering.ee/api/nps/price"
USER_AGENT = "porssisahkolaskuri/0.1"


def _ssl_context() -> ssl.SSLContext:
    try:
        import certifi  # type: ignore
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def _http_get_json(url: str, timeout: int = 60):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout, context=_ssl_context()) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_range(start_utc: datetime, end_utc: datetime) -> list[dict]:
    """Fetch FI hourly prices for the [start, end] UTC range, inclusive."""
    params = {
        "start": start_utc.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "end":   end_utc.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
    }
    url = f"{API_URL}?{urllib.parse.urlencode(params)}"
    raw = _http_get_json(url)
    series = (raw or {}).get("data", {}).get("fi", [])
    rows = []
    for item in series:
        ts = item.get("timestamp")
        price = item.get("price")
        if ts is None or price is None:
            continue
        dt = datetime.fromtimestamp(int(ts), tz=timezone.utc)
        # Elering timestamps are aligned to hour starts in UTC.
        dt = dt.replace(minute=0, second=0, microsecond=0)
        rows.append({
            "t": dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            # EUR/MWh -> snt/kWh : divide by 10
            "p": round(float(price) / 10.0, 4),
        })
    return rows


def fetch_year(year: int) -> list[dict]:
    """Fetch all hourly FI prices for the given year as normalized rows."""
    start = datetime(year, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    end   = datetime(year, 12, 31, 23, 0, 0, tzinfo=timezone.utc)
    return fetch_range(start, end)


if __name__ == "__main__":
    import sys
    year = int(sys.argv[1]) if len(sys.argv) > 1 else datetime.now(timezone.utc).year
    rows = fetch_year(year)
    print(f"{year}: {len(rows)} rows")
    for r in rows[-3:]:
        print(r)
