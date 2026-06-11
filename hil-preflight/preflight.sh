#!/usr/bin/env bash
# hil-preflight/preflight.sh
#
# Verifies that all HIL hardware rigs are present and working.
# Runs the Pico CDC suite then the FTDI loopback suite; fails fast on error.
# Author Erik Lundh, The Joy of Engineering, erik.lundh@ingenjorsgladje.se
#
# Usage:
#   ./preflight.sh [--port /dev/ttyACMn] [--ftdi-url ftdi://...] [pytest-args]
#
# --port      forwarded to the Pico CDC sub-suite
# --ftdi-url  forwarded to the FTDI loopback sub-suite
# Any other args are forwarded to both sub-suites.
#
# Exit codes:
#   0   all hardware present and verified
#   1   one or more checks failed (see output for which device)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VENV="$SCRIPT_DIR/.venv"

# ── venv bootstrap ─────────────────────────────────────────────────────────────
if [[ ! -d "$VENV" ]]; then
    echo "Creating virtual environment in $VENV ..."
    python3 -m venv "$VENV"
fi
"$VENV/bin/pip" install --quiet --upgrade pip
"$VENV/bin/pip" install --quiet -r "$SCRIPT_DIR/requirements.txt"

# ── route args to sub-suites ───────────────────────────────────────────────────
PICO_ARGS=()
FTDI_ARGS=()
COMMON_ARGS=()
while [[ $# -gt 0 ]]; do
    case "$1" in
        --port)     PICO_ARGS+=("$1" "$2"); shift 2 ;;
        --ftdi-url) FTDI_ARGS+=("$1" "$2"); shift 2 ;;
        *)          COMMON_ARGS+=("$1"); shift ;;
    esac
done

# ── run suites ─────────────────────────────────────────────────────────────────
echo ""
echo "=== HIL Preflight: hardware verification ==="
echo ""

echo "--- 1/2  Pico CDC Test Rig ---"
"$VENV/bin/pytest" "$ROOT/pico-cdc-test-rig/py-verify" \
    -v --tb=short "${PICO_ARGS[@]+"${PICO_ARGS[@]}"}" "${COMMON_ARGS[@]+"${COMMON_ARGS[@]}"}" \
    || { echo ""; echo "PREFLIGHT FAILED: Pico CDC Test Rig."; exit 1; }

echo ""
echo "--- 2/2  FTDI Loopback Plug ---"

# pyftdi (libusb) cannot claim the plug while the kernel's ftdi_sio driver
# holds it, and other users of the shared rig — notably the ftdi-unbind
# repo's bind/unbind-cycle CI job — deliberately leave it bound. Detach the
# test plug (VID:PID 0403:6015 only; other FTDI devices are left alone)
# when passwordless sudo allows; otherwise keep hands off and let the
# suite's own failure message explain the manual unbind.
FTDI_RIG_VIDPID="0403:6015"
if [[ "$(uname -s)" == "Linux" ]]; then
    for intf in /sys/bus/usb/drivers/ftdi_sio/*:*; do
        [[ -e "$intf" ]] || continue
        vidpid="$(cat "$intf/../idVendor" 2>/dev/null):$(cat "$intf/../idProduct" 2>/dev/null)"
        [[ "$vidpid" == "$FTDI_RIG_VIDPID" ]] || continue
        if sudo -n true 2>/dev/null; then
            echo "Detaching $(basename "$intf") from ftdi_sio (pyftdi needs the raw USB device)..."
            basename "$intf" | sudo -n tee /sys/bus/usb/drivers/ftdi_sio/unbind >/dev/null
        else
            echo "WARNING: $FTDI_RIG_VIDPID is bound to ftdi_sio and sudo needs a password;"
            echo "         the FTDI suite will fail. Unbind manually first, e.g.:"
            echo "         sudo ftdi-unbind $FTDI_RIG_VIDPID   (companion repo ../../ftdi-unbind)"
        fi
    done
fi

"$VENV/bin/pytest" "$ROOT/ftdi-loopback-verify" \
    -v --tb=short "${FTDI_ARGS[@]+"${FTDI_ARGS[@]}"}" "${COMMON_ARGS[@]+"${COMMON_ARGS[@]}"}" \
    || { echo ""; echo "PREFLIGHT FAILED: FTDI Loopback Plug."; exit 1; }

echo ""
echo "=== HIL Preflight PASSED: all hardware verified ==="
