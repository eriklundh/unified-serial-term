#!/usr/bin/env bash
# Start script for the FTDI loopback verification suite.
#
# Usage:
#   ./run_tests.sh                                  # default device URL
#   ./run_tests.sh --ftdi-url ftdi://0x403:0x6015:ABC123/1
#   ./run_tests.sh --ftdi-url ftdi://.../1 --ftdi-url ftdi://.../1  # multi-rig
#   ./run_tests.sh -v -k test_modem                 # extra pytest args
#
# To discover device URLs first:
#   python list_devices.py
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ -f .venv/bin/activate ]]; then
    # shellcheck source=/dev/null
    source .venv/bin/activate
fi

exec pytest -v "$@"
