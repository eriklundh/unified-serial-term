# py-verify — Pico CDC Test Rig verification suite

pytest suite that verifies a flashed Pico is running the correct
`pico-cdc-test-rig` firmware and behaving correctly over its CDC serial
port.

## What it checks

| Test class | What it proves |
|---|---|
| `TestEnumeration` | Device is enumerated and the serial port can be opened |
| `TestLoopback` | Every byte written echoes back unchanged (5 payload sizes) |
| `TestLineCoding` | Sentinel `0x01 0x3F` returns the correct `RIG baud=…` report for 6 line-coding combinations |

The loopback 4 KB burst test exercises ring-buffer wrap-around inside
the firmware's 256-byte ring buffer — any off-by-one in `rb_read` /
`rb_write` shows up as a mismatch.

The line-coding tests verify the full `SET_LINE_CODING` → callback →
sentinel-report path for baud rates 2400–115200, parity none/odd/even/
mark/space, and stop-bits 1/2.

## Requirements

- Python 3.10+
- The Pico plugged in via USB, flashed with `pico-cdc-test-rig` firmware

## Quick start (standalone script)

```bash
# From the repo root — creates .venv, installs deps, runs pytest:
./py-verify/verify.sh

# Explicit port (skip auto-detect):
./py-verify/verify.sh --port /dev/ttyACM0
```

The script creates `py-verify/.venv/` on the first run and re-uses it
thereafter.

## Manual setup

```bash
cd py-verify
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Then run pytest:

```bash
pytest -v                              # auto-detect device
pytest -v --port /dev/ttyACM0         # explicit port
pytest -v -k loopback                 # loopback tests only
pytest -v -k "not 4KB"                # skip the slow burst test
```

If no device is detected, all tests are automatically **skipped** (not
failed) with a message explaining what to do.

## Port auto-detection

The suite finds the Pico by its USB identity:

| Field | Value |
|---|---|
| Vendor ID | `0x2E8A` (Raspberry Pi) |
| Product ID | `0x000A` (Pico SDK CDC RP2040) |
| Product string | `Pico CDC Test Rig` |

Detection uses `serial.tools.list_ports` (included in pyserial).
Pass `--port DEV` to override.

## Integration with a broader test suite

These tests are designed to compose with a future FTDI-loopback pytest
suite (the WebUSB backend counterpart).  The `--port` override and the
`hardware` marker make both suites runnable from a shared `pytest.ini`
at the repo root:

```bash
# future composite run:
pytest cdc-tests/ ftdi-tests/ -v --tb=short
```

The `hardware` marker is registered in `conftest.py`; tests are skipped
cleanly when the corresponding device is absent, so running one suite
without its hardware does not fail the other.

## Sentinel protocol (reference)

Sending `\x01\x3F` to the Pico causes it to reply with one line instead
of echoing:

```
RIG baud=115200 data=8 parity=none stop=1 dtr=1 rts=0
```

All other bytes echo unchanged.  The loopback test payloads deliberately
avoid `\x01` and `\x3F` to prevent accidental sentinel triggering.
