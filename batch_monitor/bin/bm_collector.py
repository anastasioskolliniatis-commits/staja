#!/usr/bin/env python3
"""
bm_collector.py — Batch Monitor status collector
Runs as a Splunk scripted input via inputs.conf.

Flow:
  1. Read Splunk session key from stdin (passAuth = splunk-system-user)
  2. Acquire run lock in bm_run_log (prevents concurrent runs)
  3. Load tree SPL, services, mappings from KV store
  4. Run tree SPL to resolve leaf nodes (node_id -> node_host)
  5. Build work queue: (node_id, node_host, service_name, resolved_spl)
  6. Execute each SPL check sequentially — extensible to concurrent later
  7. Batch-write results to bm_results KV collection
  8. Release run lock with final stats

Error philosophy:
  CRITICAL → sys.exit(1)   (auth failure, KV unavailable, no config)
  ERROR    → mark result as service_status=error, continue run
  WARNING  → log only, continue (no_data, missing $node_host$ token)
  INFO     → run lifecycle events
  DEBUG    → per-search detail (off by default in production)

Logging format: Splunk key=value pairs, written to stderr.
Splunk captures stderr from scripted inputs into index=_internal.
Search: index=_internal sourcetype=bm_collector action=*
"""

import sys
import os
import json
import time
import uuid
import logging
import argparse
import getpass
import urllib.request
import urllib.parse
import urllib.error
import ssl


# ─── Configuration constants ──────────────────────────────────────────────────

SPLUNK_BASE_URL     = "https://localhost:8089"
APP_NAMESPACE       = "nobody/batch_monitor"
KV_BASE             = f"{SPLUNK_BASE_URL}/servicesNS/{APP_NAMESPACE}/storage/collections/data"
SEARCH_BASE         = f"{SPLUNK_BASE_URL}/servicesNS/{APP_NAMESPACE}/search/jobs"

SEARCH_TIMEOUT_SEC  = 60    # max seconds to wait for a single search job
SEARCH_POLL_SEC     = 1     # polling interval while waiting for DONE state
HTTP_TIMEOUT_SEC    = 30    # socket timeout per HTTP call
MAX_RETRIES         = 3     # retries for transient failures (429, network)
RETRY_BACKOFF_SEC   = 2     # base backoff — doubles each retry
MAX_RUN_AGE_SEC     = 600   # treat a "running" lock older than this as zombie
RUN_LOCK_KEY        = "current_run"
TREE_RESULT_LIMIT   = 10000 # max nodes from tree SPL

VALID_STATUSES = {"ok", "warning", "critical"}


# ─── Logging ──────────────────────────────────────────────────────────────────
# Key=value format so Splunk field extraction works automatically.
# Example search: index=_internal sourcetype=bm_collector action=check_failed

log = logging.getLogger("bm_collector")
log.setLevel(logging.DEBUG)

_handler = logging.StreamHandler(sys.stderr)
_handler.setFormatter(logging.Formatter(
    "%(asctime)s %(levelname)-8s pid=%(process)d | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
))
log.addHandler(_handler)


# ─── SSL context ──────────────────────────────────────────────────────────────
# Splunk uses a self-signed certificate on localhost by default.

_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE


# ─── Auth ─────────────────────────────────────────────────────────────────────

def read_session_key(user=None, password=None):
    """
    Get a Splunk session key.
    - Normal (scripted input): read 'sessionKey=XXXX' from stdin.
    - Manual run: use --user / --password to login via REST and get a key.
    """
    # Manual mode: credentials provided on command line
    if user and password:
        try:
            url  = f"{SPLUNK_BASE_URL}/services/auth/login"
            body = urllib.parse.urlencode(
                {"username": user, "password": password, "output_mode": "json"}
            ).encode()
            req = urllib.request.Request(url, data=body, method="POST")
            with urllib.request.urlopen(req, context=_SSL_CTX, timeout=30) as resp:
                data = json.loads(resp.read())
                key  = data["sessionKey"]
            log.info("action=auth_ok mode=manual")
            return key
        except Exception as e:
            log.critical(f"action=auth_failed mode=manual error=\"{e}\"")
            sys.exit(1)

    # Scripted input mode: Splunk writes sessionKey=XXXX to stdin
    try:
        line = sys.stdin.readline().strip()
        if not line:
            raise ValueError("stdin was empty — verify passAuth=splunk-system-user in inputs.conf")
        if "=" in line:
            key = line.split("=", 1)[1]
        else:
            key = line
        if not key:
            raise ValueError("session key value is empty")
        log.info("action=auth_ok mode=scripted")
        return key
    except Exception as e:
        log.critical(f"action=auth_failed error=\"{e}\"")
        sys.exit(1)


