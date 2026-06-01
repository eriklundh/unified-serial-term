# Pico CDC Test Rig — Host Harness

Python 3 + pyserial harness that opens the Pico's CDC port and asserts
the rig behaves correctly. It is the Phase 2–3 acceptance criterion and
is reused by the terminal-app's Web Serial backend smoke tests.

## Requirements

```bash
pip install pyserial
```

## Running

```bash
# Auto-detect /dev/ttyACM* and run both tests
./harness/run.sh

# Specify port explicitly
./harness/run.sh /dev/ttyACM0
```

Both scripts exit **0** on success, **non-zero** on the first failure,
with a clear message to stderr explaining what failed.

## What each test proves

### `loopback_test.py`

Sends five payloads (empty, single byte, 256-byte ramp, ASCII string,
4 KB burst) and asserts each comes back byte-for-byte unchanged.

This validates the ring-buffer loopback path (Phase 2): read from
CDC RX, buffer, drain to CDC TX without byte loss.

The 4 KB burst exercises wrap-around inside the 256-byte ring buffer —
the firmware must drain and re-fill the buffer many times to complete
it. Any off-by-one in `rb_read`/`rb_write` shows up as a mismatch.

### `settings_test.py`

Opens the port with six different line-coding combinations
(115200-8N1, 9600-7O2, 38400-8E1, etc.), sends the sentinel sequence
`0x01 0x3F`, and parses the `RIG baud=N data=N parity=X stop=X …`
response. Asserts every field matches what was requested.

This validates the line-coding capture callbacks (Phase 3): the OS
sends `SET_LINE_CODING` on open, TinyUSB calls
`tud_cdc_line_coding_cb`, and the firmware stores and reports the
values correctly.

## Sentinel protocol

Sending `\x01\x3F` causes the rig to reply with:

```
RIG baud=115200 data=8 parity=none stop=1 dtr=1 rts=0
```

All other bytes echo unchanged. The sentinel is safe to use alongside
the loopback test as long as `\x01\x3F` does not appear in loopback
payloads (the loopback test avoids these byte values).

## Terminal-app integration

The terminal-app's Web Serial backend smoke test flashes this firmware,
then exercises the same loopback and settings-report paths through
`navigator.serial` in a browser-driven test. This harness serves as the
lower-level sanity check that the firmware itself is correct before the
browser layer is involved.
