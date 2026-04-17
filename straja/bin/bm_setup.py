#!/usr/bin/env python3
"""
bm_setup.py — Batch Monitor KV store configuration seeder.

Populates three KV collections:
  bm_tree_config  — static node hierarchy (tree_spl)
  bm_services     — 23 service definitions (SPL + display fields)
  bm_mappings     — leaf node → service mappings

Usage:
  python3 bm_setup.py --url https://localhost:8089 --user admin --password SECRET
  python3 bm_setup.py          # prompts for password, uses localhost defaults

Flags:
  --url URL        Splunk management URL (default: https://localhost:8089)
  --user USER      Splunk username (default: admin)
  --password PASS  Splunk password (prompted if omitted)
  --dry-run        Print config as JSON without posting to Splunk
  --clear          Delete all existing documents before inserting

NOTE: All service SPLs omit an explicit index= so they search Splunk's
default indexes. If your SQL data lives in a specific index, prepend
`index=your_index` to each search. Thresholds are conservative starting
points — tune them after observing normal operating ranges.
"""

import sys
import os
import json
import argparse
import urllib.request
import urllib.parse
import urllib.error
import ssl
import getpass

# ─── Constants ────────────────────────────────────────────────────────────────

DEFAULT_URL = "https://localhost:8089"
DEFAULT_USER = "admin"
APP_NAMESPACE = "nobody/straja"

_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE


# ─── Auth ─────────────────────────────────────────────────────────────────────

def get_session_key(base_url, user, password):
    url = f"{base_url}/services/auth/login"
    body = urllib.parse.urlencode({"username": user, "password": password, "output_mode": "json"}).encode()
    req = urllib.request.Request(url, data=body, method="POST")
    with urllib.request.urlopen(req, context=_SSL_CTX, timeout=30) as resp:
        data = json.loads(resp.read())
        return data["sessionKey"]


# ─── KV REST helpers ──────────────────────────────────────────────────────────

