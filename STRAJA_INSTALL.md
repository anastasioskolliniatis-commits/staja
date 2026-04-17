# Straja — Installation & Configuration Guide

**Version:** 1.0.0  
**Package:** `straja-1.0.0.spl`  
**Target:** Splunk Enterprise 8.x / 9.x (Search Head)

---

## Prerequisites

| Requirement | Detail |
|---|---|
| Splunk Enterprise | 8.2 or higher |
| Role | `admin` or `sc_admin` |
| Python | 3.7+ (bundled with Splunk — no separate install) |
| Network | Search Head must reach `localhost:8089` (Splunk management port) |
| Data | SQL monitoring events indexed with `sourcetype=SQL` |

---

## Step 1 — Install the App

1. Log in to Splunk Web as **admin**
2. Go to **Apps → Manage Apps → Install app from file**
3. Upload `straja-1.0.0.spl`
4. Check **Upgrade app** if reinstalling over an existing version
5. Click **Upload**
6. When prompted, click **Restart Now**

> Splunk must restart to activate the KV Store collections and scripted inputs.

---

## Step 2 — Verify Auto-Initialisation

On first startup, `bm_init.py` runs automatically and seeds the tree configuration.

Confirm it ran successfully:

```
index=_internal sourcetype=bm_init action=init_done
```

You should see one event with `action=init_done tree_spl="| inputlookup bm_tree.csv"`.

If you see `action=init_skip reason=already_configured` — the app was already configured from a previous install. That is fine.

If you see nothing — wait 2–3 minutes and search again. If it still does not appear, check:

```
index=_internal sourcetype=bm_init
```

---

## Step 3 — Customise the Tree Structure

The tree defines the monitoring hierarchy shown in the left panel.

The default tree (`lookups/bm_tree.csv`) matches the template environment. **You must adapt it to your production node structure.**

### Option A — Edit via Config tab (recommended for small changes)

1. Open **Straja → Config → Tree Query**
2. The current SPL is `| inputlookup bm_tree.csv`
3. You can replace this with any SPL that returns `node_id`, `parent_node_id`, `node_label` columns

### Option B — Replace the CSV lookup

1. On the Splunk server, edit the file:
   ```
   $SPLUNK_HOME/etc/apps/batch_monitor/lookups/bm_tree.csv
   ```
2. Format:
   ```
   node_id,parent_node_id,node_label
   domain_trade,,Trade Activity
   grp_vol_daily,domain_trade,Volume Diff - Daily
   leaf_vol_1a,grp_vol_daily,TradeCapture1A
   ```
   - `parent_node_id` is **empty** for root nodes
   - Leaf nodes (no children) will become clickable drill-down panels
3. Reload the lookup — no restart needed. Refresh the Straja app.

---

## Step 4 — Configure Services

Services are SPL queries that determine the status (`ok` / `warning` / `critical`) of each leaf node.

### Option A — Run bm_setup.py (recommended for bulk seeding)

`bm_setup.py` contains all service definitions for this environment. Run it once after install:

```bash
cd $SPLUNK_HOME/etc/apps/batch_monitor/bin

python3 bm_setup.py --user admin --clear
# enter Splunk admin password when prompted
```

This will:
- Populate `bm_services` — 23 service SPL definitions
- Populate `bm_mappings` — maps each leaf node to its service
- Populate `bm_tree_config` — sets the tree SPL

> `--clear` wipes existing KV data before inserting. Omit if you want to preserve manual changes.

### Option B — Configure via the UI

1. Open **Straja → Config → Services**
   - Add a service with a name, SPL query, and display fields
   - The SPL must return a `service_status` column with values: `ok`, `warning`, or `critical`
2. Open **Straja → Config → Mappings**
   - Map each leaf `node_id` to a service name

---

## Step 5 — Verify the Collector

The collector (`bm_collector.py`) runs every 5 minutes via Splunk's scripted input.  
It executes all service SPLs and writes results to the `bm_results` KV collection.

### Check it is running

```
index=_internal sourcetype=bm_collector action=run_end
| table _time, run_id, run_duration_sec, run_success_count, run_error_count
| sort -_time
```

You should see one event per 5-minute cycle.

### Run it manually (first-time check)

