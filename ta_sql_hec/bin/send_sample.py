#!/usr/bin/env python3
"""
send_sample.py — Send curated sample events to Splunk via HEC raw endpoint.

Timestamps in _raw are rewritten to now so service SPLs (earliest=-20m) find them.
Events are sent as raw text with host/sourcetype/source as URL params.

Usage:
  python3 send_sample.py --sources Trade_Capture_Volume_Diff
  python3 send_sample.py --sources Trade_Capture_Volume_Diff,Trade_Capture_Volume_Diff_Last_30_Min
  python3 send_sample.py --sources all
  python3 send_sample.py --dry-run --sources Trade_Capture_Volume_Diff

Defaults:
  --hec-url  https://172.21.48.147:8088
  --token    fe0f27da-49f6-4979-be67-6f5baed94159
  --csv      ../sampledata/lalaland.csv
"""

import sys
import os
import csv
import re
import json
import time
import argparse
import urllib.request
import urllib.parse
import urllib.error
import ssl
from datetime import datetime, timedelta

DEFAULT_HEC_URL = "http://172.21.48.147:8088"
DEFAULT_TOKEN   = "fe0f27da-49f6-4979-be67-6f5baed94159"
DEFAULT_CSV     = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                               "..", "sampledata", "lalaland.csv")

# Known clean sources — everything else is treated as noise
KNOWN_SOURCES = {
    "Trade_Capture_Volume_Diff",
    "Trade_Capture_Volume_Diff_Last_30_Min",
    "Trade_Capture_Tradedate_check",
    "EquitiesAndEquityOptionsBySource",
    "FuturesAndFuturesOptionsBySource",
    "MICS_READY_Queue",
    "MICS_Queue_Top_5_Sessions",
    "CA_Prices",
    "SLA_Delay",
    "Stored_Procedure",
    "Start",
    "DB_Blocking_SQL-PRODAG01",
}

_TS_RE = re.compile(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+")

_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode    = ssl.CERT_NONE


# ─── Helpers ──────────────────────────────────────────────────────────────────

def rewrite_timestamp(raw, new_dt):
    """Replace the leading timestamp in _raw with new_dt."""
    new_ts = new_dt.strftime("%Y-%m-%d %H:%M:%S.") + f"{new_dt.microsecond // 1000:03d}"
    return _TS_RE.sub(new_ts, raw, count=1)


def load_csv(path, sources_filter):
    """
    Load rows from CSV, filtered to known sources (and optionally a specific set).
    Returns list of (host, sourcetype, source, raw) tuples, latest snapshot only.
    """
    all_rows = []
    with open(path, encoding="utf-8", newline="") as f:
        reader = csv.reader(f)
        header = [h.strip().strip('"') for h in next(reader)]
        idx    = {h: i for i, h in enumerate(header)}

        for row in reader:
            if len(row) < 4:
                continue
            source = row[idx["source"]].strip()
            if source not in KNOWN_SOURCES:
                continue
            if sources_filter != {"all"} and source not in sources_filter:
                continue
            raw = row[idx["_raw"]].strip()
            if not raw:
                continue
            all_rows.append((
                row[idx["host"]].strip(),
                row[idx["sourcetype"]].strip(),
                source,
                raw,
            ))

    # Keep only the latest snapshot per source — prevents flooding Splunk with
    # a full day's history. Timestamp is the leading field in _raw.
    latest_ts = {}
    for host, st, source, raw in all_rows:
        m = _TS_RE.match(raw)
        if m:
            ts = m.group()
            if ts > latest_ts.get(source, ""):
                latest_ts[source] = ts

    return [
        (host, st, source, raw)
        for host, st, source, raw in all_rows
        if _TS_RE.match(raw) and _TS_RE.match(raw).group() == latest_ts.get(source)
    ]


def send_events(hec_url, token, index, rows, now):
    """Send rows to HEC, rewriting timestamps to now. Groups by (host, st, source)."""
    groups = {}
    for host, sourcetype, source, raw in rows:
        key = (host, sourcetype, source)
        groups.setdefault(key, []).append(rewrite_timestamp(raw, now))

    errors = 0
    for (host, sourcetype, source), raws in groups.items():
        params = {"sourcetype": sourcetype, "source": source, "host": host}
        if index:
            params["index"] = index

        url  = f"{hec_url}/services/collector/raw?{urllib.parse.urlencode(params)}"
        body = "\n".join(raws).encode("utf-8")
        req  = urllib.request.Request(
            url, data=body,
            headers={"Authorization": f"Splunk {token}", "Content-Type": "text/plain"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, context=_SSL_CTX, timeout=30) as resp:
                result = json.loads(resp.read())
                if result.get("code", 0) != 0:
                    print(f"  WARN {source}: {result}", file=sys.stderr)
                    errors += 1
                else:
                    print(f"  OK   {source} ({len(raws)} events)")
        except urllib.error.HTTPError as exc:
            err = exc.read().decode("utf-8", errors="replace")[:200]
            print(f"  ERR  {source} — HTTP {exc.code}: {err}", file=sys.stderr)
            errors += 1

    return errors


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Send sample SQL events to Splunk HEC")
    parser.add_argument("--hec-url",  default=os.environ.get("HEC_URL",   DEFAULT_HEC_URL))
    parser.add_argument("--token",    default=os.environ.get("HEC_TOKEN", DEFAULT_TOKEN))
    parser.add_argument("--index",    default=os.environ.get("HEC_INDEX", ""))
    parser.add_argument("--csv",      default=DEFAULT_CSV)
    parser.add_argument("--sources",  default="all",
                        help="Comma-separated source names, or 'all'")
    parser.add_argument("--dry-run",  action="store_true",
                        help="Show what would be sent without posting")
    args = parser.parse_args()

    sources_filter = (
        {"all"} if args.sources.strip().lower() == "all"
        else {s.strip() for s in args.sources.split(",")}
    )

    print(f"Loading {args.csv} ...")
    rows = load_csv(args.csv, sources_filter)

    if not rows:
        print("No matching events found. Check --sources filter.")
        sys.exit(1)

    # Group summary
    by_source = {}
    for _, _, source, _ in rows:
        by_source[source] = by_source.get(source, 0) + 1

    print(f"Events to send ({len(rows)} total, latest snapshot per source):")
    for src, cnt in sorted(by_source.items()):
        print(f"  {cnt:4d}  {src}")

    now = datetime.now()
    print(f"\nTimestamps will be rewritten to: {now.strftime('%Y-%m-%d %H:%M:%S')}")

    if args.dry_run:
        print("\nDry run — first event per source:")
        seen = set()
        for host, sourcetype, source, raw in rows:
            if source not in seen:
                seen.add(source)
                new_raw = rewrite_timestamp(raw, now)
                print(f"\n  source={source}  host={host}")
                print(f"  {new_raw[:160]}")
        return

    print(f"\nSending to {args.hec_url} ...")
    errors = send_events(args.hec_url, args.token, args.index, rows, now)

    if errors:
        print(f"\nDone with {errors} error(s).")
        sys.exit(1)
    else:
        print(f"\nDone. All events sent successfully.")


if __name__ == "__main__":
    main()
