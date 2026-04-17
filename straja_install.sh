#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Straja — One-shot installer
#
# Paste this entire script into the terminal on the Splunk server.
# Requires: curl or wget, internet access to raw.githubusercontent.com
#
# Usage:  bash straja_install.sh
#         SPLUNK_HOME=/opt/splunk bash straja_install.sh   # custom path
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SPLUNK_HOME="${SPLUNK_HOME:-/opt/splunk}"
APP_DIR="$SPLUNK_HOME/etc/apps/straja"
GITHUB_RAW="https://raw.githubusercontent.com/anastasioskolliniatis-commits/straja/main/straja"

# ── Download helper ───────────────────────────────────────────────────────────
fetch() {
    local url="$1" dest="$2"
    if command -v curl &>/dev/null; then
        curl -fsSL "$url" -o "$dest"
    elif command -v wget &>/dev/null; then
        wget -q "$url" -O "$dest"
    else
        echo "ERROR: curl or wget required"; exit 1
    fi
}

echo "==> Installing Straja into $APP_DIR"

# ── Create directory structure ────────────────────────────────────────────────
mkdir -p "$APP_DIR/appserver/static/pages"
mkdir -p "$APP_DIR/appserver/templates"
mkdir -p "$APP_DIR/bin"
mkdir -p "$APP_DIR/default/data/ui/nav"
mkdir -p "$APP_DIR/default/data/ui/views"
mkdir -p "$APP_DIR/lookups"
mkdir -p "$APP_DIR/metadata"

# ── Inline config files ───────────────────────────────────────────────────────
echo "--> Writing config files"

cat > "$APP_DIR/default/app.conf" << 'EOF'
[launcher]
author = admin
description = Real-time operations monitoring for batch jobs, trade activity, and data quality

[app]
version = 1.0.0
label = Straja
description = Real-time operations sentinel — batch jobs, trade activity, and data quality health
build = 1
is_configured = 0
check_for_updates = 0

[ui]
is_visible = 1
label = Straja

[package]
id = straja
EOF

cat > "$APP_DIR/default/collections.conf" << 'EOF'
[bm_tree_config]

[bm_services]
field.service_name        = string
field.service_description = string
field.service_spl         = string
field.display_fields      = string
field.status_field        = string

[bm_mappings]
field.node_id      = string
field.service_name = string

[bm_results]
field.node_id           = string
field.service_name      = string
field.service_status    = string
field.last_checked_time = string
field.run_id            = string
field.error_message     = string
field.row_count         = number

[bm_run_log]
field.run_id            = string
field.run_start_time    = string
field.run_duration_sec  = number
field.run_success_count = number
field.run_error_count   = number
EOF