def kv_request(base_url, session_key, method, collection, key=None, doc=None):
    kv_base = f"{base_url}/servicesNS/{APP_NAMESPACE}/storage/collections/data"
    url = f"{kv_base}/{collection}"
    if key:
        url = f"{url}/{urllib.parse.quote(key, safe='')}"
    headers = {
        "Authorization": f"Splunk {session_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    body = json.dumps(doc).encode() if doc is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, context=_SSL_CTX, timeout=30) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as exc:
        err = exc.read().decode("utf-8", errors="replace")[:300]
        raise RuntimeError(f"HTTP {exc.code} {method} {url}: {err}")


def kv_delete_all(base_url, session_key, collection):
    """Delete all documents from a collection."""
    docs = kv_request(base_url, session_key, "GET", collection,
                      key=None, doc=None)
    # GET without key returns a list
    if isinstance(docs, list):
        for doc in docs:
            k = doc.get("_key")
            if k:
                kv_request(base_url, session_key, "DELETE", collection, key=k)
        print(f"  Cleared {len(docs)} documents from {collection}")


def kv_upsert(base_url, session_key, collection, key, doc):
    """Insert or replace a document by _key."""
    doc["_key"] = key
    try:
        kv_request(base_url, session_key, "POST", collection, key=key, doc=doc)
    except RuntimeError as exc:
        if "404" in str(exc):
            kv_request(base_url, session_key, "POST", collection, doc=doc)
        else:
            raise


# ─── Tree SPL ─────────────────────────────────────────────────────────────────
#
# 33 nodes: 7 domains, 3 groups, 23 leaves.
# Output fields: node_id, parent_node_id (empty = root), node_label.

TREE_SPL = "| inputlookup bm_tree.csv"

_TREE_SPL_OLD = (
    "| makeresults count=33\n"
    "| streamstats count as row\n"
    "| eval node_id = case(\n"
    '    row=1,  "domain_trade",\n'
    '    row=2,  "domain_dq",\n'
    '    row=3,  "domain_batch",\n'
    '    row=4,  "domain_sla",\n'
    '    row=5,  "domain_queue",\n'
    '    row=6,  "domain_dbhealth",\n'
    '    row=7,  "domain_refdata",\n'
    '    row=8,  "grp_vol_daily",\n'
    '    row=9,  "grp_vol_30m",\n'
    '    row=10, "grp_late_starts",\n'
    '    row=11, "leaf_vol_daily_1a",\n'
    '    row=12, "leaf_vol_daily_1b",\n'
    '    row=13, "leaf_vol_30m_1a",\n'
    '    row=14, "leaf_vol_30m_1b",\n'
    '    row=15, "leaf_eq",\n'
    '    row=16, "leaf_fut",\n'
    '    row=17, "leaf_dq_1a",\n'
    '    row=18, "leaf_dq_1b",\n'
    '    row=19, "leaf_late_saciv",\n'
    '    row=20, "leaf_late_cdp",\n'
    '    row=21, "leaf_late_mtc",\n'
    '    row=22, "leaf_late_rereiv",\n'
    '    row=23, "leaf_late_sblt",\n'
    '    row=24, "leaf_stored_proc",\n'
    '    row=25, "leaf_sla_trial_balance",\n'
    '    row=26, "leaf_sla_cl_acct",\n'
    '    row=27, "leaf_sla_cg3_cpm",\n'
    '    row=28, "leaf_sla_cg3_rb",\n'
    '    row=29, "leaf_sla_mics_end",\n'
    '    row=30, "leaf_mics_queue",\n'
    '    row=31, "leaf_mics_top5",\n'
    '    row=32, "leaf_db_blocking",\n'
    '    row=33, "leaf_ca_prices"\n'
    ")\n"
    "| eval parent_node_id = case(\n"
    '    node_id="domain_trade",    "",\n'
    '    node_id="domain_dq",       "",\n'
    '    node_id="domain_batch",    "",\n'
    '    node_id="domain_sla",      "",\n'
    '    node_id="domain_queue",    "",\n'
    '    node_id="domain_dbhealth", "",\n'
    '    node_id="domain_refdata",  "",\n'
    '    node_id="grp_vol_daily",      "domain_trade",\n'
    '    node_id="grp_vol_30m",        "domain_trade",\n'
    '    node_id="grp_late_starts",    "domain_batch",\n'
    '    node_id="leaf_vol_daily_1a",  "grp_vol_daily",\n'
    '    node_id="leaf_vol_daily_1b",  "grp_vol_daily",\n'
    '    node_id="leaf_vol_30m_1a",    "grp_vol_30m",\n'
    '    node_id="leaf_vol_30m_1b",    "grp_vol_30m",\n'
    '    node_id="leaf_eq",            "domain_trade",\n'
    '    node_id="leaf_fut",           "domain_trade",\n'
    '    node_id="leaf_dq_1a",         "domain_dq",\n'
    '    node_id="leaf_dq_1b",         "domain_dq",\n'
    '    node_id="leaf_late_saciv",    "grp_late_starts",\n'
    '    node_id="leaf_late_cdp",      "grp_late_starts",\n'
    '    node_id="leaf_late_mtc",      "grp_late_starts",\n'
    '    node_id="leaf_late_rereiv",   "grp_late_starts",\n'
    '    node_id="leaf_late_sblt",     "grp_late_starts",\n'
    '    node_id="leaf_stored_proc",   "domain_batch",\n'
    '    node_id="leaf_sla_trial_balance", "domain_sla",\n'
    '    node_id="leaf_sla_cl_acct",       "domain_sla",\n'
    '    node_id="leaf_sla_cg3_cpm",       "domain_sla",\n'
    '    node_id="leaf_sla_cg3_rb",        "domain_sla",\n'
    '    node_id="leaf_sla_mics_end",      "domain_sla",\n'
    '    node_id="leaf_mics_queue",    "domain_queue",\n'
    '    node_id="leaf_mics_top5",     "domain_queue",\n'
    '    node_id="leaf_db_blocking",   "domain_dbhealth",\n'
    '    node_id="leaf_ca_prices",     "domain_refdata"\n'
    ")\n"
    "| eval node_label = case(\n"
    '    node_id="domain_trade",    "Trade Activity",\n'
    '    node_id="domain_dq",       "Data Quality",\n'
    '    node_id="domain_batch",    "Batch Monitoring",\n'
    '    node_id="domain_sla",      "SLA & Governance",\n'
    '    node_id="domain_queue",    "Queue Health",\n'
    '    node_id="domain_dbhealth", "Database Health",\n'
    '    node_id="domain_refdata",  "Reference Data",\n'
    '    node_id="grp_vol_daily",   "Volume Diff - Daily",\n'
    '    node_id="grp_vol_30m",     "Volume Diff - Last 30 Min",\n'
    '    node_id="grp_late_starts", "Late Starts",\n'
    '    node_id="leaf_vol_daily_1a", "TradeCapture1A",\n'
    '    node_id="leaf_vol_daily_1b", "TradeCapture1B",\n'
    '    node_id="leaf_vol_30m_1a",   "TradeCapture1A",\n'
    '    node_id="leaf_vol_30m_1b",   "TradeCapture1B",\n'
    '    node_id="leaf_eq",           "Equities & Equity Options",\n'
    '    node_id="leaf_fut",          "Futures & Futures Options",\n'
    '    node_id="leaf_dq_1a",        "TradeCapture1A",\n'
    '    node_id="leaf_dq_1b",        "TradeCapture1B",\n'
    '    node_id="leaf_late_saciv",   "SACIV",\n'
    '    node_id="leaf_late_cdp",     "CDP",\n'
    '    node_id="leaf_late_mtc",     "MTC",\n'
    '    node_id="leaf_late_rereiv",  "REREIV",\n'
    '    node_id="leaf_late_sblt",    "SBLT",\n'
    '    node_id="leaf_stored_proc",  "Stored Procedures",\n'
    '    node_id="leaf_sla_trial_balance", "Trial Balance",\n'
    '    node_id="leaf_sla_cl_acct",       "CL_ACCT_GRP_Balances",\n'
    '    node_id="leaf_sla_cg3_cpm",       "CG3-1 CPM",\n'
    '    node_id="leaf_sla_cg3_rb",        "CG3-1 Rb",\n'
    '    node_id="leaf_sla_mics_end",      "MICS End (Last job)",\n'
    '    node_id="leaf_mics_queue",    "MICS Ready Queue",\n'
    '    node_id="leaf_mics_top5",     "MICS Top 5 Sessions",\n'
    '    node_id="leaf_db_blocking",   "DB Blocking - MICS",\n'
    '    node_id="leaf_ca_prices",     "CA Prices"\n'
    ")\n"
    "| fields node_id, parent_node_id, node_label"
)  # _TREE_SPL_OLD kept for reference


# ─── Helper: build a Volume Diff SPL ──────────────────────────────────────────
# Thresholds (% vs historical average):
#   warning : diff < -20% or > +50%
#   critical: diff < -40% or > +80%
# Adjust based on observed normal ranges for each database.

def _vol_diff_spl(source, database):
    return "\n".join([
        f'sourcetype=SQL source="{source}" earliest=-2h',
        r'| rex field=_raw "Database=\"(?<Database>[^\"]+)\""',
        r'| rex field=_raw "Percent Diff=\"(?<pct_diff>[^\"]+)\""',
        r'| rex field=_raw "Today=\"(?<Today>[^\"]+)\""',
        r'| rex field=_raw "Average=\"(?<Average>[^\"]+)\""',
        r'| rex field=_raw "Yesterday=\"(?<Yesterday>[^\"]+)\""',
        f'| where Database="{database}"',
        "| eval pct_diff=round(tonumber(pct_diff)*100, 2)",
        "| stats latest(pct_diff) as pct_diff latest(Today) as Today"
        " latest(Average) as Average latest(Yesterday) as Yesterday",
        "| eval service_status=case(",
        "    pct_diff < -40 OR pct_diff >  80, \"critical\",",
        "    pct_diff < -20 OR pct_diff >  50, \"warning\",",
        '    true(), "ok")',
        '| eval pct_diff=pct_diff."%"',
        "| fields service_status, pct_diff, Today, Average, Yesterday",
    ])


# ─── Helper: build a By-Source trade count SPL ────────────────────────────────
# Flags warning if any market source drops below a low-volume threshold.
# Flags critical if any source reaches exactly zero.

def _by_source_spl(source):
    return "\n".join([
        f'sourcetype=SQL source="{source}" earliest=-2h',
        r'| rex field=_raw "source=\"(?<mkt_source>[^\"]+)\""',
        r'| rex field=_raw "TotalTradeCount=\"(?<cnt>[^\"]+)\""',
        "| eval cnt=tonumber(cnt)",
        "| stats latest(cnt) as TotalTradeCount by mkt_source",
        "| eval service_status=case(",
        "    TotalTradeCount=0 OR isnull(TotalTradeCount), \"critical\",",
        "    TotalTradeCount < 10, \"warning\",",
        '    true(), "ok")',
        "| fields service_status, mkt_source, TotalTradeCount",
    ])


# ─── Helper: build a TradeDate check SPL ──────────────────────────────────────
# PriorTradeDate=0 means the prior day's count is missing — data integrity issue.

def _tradedate_spl(database):
    return "\n".join([
        'sourcetype=SQL source="Trade_Capture_Tradedate_check" earliest=-2h',
        r'| rex field=_raw "Database=\"(?<Database>[^\"]+)\""',
        r'| rex field=_raw "currentDate=\"(?<currentDate>[^\"]+)\""',
        r'| rex field=_raw "PriorTradeDate=\"(?<PriorTradeDate>[^\"]+)\""',
        f'| where Database="{database}"',
        "| eval PriorTradeDate=tonumber(PriorTradeDate)",
        "| stats latest(currentDate) as currentDate latest(PriorTradeDate) as PriorTradeDate",
        "| eval service_status=case(",
        "    PriorTradeDate=0 OR isnull(PriorTradeDate), \"critical\",",
        '    true(), "ok")',
        "| fields service_status, Database, currentDate, PriorTradeDate",
        f'| eval Database="{database}"',
    ])


# ─── Helper: build a Late Starts SPL ──────────────────────────────────────────
# The Start source only fires when a batch has NOT started on time.
# Presence of events = delayed batches. The SPL searches all Start events so
# it returns one row even when the target team has zero late starts, as long
# as any Start event exists in the window (other teams' activity keeps it alive).
# Thresholds: >=5 late = critical, >=1 = warning, 0 = ok.

def _late_starts_spl(team):
    escaped = team.replace('"', '\\"')
    return "\n".join([
        'sourcetype=SQL source="Start" earliest=-2h',
        r'| rex field=_raw "Team Responsible=\"(?<team>[^\"]+)\""',
        r'| rex field=_raw "BatchName=\"(?<batch_name>[^\"]+)\""',
        r'| rex field=_raw "batch_id=\"(?<batch_id>[^\"]+)\""',
        f'| eval is_team=if(team="{escaped}", 1, 0)',
        "| stats sum(is_team) as late_count"
        f' values(eval(if(team="{escaped}", batch_name, null()))) as late_batches',
        "| eval service_status=case(",
        "    late_count >= 5, \"critical\",",
        "    late_count >= 1, \"warning\",",
        '    true(), "ok")',
        "| fields service_status, late_count, late_batches",
    ])


# ─── Helper: build an SLA Delay SPL ───────────────────────────────────────────
# An SLA_Delay event means the batch missed its SLA window.
# Events repeat every ~hour while the breach is unresolved.
# Presence of an event for this description in the last 24h = active breach.

def _sla_spl(description):
    escaped = description.replace('"', '\\"')
    return "\n".join([
        'sourcetype=SQL source="SLA_Delay" earliest=-24h',
        r'| rex field=_raw "description=\"(?<description>[^\"]+)\""',
        r'| rex field=_raw "slaTime=\"(?<sla_time>[^\"]+)\""',
        r'| rex field=_raw "delaySent=\"(?<delay_sent>[^\"]+)\""',
        f'| eval is_match=if(description="{escaped}", 1, 0)',
        "| stats sum(is_match) as breach_count"
        f' latest(eval(if(description="{escaped}", sla_time, null()))) as sla_time'
        f' latest(eval(if(description="{escaped}", delay_sent, null()))) as delay_sent',
        "| eval service_status=if(breach_count > 0, \"critical\", \"ok\")",
        "| fields service_status, breach_count, sla_time, delay_sent",
    ])


# ─── Service definitions ──────────────────────────────────────────────────────

SERVICES = [

    # ── Trade Volume Diff Daily ────────────────────────────────────────────────
    {
        "_key":                "vol_diff_daily_1a",
        "service_name":        "vol_diff_daily_1a",
        "service_description": "Trade Capture Volume Diff (Daily) — TradeCapture1A",
        "service_spl":         _vol_diff_spl("Trade_Capture_Volume_Diff", "TradeCapture1A"),
        "display_fields":      '["pct_diff", "Today", "Average", "Yesterday"]',
        "status_field":        "service_status",
    },
    {
        "_key":                "vol_diff_daily_1b",
        "service_name":        "vol_diff_daily_1b",
        "service_description": "Trade Capture Volume Diff (Daily) — TradeCapture1B",
        "service_spl":         _vol_diff_spl("Trade_Capture_Volume_Diff", "TradeCapture1B"),
        "display_fields":      '["pct_diff", "Today", "Average", "Yesterday"]',
        "status_field":        "service_status",
    },

    # ── Trade Volume Diff Last 30 Min ──────────────────────────────────────────
    {
        "_key":                "vol_diff_30m_1a",
        "service_name":        "vol_diff_30m_1a",
        "service_description": "Trade Capture Volume Diff (30 Min) — TradeCapture1A",
        "service_spl":         _vol_diff_spl("Trade_Capture_Volume_Diff_Last_30_Min", "TradeCapture1A"),
        "display_fields":      '["pct_diff", "Today", "Average", "Yesterday"]',
        "status_field":        "service_status",
    },
    {
        "_key":                "vol_diff_30m_1b",
        "service_name":        "vol_diff_30m_1b",
        "service_description": "Trade Capture Volume Diff (30 Min) — TradeCapture1B",
        "service_spl":         _vol_diff_spl("Trade_Capture_Volume_Diff_Last_30_Min", "TradeCapture1B"),
        "display_fields":      '["pct_diff", "Today", "Average", "Yesterday"]',
        "status_field":        "service_status",
    },

    # ── Equities & Futures by Source ───────────────────────────────────────────
    {
        "_key":                "eq_options_by_source",
        "service_name":        "eq_options_by_source",
        "service_description": "Equities & Equity Options by Market Source — zero-count detection",
        "service_spl":         _by_source_spl("EquitiesAndEquityOptionsBySource"),
        "display_fields":      '["mkt_source", "TotalTradeCount"]',
        "status_field":        "service_status",
    },
    {
        "_key":                "fut_options_by_source",
        "service_name":        "fut_options_by_source",
        "service_description": "Futures & Futures Options by Market Source — zero-count detection",
        "service_spl":         _by_source_spl("FuturesAndFuturesOptionsBySource"),
        "display_fields":      '["mkt_source", "TotalTradeCount"]',
        "status_field":        "service_status",
    },

    # ── TradeDate Data Quality ─────────────────────────────────────────────────
    {
        "_key":                "tradedate_check_1a",
        "service_name":        "tradedate_check_1a",
        "service_description": "Trade Capture Trade Date Check — TradeCapture1A",
        "service_spl":         _tradedate_spl("TradeCapture1A"),
        "display_fields":      '["Database", "currentDate", "PriorTradeDate"]',
        "status_field":        "service_status",
    },
    {
        "_key":                "tradedate_check_1b",
        "service_name":        "tradedate_check_1b",
        "service_description": "Trade Capture Trade Date Check — TradeCapture1B",
        "service_spl":         _tradedate_spl("TradeCapture1B"),
        "display_fields":      '["Database", "currentDate", "PriorTradeDate"]',
        "status_field":        "service_status",
    },

    # ── Late Starts by Team ────────────────────────────────────────────────────
    {
        "_key":                "late_starts_saciv",
        "service_name":        "late_starts_saciv",
        "service_description": "Batch Late Starts — Team SACIV",
        "service_spl":         _late_starts_spl("SACIV"),
        "display_fields":      '["late_count", "late_batches"]',
        "status_field":        "service_status",
    },
    {
        "_key":                "late_starts_cdp",
        "service_name":        "late_starts_cdp",
        "service_description": "Batch Late Starts — Team CDP",
        "service_spl":         _late_starts_spl("CDP"),
        "display_fields":      '["late_count", "late_batches"]',
        "status_field":        "service_status",
    },
    {
        "_key":                "late_starts_mtc",
        "service_name":        "late_starts_mtc",
        "service_description": "Batch Late Starts — Team MTC",
        "service_spl":         _late_starts_spl("MTC"),
        "display_fields":      '["late_count", "late_batches"]',
        "status_field":        "service_status",
    },
    {
        "_key":                "late_starts_rereiv",
        "service_name":        "late_starts_rereiv",
        "service_description": "Batch Late Starts — Team REREIV",
        "service_spl":         _late_starts_spl("REREIV"),
        "display_fields":      '["late_count", "late_batches"]',
        "status_field":        "service_status",
    },
    {
        "_key":                "late_starts_sblt",
        "service_name":        "late_starts_sblt",
        "service_description": "Batch Late Starts — Team SBLT",
        "service_spl":         _late_starts_spl("SBLT"),
        "display_fields":      '["late_count", "late_batches"]',
        "status_field":        "service_status",
    },

    # ── Stored Procedures ──────────────────────────────────────────────────────
    # RunTime is stored as 1900-01-01 HH:MM:SS (SQL Server time-as-datetime).
    # Extract hours to compute elapsed runtime.
    # warning: elapsed > 6h, critical: elapsed > 12h — calibrate for your procs.
    {
        "_key":                "stored_procedures",
        "service_name":        "stored_procedures",
        "service_description": "Running stored procedures — elapsed runtime check",
        "service_spl": "\n".join([
            'sourcetype=SQL source="Stored_Procedure" earliest=-2h',
            r'| rex field=_raw "StoredProcedureName=\"(?<proc_name>[^\"]+)\""',
            r'| rex field=_raw "BatchName=\"(?<batch_name>[^\"]+)\""',
            r'| rex field=_raw "RunTime=\"1900-01-01 (?<rh>\d+):(?<rm>\d+):"',
            "| eval elapsed_hours=round(tonumber(rh) + tonumber(rm)/60, 2)",
            "| stats latest(elapsed_hours) as elapsed_hours by batch_name, proc_name",
            "| eval service_status=case(",
            "    elapsed_hours > 12, \"critical\",",
            "    elapsed_hours >  6, \"warning\",",
            '    true(), "ok")',
            "| fields service_status, batch_name, proc_name, elapsed_hours",
        ]),
        "display_fields": '["batch_name", "proc_name", "elapsed_hours"]',
        "status_field":   "service_status",
    },

    # ── SLA & Governance ──────────────────────────────────────────────────────
    {
        "_key":                "sla_trial_balance",
        "service_name":        "sla_trial_balance",
        "service_description": "SLA Delay — Trial Balance",
        "service_spl":         _sla_spl("Trial Balance"),
        "display_fields":      '["breach_count", "sla_time", "delay_sent"]',
        "status_field":        "service_status",
    },
    {
        "_key":                "sla_cl_acct_grp",
        "service_name":        "sla_cl_acct_grp",
        "service_description": "SLA Delay — CL_ACCT_GRP_Balances",
        "service_spl":         _sla_spl("CL_ACCT_GRP_Balances"),
        "display_fields":      '["breach_count", "sla_time", "delay_sent"]',
        "status_field":        "service_status",
    },
    {
        "_key":                "sla_cg3_cpm",
        "service_name":        "sla_cg3_cpm",
        "service_description": "SLA Delay — CG3-1 CPM",
        "service_spl":         _sla_spl("CG3-1 CPM"),
        "display_fields":      '["breach_count", "sla_time", "delay_sent"]',
        "status_field":        "service_status",
    },
    {
        "_key":                "sla_cg3_rb",
        "service_name":        "sla_cg3_rb",
        "service_description": "SLA Delay — CG3-1 Rb",
        "service_spl":         _sla_spl("CG3-1 Rb"),
        "display_fields":      '["breach_count", "sla_time", "delay_sent"]',
        "status_field":        "service_status",
    },
    {
        "_key":                "sla_mics_end",
        "service_name":        "sla_mics_end",
        "service_description": "SLA Delay — MICS End (Last job)",
        "service_spl":         _sla_spl("MICS End (Last job)"),
        "display_fields":      '["breach_count", "sla_time", "delay_sent"]',
        "status_field":        "service_status",
    },

    # ── Queue Health ───────────────────────────────────────────────────────────
    # warning: >150 on queue, critical: >300. Calibrate based on normal peaks.
    {
        "_key":                "mics_ready_queue",
        "service_name":        "mics_ready_queue",
        "service_description": "MICS Ready Queue depth by source",
        "service_spl": "\n".join([
            'sourcetype=SQL source="MICS_READY_Queue" earliest=-2h',
            r'| rex field=_raw "SOURCE=\"(?<queue_source>[^\"]+)\""',
            r'| rex field=_raw "#_ON_QUEUE=\"(?<queue_count>[^\"]+)\""',
            "| eval queue_count=tonumber(trim(queue_count))",
            "| eval queue_source=trim(queue_source)",
            "| stats latest(queue_count) as queue_count by queue_source",
            "| eval service_status=case(",
            "    queue_count > 300, \"critical\",",
            "    queue_count > 150, \"warning\",",
            '    true(), "ok")',
            "| fields service_status, queue_source, queue_count",
        ]),
        "display_fields": '["queue_source", "queue_count"]',
        "status_field":   "service_status",
    },
    {
        "_key":                "mics_top5_sessions",
        "service_name":        "mics_top5_sessions",
        "service_description": "MICS Top 5 Sessions — queue count per session",
        "service_spl": "\n".join([
            'sourcetype=SQL source="MICS_Queue_Top_5_Sessions" earliest=-2h',
            r'| rex field=_raw "SESSION=\"(?<session>[^\"]+)\""',
            r'| rex field=_raw "COUNT=\"(?<session_count>[^\"]+)\""',
            r'| rex field=_raw "SOURCE=\"(?<queue_source>[^\"]+)\""',
            "| eval session_count=tonumber(trim(session_count))",
            "| eval queue_source=trim(queue_source)",
            "| stats latest(session_count) as session_count latest(queue_source) as queue_source by session",
            "| eval service_status=case(",
            "    session_count > 300, \"critical\",",
            "    session_count > 150, \"warning\",",
            '    true(), "ok")',
            "| fields service_status, session, queue_source, session_count",
        ]),
        "display_fields": '["session", "queue_source", "session_count"]',
        "status_field":   "service_status",
    },

    # ── Database Health ────────────────────────────────────────────────────────
    # DB_Blocking events only appear when blocking exists.
    # stats count always returns one row so "no events = ok" works cleanly.
    # total_elapsed_time is in minutes. warning: any blocking, critical: >60 min.
    {
        "_key":                "db_blocking_mics",
        "service_name":        "db_blocking_mics",
        "service_description": "MICS database blocking sessions — elapsed time check",
        "service_spl": "\n".join([
            'sourcetype=SQL source="DB_Blocking_SQL-PRODAG01" earliest=-2h',
            r'| rex field=_raw "session_id=\"(?<session_id>[^\"]+)\""',
            r'| rex field=_raw "blocking_session_id=\"(?<blocking_session>[^\"]+)\""',
            r'| rex field=_raw "database_name=\"(?<db_name>[^\"]+)\""',
            r'| rex field=_raw "total_elapsed_time=\"(?<elapsed>[^\"]+)\""',
            "| eval elapsed=tonumber(elapsed)",
            "| stats count as block_count max(elapsed) as max_elapsed",
            "| eval max_elapsed=coalesce(max_elapsed, 0)",
            "| eval service_status=case(",
            "    max_elapsed > 60, \"critical\",",
            "    block_count  > 0, \"warning\",",
            '    true(), "ok")',
            "| fields service_status, block_count, max_elapsed",
        ]),
        "display_fields": '["block_count", "max_elapsed"]',
        "status_field":   "service_status",
    },

    # ── Reference Data ─────────────────────────────────────────────────────────
    # CA_Prices emits every ~90 min. TOTALPRICES=0 means pricing table is empty.
    # makeresults anchor ensures one row even if no events in window (= critical).
    {
        "_key":                "ca_prices",
        "service_name":        "ca_prices",
        "service_description": "CA reference pricing table — availability and count check",
        "service_spl": "\n".join([
            '| makeresults | eval safekeep="CA"',
            "| appendcols [",
            '    search sourcetype=SQL source="CA_Prices" earliest=-3h',
            r'    | rex field=_raw "SAFEKEEP=\"(?<safekeep>[^\"]+)\""',
            r'    | rex field=_raw "TOTALPRICES=\"(?<total_prices>[^\"]+)\""',
            r'    | rex field=_raw "VALIDSTARTDATE=\"(?<valid_date>[^\"]+)\""',
            "    | eval total_prices=tonumber(total_prices)",
            "    | stats latest(total_prices) as total_prices latest(valid_date) as valid_date",
            "]",
            "| eval service_status=case(",
            "    isnull(total_prices) OR total_prices=0, \"critical\",",
            '    true(), "ok")',
            "| fields service_status, safekeep, total_prices, valid_date",
        ]),
        "display_fields": '["safekeep", "total_prices", "valid_date"]',
        "status_field":   "service_status",
    },
]


# ─── Mappings (leaf node_id → service_name) ───────────────────────────────────

MAPPINGS = [
    {"node_id": "leaf_vol_daily_1a",      "service_name": "vol_diff_daily_1a"},
    {"node_id": "leaf_vol_daily_1b",      "service_name": "vol_diff_daily_1b"},
    {"node_id": "leaf_vol_30m_1a",        "service_name": "vol_diff_30m_1a"},
    {"node_id": "leaf_vol_30m_1b",        "service_name": "vol_diff_30m_1b"},
    {"node_id": "leaf_eq",                "service_name": "eq_options_by_source"},
    {"node_id": "leaf_fut",               "service_name": "fut_options_by_source"},
    {"node_id": "leaf_dq_1a",             "service_name": "tradedate_check_1a"},
    {"node_id": "leaf_dq_1b",             "service_name": "tradedate_check_1b"},
    {"node_id": "leaf_late_saciv",        "service_name": "late_starts_saciv"},
    {"node_id": "leaf_late_cdp",          "service_name": "late_starts_cdp"},
    {"node_id": "leaf_late_mtc",          "service_name": "late_starts_mtc"},
    {"node_id": "leaf_late_rereiv",       "service_name": "late_starts_rereiv"},
    {"node_id": "leaf_late_sblt",         "service_name": "late_starts_sblt"},
    {"node_id": "leaf_stored_proc",       "service_name": "stored_procedures"},
    {"node_id": "leaf_sla_trial_balance", "service_name": "sla_trial_balance"},
    {"node_id": "leaf_sla_cl_acct",       "service_name": "sla_cl_acct_grp"},
    {"node_id": "leaf_sla_cg3_cpm",       "service_name": "sla_cg3_cpm"},
    {"node_id": "leaf_sla_cg3_rb",        "service_name": "sla_cg3_rb"},
    {"node_id": "leaf_sla_mics_end",      "service_name": "sla_mics_end"},
    {"node_id": "leaf_mics_queue",        "service_name": "mics_ready_queue"},
    {"node_id": "leaf_mics_top5",         "service_name": "mics_top5_sessions"},
    {"node_id": "leaf_db_blocking",       "service_name": "db_blocking_mics"},
    {"node_id": "leaf_ca_prices",         "service_name": "ca_prices"},
]


# ─── Setup ────────────────────────────────────────────────────────────────────

def run_setup(base_url, session_key, clear=False):
    print(f"\nConnected to {base_url}")

    # bm_tree_config
    if clear:
        print("\nClearing bm_tree_config...")
        kv_delete_all(base_url, session_key, "bm_tree_config")
    print("Writing bm_tree_config...")
    kv_upsert(base_url, session_key, "bm_tree_config", "tree",
              {"tree_spl": TREE_SPL})
    print("  OK")

    # bm_services
    if clear:
        print("\nClearing bm_services...")
        kv_delete_all(base_url, session_key, "bm_services")
    print(f"\nWriting {len(SERVICES)} services to bm_services...")
    for svc in SERVICES:
        key = svc["_key"]
        kv_upsert(base_url, session_key, "bm_services", key, dict(svc))
        print(f"  {key}")

    # bm_mappings
    if clear:
        print("\nClearing bm_mappings...")
        kv_delete_all(base_url, session_key, "bm_mappings")
    print(f"\nWriting {len(MAPPINGS)} mappings to bm_mappings...")
    for m in MAPPINGS:
        key = f"{m['node_id']}__{m['service_name']}"
        kv_upsert(base_url, session_key, "bm_mappings", key, dict(m))
        print(f"  {m['node_id']} -> {m['service_name']}")

    print("\nSetup complete.")


def dry_run():
    print("=== bm_tree_config ===")
    print(json.dumps({"_key": "tree", "tree_spl": TREE_SPL}, indent=2))
    print("\n=== bm_services ===")
    print(json.dumps(SERVICES, indent=2))
    print("\n=== bm_mappings ===")
    print(json.dumps(MAPPINGS, indent=2))


# ─── Entry point ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Batch Monitor KV store seeder")
    parser.add_argument("--url",      default=os.environ.get("BM_SPLUNK_URL",  DEFAULT_URL))
    parser.add_argument("--user",     default=os.environ.get("BM_SPLUNK_USER", DEFAULT_USER))
    parser.add_argument("--password", default=os.environ.get("BM_SPLUNK_PASS", ""))
    parser.add_argument("--dry-run",  action="store_true")
    parser.add_argument("--clear",    action="store_true",
                        help="Delete existing KV documents before inserting")
    args = parser.parse_args()

    if args.dry_run:
        dry_run()
        return

    password = args.password or getpass.getpass(f"Password for {args.user}@{args.url}: ")

    print(f"Authenticating as {args.user}...")
    try:
        session_key = get_session_key(args.url, args.user, password)
    except Exception as exc:
        print(f"ERROR: Authentication failed — {exc}", file=sys.stderr)
        sys.exit(1)

    run_setup(args.url, session_key, clear=args.clear)


if __name__ == "__main__":
    main()
