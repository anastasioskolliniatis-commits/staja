#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# build.sh — Build distributable Splunk packages for Vigil
#
# Output:
#   dist/vigil-<version>.spl          — main monitoring app
#   dist/ta_sql_hec-<version>.spl     — companion HEC add-on
#
# Usage:
#   bash build.sh              # build both packages
#   bash build.sh --no-npm     # skip npm build (use existing JS bundle)
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
echo "==> Building Vigil v${VERSION}"

mkdir -p dist

# ── 1. Build React bundle ─────────────────────────────────────────────────────
if [[ "$SKIP_NPM" == "false" ]]; then
  echo "--> npm run build"
  (cd batch_monitor && npm run build)
else
  echo "--> Skipping npm build (--no-npm)"
fi

# ── 2. Package vigil (batch_monitor) ─────────────────────────────────────────
VIGIL_SPL="dist/vigil-${VERSION}.spl"
echo "--> Packaging $VIGIL_SPL"

tar -czf "$VIGIL_SPL" \
  --exclude="batch_monitor/src" \
  --exclude="batch_monitor/node_modules" \
  --exclude="batch_monitor/package.json" \
  --exclude="batch_monitor/package-lock.json" \
  --exclude="batch_monitor/webpack.config.js" \
  --exclude="batch_monitor/sampledata" \
  --exclude="batch_monitor/.gitignore" \
  --exclude="batch_monitor/local" \
  batch_monitor/

echo "    OK: $VIGIL_SPL ($(du -sh "$VIGIL_SPL" | cut -f1))"

# ── 3. Package ta_sql_hec ─────────────────────────────────────────────────────
HEC_SPL="dist/ta_sql_hec-${VERSION}.spl"
echo "--> Packaging $HEC_SPL"

tar -czf "$HEC_SPL" \
  --exclude="ta_sql_hec/.gitignore" \
  --exclude="ta_sql_hec/local" \
  ta_sql_hec/

echo "    OK: $HEC_SPL ($(du -sh "$HEC_SPL" | cut -f1))"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "==> Done. Packages in dist/"
ls -lh dist/*.spl