cat > "$APP_DIR/default/inputs.conf" << 'EOF'
[script://./bin/bm_init.py]
interval    = 86400
sourcetype  = bm_init
index       = _internal
passAuth    = splunk-system-user
disabled    = false

[script://./bin/bm_collector.py]
interval    = 300
sourcetype  = bm_collector
index       = _internal
passAuth    = splunk-system-user
disabled    = false
EOF

cat > "$APP_DIR/default/props.conf" << 'EOF'
[bm_collector]
SHOULD_LINEMERGE = false
TIME_PREFIX = ^
TIME_FORMAT = %Y-%m-%d %H:%M:%S
MAX_TIMESTAMP_LOOKAHEAD = 20

[bm_init]
SHOULD_LINEMERGE = false
TIME_PREFIX = ^
TIME_FORMAT = %Y-%m-%d %H:%M:%S
MAX_TIMESTAMP_LOOKAHEAD = 20
EOF

cat > "$APP_DIR/default/transforms.conf" << 'EOF'
[bm_tree]
filename = bm_tree.csv

[bm_tree_config]
collection = bm_tree_config
type       = KV Store

[bm_services]
collection = bm_services
type       = KV Store

[bm_mappings]
collection = bm_mappings
type       = KV Store

[bm_results]
collection = bm_results
type       = KV Store

[bm_run_log]
collection = bm_run_log
type       = KV Store
EOF

cat > "$APP_DIR/default/data/ui/nav/default.xml" << 'EOF'
<nav default="monitor">
  <view name="monitor" default="true" />
</nav>
EOF

cat > "$APP_DIR/default/data/ui/views/monitor.xml" << 'EOF'
<view type="html">
  <label>Monitor</label>
</view>
EOF

cat > "$APP_DIR/metadata/default.meta" << 'EOF'
[]
access = read : [ * ], write : [ admin, power ]
export = system

[views]
access = read : [ * ], write : [ admin, power ]
export = system

[storage/collections/data/bm_tree_config]
access = read : [ * ], write : [ admin, sc_admin, nobody ]
export = system

[storage/collections/data/bm_services]
access = read : [ * ], write : [ admin, sc_admin, nobody ]
export = system

[storage/collections/data/bm_mappings]
access = read : [ * ], write : [ admin, sc_admin, nobody ]
export = system

[storage/collections/data/bm_results]
access = read : [ * ], write : [ admin, sc_admin, nobody ]
export = system

[storage/collections/data/bm_run_log]
access = read : [ * ], write : [ admin, sc_admin, nobody ]
export = system

[transforms]
access = read : [ * ], write : [ admin, sc_admin ]
export = system
EOF

cat > "$APP_DIR/lookups/bm_tree.csv" << 'EOF'
node_id,parent_node_id,node_label
domain_trade,,Trade Activity
domain_dq,,Data Quality
domain_batch,,Batch Monitoring
domain_sla,,SLA & Governance
domain_queue,,Queue Health
domain_dbhealth,,Database Health
domain_refdata,,Reference Data
grp_vol_daily,domain_trade,Volume Diff - Daily
grp_vol_30m,domain_trade,Volume Diff - Last 30 Min
grp_late_starts,domain_batch,Late Starts
leaf_vol_daily_1a,grp_vol_daily,TradeCapture1A
leaf_vol_daily_1b,grp_vol_daily,TradeCapture1B
leaf_vol_30m_1a,grp_vol_30m,TradeCapture1A
leaf_vol_30m_1b,grp_vol_30m,TradeCapture1B
leaf_eq_options,domain_trade,Equities & Equity Options
leaf_fut_options,domain_trade,Futures & Futures Options
leaf_dq_1a,domain_dq,TradeCapture1A
leaf_dq_1b,domain_dq,TradeCapture1B
leaf_late_saciv,grp_late_starts,SACIV
leaf_late_cdp,grp_late_starts,CDP
leaf_late_mtc,grp_late_starts,MTC
leaf_late_rereiv,grp_late_starts,REREIV
leaf_late_sblt,grp_late_starts,SBLT
leaf_stored_proc,domain_batch,Stored Procedures
leaf_trial_balance,domain_sla,Trial Balance
leaf_cl_acct,domain_sla,CL_ACCT_GRP_Balances
leaf_cg3_cpm,domain_sla,CG3-1 CPM
leaf_cg3_rb,domain_sla,CG3-1 Rb
leaf_mics_end,domain_sla,MICS End (Last job)
leaf_mics_queue,domain_queue,MICS Ready Queue
leaf_mics_sessions,domain_queue,MICS Top 5 Sessions
leaf_db_blocking,domain_dbhealth,DB Blocking - MICS
leaf_ca_prices,domain_refdata,CA Prices
EOF

# ── Download large files from GitHub ─────────────────────────────────────────
echo "--> Downloading Python scripts from GitHub"
fetch "$GITHUB_RAW/bin/bm_init.py"      "$APP_DIR/bin/bm_init.py"
fetch "$GITHUB_RAW/bin/bm_collector.py" "$APP_DIR/bin/bm_collector.py"
fetch "$GITHUB_RAW/bin/bm_setup.py"     "$APP_DIR/bin/bm_setup.py"

echo "--> Downloading UI bundle from GitHub"
fetch "$GITHUB_RAW/appserver/static/pages/monitor.js"              "$APP_DIR/appserver/static/pages/monitor.js"
fetch "$GITHUB_RAW/appserver/static/pages/monitor.js.LICENSE.txt"  "$APP_DIR/appserver/static/pages/monitor.js.LICENSE.txt"
fetch "$GITHUB_RAW/appserver/static/monitor.html"                  "$APP_DIR/appserver/static/monitor.html"
fetch "$GITHUB_RAW/appserver/templates/monitor.html"               "$APP_DIR/appserver/templates/monitor.html"

# ── Update APP_NAMESPACE in Python scripts to staja ───────────────────────────
echo "--> Patching app namespace"
sed -i 's|nobody/batch_monitor|nobody/straja|g' "$APP_DIR/bin/bm_collector.py"
sed -i 's|nobody/batch_monitor|nobody/straja|g' "$APP_DIR/bin/bm_init.py"

# ── Permissions ───────────────────────────────────────────────────────────────
echo "--> Setting permissions"
chmod +x "$APP_DIR/bin/"*.py
chown -R splunk:splunk "$APP_DIR" 2>/dev/null || true

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "==> Straja installed successfully at $APP_DIR"
echo ""
echo "Files installed:"
find "$APP_DIR" -type f | sort | sed "s|$APP_DIR/||" | sed 's/^/    /'
echo ""
echo "Next steps:"
echo "  1.  Restart Splunk:"
echo "      $SPLUNK_HOME/bin/splunk restart"
echo ""
echo "  2.  Seed services and mappings (run after restart):"
echo "      $SPLUNK_HOME/bin/splunk cmd python $APP_DIR/bin/bm_setup.py --user admin"
echo ""
echo "  3.  Open Straja in Splunk Web → Apps → Straja"