# ─── HTTP helpers ─────────────────────────────────────────────────────────────

def _splunk_request(session_key, method, url, data=None, params=None,
                    content_type="application/x-www-form-urlencoded"):
    """
    Make a Splunk REST call with retry logic for transient errors.
    Returns parsed JSON dict, or raises RuntimeError for non-retryable failures.

    Retry policy:
      429 (rate limited)  → exponential backoff, up to MAX_RETRIES
      network errors      → exponential backoff, up to MAX_RETRIES
      401 / 403 / 503     → log CRITICAL and sys.exit(1) immediately
      400 / 404 / other   → raise RuntimeError (caller decides severity)
    """
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"

    if content_type == "application/json":
        body = data if isinstance(data, bytes) else (json.dumps(data).encode() if data else None)
    else:
        body = urllib.parse.urlencode(data).encode() if data else None

    headers = {
        "Authorization": f"Splunk {session_key}",
        "Content-Type":  content_type,
        "Accept":        "application/json",
    }

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            req = urllib.request.Request(url, data=body, headers=headers, method=method)
            with urllib.request.urlopen(req, context=_SSL_CTX, timeout=HTTP_TIMEOUT_SEC) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
                return json.loads(raw) if raw.strip() else {}

        except urllib.error.HTTPError as exc:
            code      = exc.code
            err_body  = exc.read().decode("utf-8", errors="replace")[:300]

            if code == 401:
                log.critical(f"action=auth_expired url={url}")
                sys.exit(1)
            if code == 403:
                log.critical(f"action=permission_denied url={url}")
                sys.exit(1)
            if code == 503:
                log.critical(f"action=splunk_unavailable url={url}")
                sys.exit(1)
            if code == 429:
                wait = RETRY_BACKOFF_SEC * (2 ** (attempt - 1))
                log.warning(f"action=rate_limited attempt={attempt} wait_sec={wait} url={url}")
                time.sleep(wait)
                continue

            # Non-retryable HTTP error
            raise RuntimeError(f"HTTP {code}: {err_body}")

        except (urllib.error.URLError, OSError) as exc:
            if attempt < MAX_RETRIES:
                wait = RETRY_BACKOFF_SEC * attempt
                log.warning(f"action=request_retry attempt={attempt} wait_sec={wait} error=\"{exc}\"")
                time.sleep(wait)
            else:
                raise RuntimeError(f"Network error after {MAX_RETRIES} attempts: {exc}")

    raise RuntimeError(f"Max retries exceeded: {url}")


# ─── KV Store helpers ─────────────────────────────────────────────────────────

def kv_get_all(session_key, collection):
    """
    Return all documents from a KV collection as a list of dicts.
    Returns [] on error (caller decides how to handle empty config).
    """
    url = f"{KV_BASE}/{collection}"
    try:
        result = _splunk_request(
            session_key, "GET", url,
            params={"output_mode": "json", "limit": TREE_RESULT_LIMIT}
        )
        # Splunk KV GET returns a JSON array directly
        return result if isinstance(result, list) else []
    except Exception as e:
        log.error(f"action=kv_read_failed collection={collection} error=\"{e}\"")
        return []


def kv_upsert(session_key, collection, key, doc):
    """
    Insert or replace a single KV document identified by _key.
    Raises on failure — used for run lock where failure is critical.
    """
    url = f"{KV_BASE}/{collection}/{urllib.parse.quote(key, safe='')}"
    _splunk_request(session_key, "POST", url, data=doc, content_type="application/json")


