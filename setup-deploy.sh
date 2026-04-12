ll
#!/bin/bash
# =============================================================================
# splunk-deploy: one-time setup
# Run this ONCE before your first commit to accept the server's SSH host key.
# PuTTY stores the key in the Windows registry — after this, the post-commit
# hook runs silently with -batch mode.
# =============================================================================

SERVER="172.24.81.233"
SERVER_USER="root"

echo ""
echo "=== splunk-deploy: first-time host key setup ==="
echo ""
echo "Connecting to ${SERVER_USER}@${SERVER} via plink..."
echo "If prompted with 'Store key in cache?'  --> type  y  and press Enter."
echo ""

"/c/Program Files/PuTTY/plink.exe" -ssh "${SERVER_USER}@${SERVER}" \
    "echo '  Connection OK — host key saved. You are ready to deploy.'"

echo ""
echo "Setup complete. You can now commit and the hook will deploy automatically."
echo ""
