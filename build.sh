#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# build.sh — Build distributable Splunk packages for Straja
#
# Output:
#   dist/straja-<version>.spl          — main monitoring app
#   dist/ta_sql_hec-<version>.spl      — companion HEC input add-on
#
# Usage:
#   bash build.sh              # full build (npm + package)
#   bash build.sh --no-npm     # skip npm build, repackage existing bundle
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

SKIP_NPM=false
for arg in "$@"; do
  [[ "$arg" == "--no-npm" ]] && SKIP_NPM=true
done

# ── Read version from app.conf ────────────────────────────────────────────────
VERSION=$(grep -E "^version\s*=" batch_monitor/default/app.conf | head -1 | awk -F'=' '{gsub(/ /,"",$2); print $2}')
echo "==> Building Straja v${VERSION}"

mkdir -p dist

# ── 1. Build React bundle ─────────────────────────────────────────────────────
if [[ "$SKIP_NPM" == "false" ]]; then
  echo "--> npm run build"
  (cd batch_monitor && npm run build)
else
  echo "--> Skipping npm build (--no-npm)"
fi

# ── 2. Package straja (batch_monitor) ────────────────────────────────────────
STRAJA_SPL="dist/straja-${VERSION}.spl"
echo "--> Packaging $STRAJA_SPL"

tar -czf "$STRAJA_SPL" \
  --exclude="batch_monitor/src" \
  --exclude="batch_monitor/node_modules" \
  --exclude="batch_monitor/package.json" \
  --exclude="batch_monitor/package-lock.json" \
  --exclude="batch_monitor/webpack.config.js" \
  --exclude="batch_monitor/sampledata" \
  --exclude="batch_monitor/.gitignore" \
  --exclude="batch_monitor/local" \
  --exclude="batch_monitor/__pycache__" \
  --exclude="batch_monitor/bin/__pycache__" \
  batch_monitor/

echo "    OK: $STRAJA_SPL ($(du -sh "$STRAJA_SPL" | cut -f1))"

# ── 3. Package ta_sql_hec ─────────────────────────────────────────────────────
HEC_SPL="dist/ta_sql_hec-${VERSION}.spl"
echo "--> Packaging $HEC_SPL"

tar -czf "$HEC_SPL" \
  --exclude="ta_sql_hec/.gitignore" \
  --exclude="ta_sql_hec/local" \
  --exclude="ta_sql_hec/sampledata" \
  --exclude="ta_sql_hec/bin/send_sample.py" \
  --exclude="ta_sql_hec/__pycache__" \
  --exclude="ta_sql_hec/bin/__pycache__" \
  ta_sql_hec/

echo "    OK: $HEC_SPL ($(du -sh "$HEC_SPL" | cut -f1))"

# ── 4. Verify contents ────────────────────────────────────────────────────────
echo ""
echo "--> Verifying straja package contents:"
tar -tzf "$STRAJA_SPL" | grep -v "/$" | sort | sed 's/^/    /'

echo ""
echo "--> Verifying ta_sql_hec package contents:"
tar -tzf "$HEC_SPL" | grep -v "/$" | sort | sed 's/^/    /'

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "==> Done."
ls -lh dist/*.spl