def kv_batch_save(session_key, collection, docs):
    """
    Write a list of dicts to KV store in one HTTP call using batch_save.
    Each doc must include a '_key' field for upsert behaviour.
    Raises on failure — caller logs and handles.
    """
    url  = f"{KV_BASE}/{collection}/batch_save"
    body = json.dumps(docs).encode("utf-8")
    headers = {
        "Authorization": f"Splunk {session_key}",
        "Content-Type":  "application/json",
        "Accept":        "application/json",
    }
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            req = urllib.request.Request(url, data=body, headers=headers, method="POST")
            with urllib.request.urlopen(req, context=_SSL_CTX, timeout=HTTP_TIMEOUT_SEC) as resp:
                return json.loads(resp.read().decode("utf-8", errors="replace"))
        except urllib.error.HTTPError as exc:
            code     = exc.code
            err_body = exc.read().decode("utf-8", errors="replace")[:300]
            if code in (401, 403, 503):
                log.critical(f"action=batch_save_fatal collection={collection} status={code}")
                sys.exit(1)
            if attempt < MAX_RETRIES:
                log.warning(f"action=batch_save_retry attempt={attempt} collection={collection} error=\"{err_body}\"")
                time.sleep(RETRY_BACKOFF_SEC * attempt)
            else:
                raise RuntimeError(f"batch_save failed ({code}): {err_body}")
        except Exception as exc:
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_BACKOFF_SEC * attempt)
            else:
                raise RuntimeError(f"batch_save network error: {exc}")


# ─── Run lock ─────────────────────────────────────────────────────────────────

def acquire_run_lock(session_key, run_id):
    """
    Write a 'running' lock document to bm_run_log.
    Returns True if lock acquired, False if another run is active.
    Overrides zombie runs older than MAX_RUN_AGE_SEC.
    """
    try:
        docs = kv_get_all(session_key, "bm_run_log")
        for doc in docs:
            if doc.get("_key") == RUN_LOCK_KEY and doc.get("run_status") == "running":
                started = float(doc.get("run_start_time", 0))
                age_sec = time.time() - started
                if age_sec < MAX_RUN_AGE_SEC:
                    log.warning(
                        f"action=run_skipped reason=lock_held "
                        f"age_sec={age_sec:.0f} existing_run_id={doc.get('run_id','?')}"
                    )
                    return False
                log.warning(
                    f"action=zombie_overridden age_sec={age_sec:.0f} "
                    f"existing_run_id={doc.get('run_id','?')}"
                )
    except Exception as e:
        log.warning(f"action=lock_check_failed error=\"{e}\" proceeding=true")

    try:
        kv_upsert(session_key, "bm_run_log", RUN_LOCK_KEY, {
            "_key":              RUN_LOCK_KEY,
            "run_id":            run_id,
            "run_start_time":    str(time.time()),
            "run_status":        "running",
            "run_duration_sec":  "",
            "run_success_count": "",
            "run_error_count":   "",
        })
    except Exception as e:
        log.critical(f"action=lock_write_failed error=\"{e}\"")
        sys.exit(1)

    log.info(f"action=lock_acquired run_id={run_id}")
    return True


def release_run_lock(session_key, run_id, start_time, success, errors):
    """Write final run stats to bm_run_log and mark run as done."""
    duration = time.time() - start_time
    try:
        kv_upsert(session_key, "bm_run_log", RUN_LOCK_KEY, {
            "_key":              RUN_LOCK_KEY,
            "run_id":            run_id,
            "run_start_time":    str(start_time),
            "run_status":        "done",
            "run_duration_sec":  f"{duration:.2f}",
            "run_success_count": str(success),
            "run_error_count":   str(errors),
        })
        log.info(
            f"action=lock_released run_id={run_id} "
            f"duration_sec={duration:.2f} success={success} errors={errors}"
        )
    except Exception as e:
        log.error(f"action=lock_release_failed run_id={run_id} error=\"{e}\"")


