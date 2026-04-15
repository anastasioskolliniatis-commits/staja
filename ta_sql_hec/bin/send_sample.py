#!/usr/bin/env python3
"""
send_sample.py — Send lalaland.csv to Splunk via HEC raw endpoint.

Each CSV row is posted as a raw event. host, sourcetype, source are passed
as URL query parameters so Splunk preserves the original metadata.

Usage:
  python3 send_sample.py --hec-url https://localhost:8088 --token YOUR_TOKEN
  python3 send_sample.py --hec-url https://localhost:8088 --token YOUR_TOKEN --index myindex
  python3 send_sample.py --hec-url https://localhost:8088 --token YOUR_TOKEN --dry-run

Options:
  --hec-url URL    HEC base URL (default: https://localhost:8088)
  --token TOKEN    HEC token
  --index INDEX    Override index (default: uses token's default index)
  --csv PATH       Path to CSV file (default: ../sampledata/lalaland.csv)
  --batch N        Events per HTTP request (default: 50)
  --dry-run        Print first 5 events without sending
"""

import sys
import os
import csv
import json
import time
import argparse
import urllib.request
import urllib.parse
import urllib.error
import ssl

DEFAULT_HEC_URL = "https://localhost:8088"
DEFAULT_CSV     = os.path.join(os.path.dirname(__file__),
                               "..", "sampledata", "lalaland.csv")

_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode    = ssl.CERT_NONE


def load_csv(path):
    """Return list of (host, sourcetype, source, raw) tuples from the CSV."""
    rows = []
    with open(path, encoding="utf-8", newline="") as f:
        reader = csv.reader(f)
        header = next(reader)
        # Normalise header names (strip quotes/spaces)
        header = [h.strip().strip('"') for h in header]
        idx = {h: i for i, h in enumerate(header)}
        for row in reader:
            if len(row) < 4:
                continue
            host       = row[idx["host"]].strip()
            sourcetype = row[idx["sourcetype"]].strip()
            source     = row[idx["source"]].strip()
            raw        = row[idx["_raw"]].strip()
            # Skip noise rows — source should not look like SQL fragments
            if len(source) > 80 or "\n" in source or source.startswith(" "):
                continue
            if raw:
                rows.append((host, sourcetype, source, raw))
    return rows


def send_batch(hec_url, token, index, batch):
    """
    POST a batch of raw events to HEC.

    Each event in the batch must have the same host/sourcetype/source because
    the raw endpoint takes one set of params per request.
    We group by (host, sourcetype, source) and send each group separately,
    joining events with newlines.
    """
    # Group by metadata
    groups = {}
    for host, sourcetype, source, raw in batch:
        key = (host, sourcetype, source)
        groups.setdefault(key, []).append(raw)

    for (host, sourcetype, source), raws in groups.items():
        params = {
            "sourcetype": sourcetype,
            "source":     source,
            "host":       host,
        }
        if index:
            params["index"] = index

        url  = f"{hec_url}/services/collector/raw?{urllib.parse.urlencode(params)}"
        body = "\n".join(raws).encode("utf-8")

        req = urllib.request.Request(
            url,
            data=body,
            headers={
                "Authorization": f"Splunk {token}",
                "Content-Type":  "text/plain",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, context=_SSL_CTX, timeout=30) as resp:
                result = json.loads(resp.read())
                if result.get("code", 0) != 0:
                    print(f"  WARN HEC response: {result}", file=sys.stderr)
        except urllib.error.HTTPError as exc:
            err = exc.read().decode("utf-8", errors="replace")[:200]
            print(f"  ERROR {exc.code} source={source}: {err}", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description="Send sample CSV to Splunk HEC")
    parser.add_argument("--hec-url", default=os.environ.get("HEC_URL", DEFAULT_HEC_URL))
    parser.add_argument("--token",   default=os.environ.get("HEC_TOKEN", ""))
    parser.add_argument("--index",   default=os.environ.get("HEC_INDEX", ""))
    parser.add_argument("--csv",     default=DEFAULT_CSV)
    parser.add_argument("--batch",   type=int, default=50)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.dry_run and not args.token:
        print("ERROR: --token is required (or set HEC_TOKEN env var)", file=sys.stderr)
        sys.exit(1)

    print(f"Loading {args.csv}...")
    rows = load_csv(args.csv)
    print(f"  {len(rows)} valid events loaded")

    # Count unique sources
    sources = {}
    for _, _, source, _ in rows:
        sources[source] = sources.get(source, 0) + 1
    print(f"  {len(sources)} distinct sources:")
    for src, cnt in sorted(sources.items(), key=lambda x: -x[1]):
        print(f"    {cnt:6d}  {src}")

    if args.dry_run:
        print("\nDry run — first 5 events:")
        for host, sourcetype, source, raw in rows[:5]:
            print(f"  host={host} sourcetype={sourcetype} source={source}")
            print(f"  raw: {raw[:120]}")
            print()
        return

    print(f"\nSending to {args.hec_url} ...")
    total   = len(rows)
    sent    = 0
    batch_n = args.batch

    for i in range(0, total, batch_n):
        batch = rows[i:i + batch_n]
        send_batch(args.hec_url, args.token, args.index, batch)
        sent += len(batch)
        pct   = sent / total * 100
        print(f"  {sent}/{total} ({pct:.0f}%)", end="\r")

    print(f"\nDone. {sent} events sent.")


if __name__ == "__main__":
    main()
