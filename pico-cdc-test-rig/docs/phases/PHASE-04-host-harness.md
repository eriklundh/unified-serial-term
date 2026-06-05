# PHASE-04-host-harness.md — Host-side verification harness

Branch: `phase/04-host-harness`

## Goal

A reusable host-side test harness (Python 3 + pyserial) that opens the
Pico's port and asserts the rig behaves: byte loopback and settings
round-trip. This harness is the acceptance oracle for Phases 2–3, and
the terminal-app reuses it for its Web Serial hardware smoke.

## Ordering note

Although numbered Phase 4, the harness's *assertions* are what turned
Phases 2 and 3 green — write each assertion as you build the behavior it
checks. This phase consolidates them into a documented, reusable tool
with proper argument handling and clear pass/fail output.

## Why Python + pyserial, not a browser

The rig's own tests don't need a browser — pyserial opens
`/dev/ttyACM*` directly and exercises the loopback and sentinel report
at the OS-serial level. That's simpler, scriptable, and runnable on the
bench machine (Pi 5) without Chromium. The *browser* test of this same
device belongs to the terminal-app (its Web Serial backend smoke); this
harness proves the firmware itself is sound, independent of any browser.

## Files

```
harness/loopback_test.py
harness/settings_test.py
harness/run.sh             ← runs both, sets exit code
harness/README.md
harness/requirements.txt   ← pyserial
```

## Step-by-step

### 4.1 — Loopback test

`harness/loopback_test.py`:

- Auto-detect the port: scan `/dev/ttyACM*` (Linux) /
  `/dev/cu.usbmodem*` (macOS), or take `--port`. Optionally filter by
  the product string / VID `0xcafe` via `serial.tools.list_ports`.
- Open at 115200 8N1 (nominal for CDC).
- Test payloads: empty, single byte, 64 bytes (one EP buffer), 256
  bytes (RX bufsize), and a multi-KB block. For each: write, read back
  with timeout, assert byte-for-byte equality.
- Be careful **not** to include the sentinel `0x01 0x3F` in payloads
  (it would be intercepted as a report request).
- Clear pass/fail per case; non-zero exit on any failure.

Commit: `feat(harness): loopback echo verification over pyserial`

### 4.2 — Settings round-trip test

`harness/settings_test.py`:

- For several configs — e.g. (115200, 8, none, 1), (9600, 7, even, 2) —
  open the port with those serial parameters, set DTR/RTS explicitly,
  send the sentinel `\x01\x3F`, read the report line, parse it, and
  assert each field matches what was requested.
- This proves the firmware captured `tud_cdc_line_coding_cb` /
  `tud_cdc_line_state_cb` correctly, and (when the terminal-app reuses
  it) that the Web Serial backend passed settings through.

Commit: `feat(harness): settings round-trip verification via sentinel`

### 4.3 — Runner and docs

`harness/run.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
python3 harness/loopback_test.py "$@"
python3 harness/settings_test.py "$@"
echo "All harness tests passed."
```

`harness/README.md`: how to install (`pip install -r requirements.txt`),
how to run (`./harness/run.sh` or `--port /dev/ttyACM0`), what each test
proves, and a section "Reuse from terminal-app" explaining that the
terminal-app's Web Serial hardware smoke flashes this firmware and can
either call this harness directly (to confirm the device) or replicate
the settings-round-trip assertion through the browser.

Commit: `docs(harness): document usage and terminal-app integration`

## Acceptance checklist

- [ ] `harness/loopback_test.py` passes against a flashed Pico (all
      payload sizes)
- [ ] `harness/settings_test.py` passes (all configs round-trip)
- [ ] Harness exits non-zero with a clear message when no device is
      present (don't hang waiting for a port)
- [ ] `harness/README.md` explains terminal-app reuse
- [ ] Branch merged to `main`

## Where this runs

On the bench machine with the Pico attached (Pi 5 or laptop). Claude
Code on <build-host> can *write* the harness (it's just Python) but can't
*run* it meaningfully without a flashed Pico on a port it can see — so
the run-and-verify step is a bench step, like flashing. If the Pico is
passed through to <build-host> (the same usbip/passthrough trick discussed
for the FTDI rig), <build-host> could run the harness too — but for a
firmware project the bench (Pi 5) is usually where the device lives.
