#!/usr/bin/env python3
"""
bm_init.py — Vigil first-run initialisation.

Runs as a scripted input (passAuth=splunk-system-user) once per day.
On a fresh install, bm_tree_config is empty; this script seeds it with
the default tree_spl so the Monitor tab loads the CSV-based tree
immediately without any manual admin step.

Subsequent runs are no-ops (exits early if tree_spl already set).
"""

import sys
import json
import logging
import urllib.request
import urllib.parse
import urllib.error
import ssl

SPLUNK_BASE_URL = "https://localhost:8089"
APP_NAMESPACE   = "nobody/batch_monitor"
KV_BASE         = f"{SPLUNK_BASE_URL}/servicesNS/{APP_NAMESPACE}/storage/collections/data"

DEFAULT_TREE_SPL = "| inputlookup bm_tree.csv"
TREE_CONFIG_KEY  = "tree_config"

_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode    = ssl.CERT_NONE

log = logging.getLogger("bm_init")
log.setLevel(logging.DEBUG)
_h = logging.StreamHandler(sys.stderr)
_h.setFormatter(logging.Formatter(
    "%(asctime)s %(levelname)-8s pid=%(process)d | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
))
log.addHandler(_h)


def _req(session_key, method, url, data=None):
    headers = {
        "Authorization": f"Splunk {session_key}",
        "Content-Type":  "application/json",
        "Accept":        "application/json",
    }
    body = json.dumps(data).encode() if data is not None else None
    req  = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, context=_SSL_CTX, timeout=20) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as exc:
        err = exc.read().decode("utf-8", errors="replace")[:300]
        raise RuntimeError(f"HTTP {exc.code}: {err}")


def main():
    # Read session key from stdin (Splunk passAuth)
    try:
        line = sys.stdin.readline().strip()
        if not line:
            raise ValueError("empty stdin — is passAuth=splunk-system-user set?")
        session_key = line.split("=", 1)[1] if "=" in line else line
    except Exception as e:
        log.critical(f"action=auth_failed error=\"{e}\"")
        sys.exit(1)

    log.info("action=init_start")

    # Check if tree_spl is already configured
    try:
        docs = _req(session_key, "GET",
                    f"{KV_BASE}/bm_tree_config",
                    )
        # Splunk returns list for collection GET
        if not isinstance(docs, list):
            docs = []
    except Exception as e:
        log.error(f"action=kv_read_failed collection=bm_tree_config error=\"{e}\"")
        sys.exit(0)  # Non-fatal — collector will handle it

    existing_spl = next((d.get("tree_spl", "").strip() for d in docs if d.get("tree_spl")), "")
    if existing_spl:
        log.info(f"action=init_skip reason=already_configured tree_spl=\"{existing_spl[:60]}\"")
        sys.exit(0)

    # Seed bm_tree_config with the default CSV lookup SPL
    doc = {"_key": TREE_CONFIG_KEY, "tree_spl": DEFAULT_TREE_SPL}
    try:
        # Try update first, fall back to create
        try:
            _req(session_key, "POST",
                 f"{KV_BASE}/bm_tree_config/{TREE_CONFIG_KEY}", data=doc)
        except RuntimeError as exc:
            if "404" in str(exc):
                _req(session_key, "POST",
                     f"{KV_BASE}/bm_tree_config", data=doc)
            else:
                raise
        log.info(f"action=init_done tree_spl=\"{DEFAULT_TREE_SPL}\"")
    except Exception as e:
        log.error(f"action=init_failed error=\"{e}\"")


if __name__ == "__main__":
    main()