# ─── Splunk search execution ───────────────────────────────────────────────────

def _submit_search(session_key, spl):
    """Submit a search job. Returns the sid."""
    search_str = spl if spl.strip().startswith("|") else f"search {spl}"
    resp = _splunk_request(
        session_key, "POST", SEARCH_BASE,
        data={
            "search":              search_str,
            "output_mode":         "json",
            "exec_mode":           "normal",
            "dispatch.max_time":   str(SEARCH_TIMEOUT_SEC),
            "rf":                  "service_status",  # required field hint
        }
    )
    sid = resp.get("sid")
    if not sid:
        raise RuntimeError(f"no sid in response: {str(resp)[:200]}")
    return sid


def _poll_search(session_key, sid):
    """
    Poll a search job until DONE or FAILED.
    Returns the content dict of the final job entry.
    Raises RuntimeError on FAILED or timeout.
    """
    job_url = f"{SEARCH_BASE}/{sid}"
    deadline = time.time() + SEARCH_TIMEOUT_SEC

    while time.time() < deadline:
        time.sleep(SEARCH_POLL_SEC)
        try:
            resp    = _splunk_request(session_key, "GET", job_url, params={"output_mode": "json"})
            content = resp.get("entry", [{}])[0].get("content", {})
            state   = content.get("dispatchState", "UNKNOWN")
        except Exception as e:
            raise RuntimeError(f"poll_error sid={sid}: {e}")

        log.debug(f"action=search_poll sid={sid} state={state}")

        if state == "DONE":
            return content
        if state == "FAILED":
            messages = content.get("messages", [])
            msg_text = "; ".join(m.get("text", "") for m in messages)
            raise RuntimeError(f"search_job_failed sid={sid} messages=\"{msg_text}\"")

    # Timed out — cancel the job to avoid leaving orphans on Splunk
    try:
        _splunk_request(session_key, "POST", f"{job_url}/control", data={"action": "cancel"})
        log.warning(f"action=search_cancelled sid={sid} reason=timeout")
    except Exception:
        pass

    raise RuntimeError(f"search_timeout sid={sid} timeout_sec={SEARCH_TIMEOUT_SEC}")


def _fetch_results(session_key, sid, count=1):
    """Fetch result rows from a completed search job."""
    resp = _splunk_request(
        session_key, "GET", f"{SEARCH_BASE}/{sid}/results",
        params={"output_mode": "json", "count": count}
    )
    return resp.get("results", [])


def run_service_check(session_key, node_id, service_name, spl, status_field="service_status"):
    """
    Execute a service SPL check for one (node, service) pair.
    Returns dict: { service_status, error_message, row_count }

    The SPL is expected to return multiple rows — one per monitored job/item.
    Each row must contain the status_field (default: service_status).
    The aggregate status = worst across ALL rows (critical > warning > ok).

    Validates:
      - Search job must reach DONE state
      - At least one result row must contain the status_field
      - status_field values must be in VALID_STATUSES (invalid values → warning)
    """
    # Status severity order — higher = worse
    SEVERITY = {"ok": 0, "warning": 1, "critical": 2}

    t0 = time.time()
    try:
        sid = _submit_search(session_key, spl)
        log.debug(f"action=search_submitted sid={sid} node_id={node_id} service_name={service_name}")

        _poll_search(session_key, sid)
        # Fetch all rows — we aggregate worst status across the full result set
        rows = _fetch_results(session_key, sid, count=10000)

        if not rows:
            log.warning(
                f"action=no_data node_id={node_id} service_name={service_name} "
                f"duration_sec={time.time()-t0:.2f}"
            )
            return {"service_status": "no_data", "error_message": "", "row_count": 0}

        # Validate that at least the first row has the status field
        if status_field not in rows[0]:
            raise RuntimeError(
                f"required field '{status_field}' missing — "
                f"got fields: {list(rows[0].keys())}"
            )

        # Aggregate: worst status across all rows
        worst       = "ok"
        worst_sev   = 0
        invalid_vals = []

        for row in rows:
            raw = str(row.get(status_field, "")).strip().lower()
            if raw not in VALID_STATUSES:
                invalid_vals.append(raw)
                continue
            sev = SEVERITY.get(raw, 0)
            if sev > worst_sev:
                worst     = raw
                worst_sev = sev

        if invalid_vals:
            log.warning(
                f"action=invalid_status_values node_id={node_id} "
                f"service_name={service_name} values={invalid_vals[:5]}"
            )

        log.info(
            f"action=check_ok node_id={node_id} service_name={service_name} "
            f"service_status={worst} row_count={len(rows)} "
            f"duration_sec={time.time()-t0:.2f}"
        )
        return {"service_status": worst, "error_message": "", "row_count": len(rows)}

    except RuntimeError as exc:
        msg = str(exc)[:500]
        log.error(
            f"action=check_failed node_id={node_id} service_name={service_name} "
            f"error=\"{msg}\" duration_sec={time.time()-t0:.2f}"
        )
        return {"service_status": "error", "error_message": msg}


