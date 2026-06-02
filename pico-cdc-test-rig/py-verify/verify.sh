#!/usr/bin/env bash
# Standalone start script for the Pico CDC Test Rig verification suite.
#
# Usage:
#   ./py-verify/verify.sh [--port /dev/ttyACMn] [extra pytest args]
#
# First run: creates a .venv inside py-verify/ and installs requirements.
# Subsequent runs: re-uses the existing venv (fast).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$SCRIPT_DIR/.venv"

# ── venv bootstrap ────────────────────────────────────────────────────────────
if [[ ! -d "$VENV" ]]; then
    echo "Creating virtual environment in $VENV ..."
    python3 -m venv "$VENV"
fi

"$VENV/bin/pip" install --quiet --upgrade pip
"$VENV/bin/pip" install --quiet -r "$SCRIPT_DIR/requirements.txt"

# ── run pytest ────────────────────────────────────────────────────────────────
echo ""
echo "=== Pico CDC Test Rig — firmware verification ==="
echo ""

"$VENV/bin/pytest" "$SCRIPT_DIR" -v --tb=short "$@"
