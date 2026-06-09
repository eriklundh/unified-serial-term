#!/usr/bin/env bash
# Run the full harness against a flashed Pico. Exits non-zero on first failure.
# Author Erik Lundh, The Joy of Engineering, erik.lundh@ingenjorsgladje.se
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${1:-}"

port_arg=()
if [[ -n "$PORT" ]]; then
    port_arg=(--port "$PORT")
fi

echo "=== Pico CDC Test Rig harness ==="
echo ""

echo "--- Loopback echo test ---"
python3 "$SCRIPT_DIR/loopback_test.py" "${port_arg[@]}"
echo ""

echo "--- Settings round-trip test ---"
python3 "$SCRIPT_DIR/settings_test.py" "${port_arg[@]}"
echo ""

echo "All harness tests passed."
