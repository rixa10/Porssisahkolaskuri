"""Update data/spot-prices.json with the latest day-ahead prices.

Reads the existing JSON (if any), fetches the current and a few past
years from the configured source, merges (newer rows overwrite older),
trims to a rolling window, and writes the result back.

Run locally:
    python scripts/update_prices.py

In CI:
    Invoked by .github/workflows/update-prices.yml on a daily cron.

Swap the source module to switch providers without touching this script.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

# Source module — swap here to change provider.
from sources import elering as source

HISTORY_YEARS = 4

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = REPO_ROOT / "data" / "spot-prices.json"


def load_existing() -> dict:
    if not DATA_FILE.exists():
        return _empty_doc()
    with DATA_FILE.open("r", encoding="utf-8") as f:
        return json.load(f)


def _empty_doc() -> dict:
    return {
        "updated": None,
        "currency": "EUR",
        "unit": "snt/kWh",
        "vat_included": False,
        "area": "FI",
        "prices": [],
    }


def write_output(doc: dict) -> None:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    with DATA_FILE.open("w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")


def merge_prices(existing: list[dict], new: list[dict]) -> list[dict]:
    by_t: dict[str, dict] = {row["t"]: row for row in existing}
    for row in new:
        by_t[row["t"]] = row
    return sorted(by_t.values(), key=lambda r: r["t"])


def main() -> int:
    now = datetime.now(timezone.utc)
    current_year = now.year

    print(f"Loading existing data from {DATA_FILE}", flush=True)
    doc = load_existing()
    existing = doc.get("prices", [])
    print(f"  {len(existing)} existing rows", flush=True)

    fresh: list[dict] = []
    errors: list[tuple[int, str]] = []
    for year in range(current_year - HISTORY_YEARS + 1, current_year + 1):
        try:
            rows = source.fetch_year(year)
            print(f"  {year}: fetched {len(rows)} rows", flush=True)
            fresh.extend(rows)
        except Exception as e:
            print(f"  {year}: WARN - {e}", flush=True)
            errors.append((year, str(e)))

    if not fresh:
        print(
            "ERROR: no fresh data was fetched. Existing file left unchanged.",
            flush=True,
        )
        if errors and any("CERTIFICATE_VERIFY_FAILED" in e for _, e in errors):
            print(
                "\nHINT: SSL certificate verification failed. This is common on\n"
                "macOS Python.org installs. Install certifi to fix:\n"
                "    pip3 install certifi\n"
                "Then re-run this script.",
                flush=True,
            )
        return 1

    # If we have a real synthetic file flag, drop it now that we have real data
    doc.pop("synthetic", None)

    merged = merge_prices(existing, fresh)
    cutoff_year = current_year - HISTORY_YEARS
    merged = [r for r in merged if int(r["t"][:4]) > cutoff_year]

    base = _empty_doc()
    for k, v in base.items():
        doc.setdefault(k, v)
    doc["prices"] = merged
    doc["updated"] = now.strftime("%Y-%m-%dT%H:%M:%SZ")

    write_output(doc)
    print(
        f"Wrote {len(merged)} rows to {DATA_FILE} "
        f"(range {merged[0]['t']} .. {merged[-1]['t']})",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
