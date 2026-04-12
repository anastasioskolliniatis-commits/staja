#!/usr/bin/env python3
"""
Alert Manager — create_incident alert action
=============================================
Called by Splunk when a saved search fires with this action configured.
Receives a JSON payload on stdin, creates an INC-XXX record in KV Store.

Params (configured in the alert action UI):
  param.severity    — critical | high | medium | low | info  (default: medium)
  param.title       — override the incident title (default: alert name)
  param.description — override description (default: auto-generated)
"""

import sys
import json
import time
import urllib.request
import urllib.error
import ssl


def log(msg):
    sys.stderr.write(f"[create_incident] {msg}\n")
    sys.stderr.flush()


def _ssl_ctx():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def kv_request(server_uri, session_key, path, method="GET", data=None):
    """
    Make a KV Store REST call.
    path is relative to /servicesNS/nobody/alert_manager/storage/collections
    """
    url = (
        f"{server_uri}/servicesNS/nobody/alert_manager"
        f"/storage/collections{path}?output_mode=json"
    )
    headers = {
        "Authorization": f"Splunk {session_key}",
        "Content-Type": "application/json",
    }
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, context=_ssl_ctx(), timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read().decode()}") from e


def get_next_incident_id(server_uri, session_key):
    """Read the counter, increment it atomically (best-effort), return INC-XXX."""
    records = kv_request(server_uri, session_key, "/data/incident_counter")

    if not records:
        new_val = 1
        kv_request(
            server_uri, session_key,
            "/data/incident_counter",
            method="POST",
            data={"_key": "main", "counter": 1},
        )
    else:
        new_val = int(records[0].get("counter", 0)) + 1
        kv_request(
            server_uri, session_key,
            "/data/incident_counter/main",
            method="POST",
            data={"counter": new_val},
        )

    return f"INC-{new_val:03d}"


def main():
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw)
    except Exception as exc:
        log(f"Failed to parse stdin payload: {exc}")
        sys.exit(1)

    session_key = payload.get("session_key", "")
    server_uri  = payload.get("server_uri", "https://localhost:8089")
    config      = payload.get("configuration", {})
    alert_name  = payload.get("search_name", "")

    if not session_key:
        log("No session_key in payload — cannot create incident")
        sys.exit(1)

    try:
        incident_id = get_next_incident_id(server_uri, session_key)
    except Exception as exc:
        log(f"Failed to get next incident ID: {exc}")
        sys.exit(1)

    now = int(time.time())

    title = (
        config.get("title")
        or alert_name
        or "Untitled Alert"
    )
    description = (
        config.get("description")
        or (f"Alert fired: {alert_name}" if alert_name else "Manually created")
    )

    incident = {
        "incident_id":   incident_id,
        "title":         title,
        "description":   description,
        "severity":      config.get("severity", "medium"),
        "status":        "new",
        "assigned_to":   "",
        "assigned_role": "",
        "created_by":    "alert_action",
        "source_alert":  alert_name,
        "created_time":  now,
        "updated_time":  now,
        "resolved_time": 0,
    }

    try:
        kv_request(
            server_uri, session_key,
            "/data/incidents",
            method="POST",
            data=incident,
        )
        log(f"Created {incident_id}: {title}")
    except Exception as exc:
        log(f"Failed to write incident to KV Store: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