# ─── Config loading ───────────────────────────────────────────────────────────

def load_config(session_key):
    """
    Load tree_spl, services dict, and mappings list from KV store.
    Exits with CRITICAL if tree_spl is not configured.
    """
    # Tree SPL
    tree_docs = kv_get_all(session_key, "bm_tree_config")
    tree_spl  = ""
    if tree_docs:
        tree_spl = tree_docs[0].get("tree_spl", "").strip()
    if not tree_spl:
        log.critical("action=config_missing reason=tree_spl_not_configured")
        sys.exit(1)

    # Services: keyed by service_name
    services_raw = kv_get_all(session_key, "bm_services")
    services = {}
    for svc in services_raw:
        name = svc.get("service_name", "").strip()
        spl  = svc.get("service_spl",  "").strip()
        if name and spl:
            services[name] = svc
        else:
            log.warning(f"action=service_skipped reason=missing_fields doc={svc.get('_key','?')}")

    # Mappings
    mappings_raw = kv_get_all(session_key, "bm_mappings")
    mappings = [
        m for m in mappings_raw
        if m.get("node_id", "").strip() and m.get("service_name", "").strip()
    ]

    log.info(
        f"action=config_loaded service_count={len(services)} "
        f"mapping_count={len(mappings)}"
    )
    return tree_spl, services, mappings


# ─── Tree resolution ──────────────────────────────────────────────────────────

def resolve_leaf_nodes(session_key, tree_spl):
    """
    Run the tree SPL and return a dict of { node_id: node_host } for leaf nodes.
    Leaf nodes are rows where node_host is non-empty.
    Exits with CRITICAL if the tree SPL fails entirely.

    Expected tree SPL output fields:
      node_id       — unique identifier for the node
      parent_node_id — parent's node_id (empty for root)
      node_label    — display name
      node_host     — host value for $node_host$ substitution (leaf nodes only)
    """
    try:
        sid = _submit_search(session_key, tree_spl)
        _poll_search(session_key, sid)
        rows = _fetch_results(session_key, sid, count=TREE_RESULT_LIMIT)
    except Exception as e:
        log.critical(f"action=tree_spl_failed error=\"{e}\"")
        sys.exit(1)

    # Leaf nodes = rows that have node_id set.
    # node_host is no longer used by the collector — SPL substitution uses $node_id$.
    leaf_nodes = set()
    for row in rows:
        node_id = row.get("node_id", "").strip()
        if node_id:
            leaf_nodes.add(node_id)

    log.info(f"action=tree_resolved total_rows={len(rows)} leaf_count={len(leaf_nodes)}")
    return leaf_nodes


# ─── Work queue ───────────────────────────────────────────────────────────────