```bash
cd $SPLUNK_HOME/etc/apps/batch_monitor/bin

python3 bm_collector.py --user admin
# enter Splunk admin password when prompted
```

Watch the output for any `CRITICAL` or `ERROR` lines.

### Common issues

| Symptom | Cause | Fix |
|---|---|---|
| `action=config_missing reason=tree_spl_not_configured` | bm_tree_config KV is empty | Run Step 2 search — check bm_init ran, or run bm_setup.py |
| `action=empty_queue reason=no_valid_mappings_found` | No service mappings in KV | Run bm_setup.py or configure via Config → Mappings |
| `action=check_failed` on every service | SPL sourcetype/source does not match indexed data | Update service SPLs to match your `sourcetype` and `source` field values |
| All nodes grey after collector ran | `bm_results` is populated but status is `no_data` | Data may not be in the search time window — check `earliest=` in service SPLs |

---

## Step 6 — Adapt Service SPLs to Production Data

The service SPLs in `bm_setup.py` are pre-written for a specific environment.  
For a new environment, verify:

1. **`sourcetype`** — SPLs assume `sourcetype=SQL`. Confirm your data uses this sourcetype:
   ```
   index=* sourcetype=SQL | stats count by source | head 20
   ```

2. **`source` field values** — Each service SPL filters on a specific `source=` value (e.g. `Trade_Capture_Volume_Diff`). Confirm these match your indexed data:
   ```
   index=* sourcetype=SQL | stats count by source | sort -count
   ```

3. **`earliest=` window** — SPLs use `earliest=-2h`. If your data arrives less frequently, widen this.

4. **Field names in `rex`** — SPL uses regex to extract fields from `_raw`. If your raw event format differs, update the `rex` patterns inside each service SPL.

To update a service SPL after finding a mismatch:
- **Via UI:** Straja → Config → Services → Edit service → update SPL
- **Via bm_setup.py:** Edit the helper function, then re-run `python3 bm_setup.py --user admin --clear`

---

## Step 7 — Enable Alerts (Optional)

Four saved searches are pre-built and disabled by default:

| Alert | Trigger | Default schedule |
|---|---|---|
| Vigil - Critical Service Alert | Any service goes CRITICAL | Every 5 min |
| Vigil - Warning Service Alert | Any service goes WARNING | Every 15 min |
| Vigil - No Data Alert | Any service returns no data | Every 15 min |
| Vigil - Collector Heartbeat | Collector has not run in 15 min | Every 15 min |

To enable:
1. Go to **Settings → Searches, Reports, and Alerts**
2. Filter by app: **batch_monitor**
3. Click **Edit → Enable** on each alert you want active
4. Click **Edit → Edit Alert** to configure notification actions (email, webhook, Slack, PagerDuty, etc.)

---

## Step 8 — Access the App

1. Go to **Apps → Straja** (or click the Straja icon in the app bar)
2. The **Monitor** tab loads the State Tree — nodes should show status colours within one collector cycle (up to 5 minutes)
3. Click any leaf node to drill down and see live SPL results
4. Click any group or domain node to see a children summary panel
5. The **Services** tab shows a flat status dashboard of all services
6. The **Alerts** tab shows recent critical/warning events from collector history

---

## Useful SPL Queries for Troubleshooting

```
# All collector activity
index=_internal sourcetype=bm_collector | table _time, action, node_id, service_name, service_status

# Services currently in error
index=_internal sourcetype=bm_collector action=check_failed earliest=-1h

# What is in bm_results right now
| inputlookup bm_results | table node_id, service_name, service_status, last_checked_time, row_count

# What services are configured
| inputlookup bm_services | table service_name, service_description

# What mappings are configured
| inputlookup bm_mappings | table node_id, service_name
```

---

## File Reference

| File | Purpose |
|---|---|
| `bin/bm_init.py` | Auto-seeds KV on first startup |
| `bin/bm_collector.py` | Runs service checks every 5 min |
| `bin/bm_setup.py` | CLI tool to bulk-seed all services and mappings |
| `lookups/bm_tree.csv` | Defines the node hierarchy |
| `default/collections.conf` | KV Store schema definitions |
| `default/savedsearches.conf` | Pre-built alert definitions (disabled by default) |
| `default/inputs.conf` | Scripted input configuration |