def build_work_queue(leaf_nodes, services, mappings):
    """
    Produce a list of (node_id, service_name, resolved_spl, status_field) tuples.

    The SPL template may optionally use $node_id$ as a substitution token.
    Most service SPLs are self-contained (SQL query groups covering all jobs).

    Skips:
      - Mappings where node_id is not in leaf_nodes (group nodes — by design)
      - Mappings referencing an unknown service (config error — log WARNING)
    """
    queue   = []
    skipped = 0

    for m in mappings:
        node_id      = m["node_id"].strip()
        service_name = m["service_name"].strip()

        if node_id not in leaf_nodes:
            log.debug(f"action=mapping_skipped reason=not_a_leaf node_id={node_id}")
            skipped += 1
            continue

        if service_name not in services:
            log.warning(
                f"action=mapping_skipped reason=unknown_service "
                f"node_id={node_id} service_name={service_name}"
            )
            skipped += 1
            continue

        svc          = services[service_name]
        service_spl  = svc["service_spl"]
        status_field = svc.get("status_field", "").strip() or "service_status"

        # Optional $node_id$ substitution — useful when one SPL covers multiple nodes
        resolved_spl = service_spl.replace("$node_id$", node_id)

        queue.append((node_id, service_name, resolved_spl, status_field))

    log.info(f"action=queue_built total={len(queue)} skipped={skipped}")
    return queue


# ─── Collector loop ───────────────────────────────────────────────────────────

def run_collector(session_key, work_queue, run_id):
    """
    Execute all (node, service) checks sequentially.
    Each check is independent — one failure does not abort the run.

    Returns (results_list, success_count, error_count).

    Extensibility note: replace the for-loop with a ThreadPoolExecutor
    and a configurable max_workers to add concurrency when needed.
    """
    results       = []
    success_count = 0
    error_count   = 0
    now_epoch     = str(int(time.time()))

    for node_id, service_name, spl, status_field in work_queue:
        outcome = run_service_check(session_key, node_id, service_name, spl, status_field)

        if outcome["service_status"] == "error":
            error_count += 1
        else:
            success_count += 1

        results.append({
            # Composite key ensures one row per (node, service) — upserts cleanly
            "_key":              f"{node_id}__{service_name}",
            "node_id":           node_id,
            "service_name":      service_name,
            "service_status":    outcome["service_status"],
            "last_checked_time": now_epoch,
            "run_id":            run_id,
            "error_message":     outcome["error_message"],
            "row_count":         str(outcome.get("row_count", 0)),
        })

    return results, success_count, error_count


# ─── Entry point ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="bm_collector — manual run mode")
    parser.add_argument("--user",     default=None, help="Splunk username (manual run)")
    parser.add_argument("--password", default=None, help="Splunk password (manual run)")
    args, _ = parser.parse_known_args()

    if args.user and not args.password:
        args.password = getpass.getpass(f"Password for {args.user}: ")

    run_id     = str(uuid.uuid4())[:8]
    run_start  = time.time()

    log.info(f"action=run_start run_id={run_id}")

    session_key = read_session_key(user=args.user, password=args.password)

    if not acquire_run_lock(session_key, run_id):
        sys.exit(0)  # Another run is active — exit cleanly, not an error

    try:
        tree_spl, services, mappings = load_config(session_key)
        leaf_nodes  = resolve_leaf_nodes(session_key, tree_spl)
        work_queue  = build_work_queue(leaf_nodes, services, mappings)

        if not work_queue:
            log.warning("action=empty_queue reason=no_valid_mappings_found")
            release_run_lock(session_key, run_id, run_start, 0, 0)
            sys.exit(0)

        results, success, errors = run_collector(session_key, work_queue, run_id)

        if results:
            kv_batch_save(session_key, "bm_results", results)
            log.info(f"action=results_saved count={len(results)} run_id={run_id}")

        release_run_lock(session_key, run_id, run_start, success, errors)

        log.info(
            f"action=run_end run_id={run_id} "
            f"duration_sec={time.time()-run_start:.2f} "
            f"success={success} errors={errors}"
        )

    except SystemExit:
        raise  # Let sys.exit() propagate cleanly

    except Exception as exc:
        log.critical(f"action=run_crashed run_id={run_id} error=\"{exc}\"")
        try:
            release_run_lock(session_key, run_id, run_start, 0, -1)
        except Exception:
            pass
        sys.exit(1)


if __name__ == "__main__":
    main()
