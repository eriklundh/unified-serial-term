# PRIOR-ART-BUGS.md — catalog of bugs in the prior chat code

The user's two prior ChatGPT conversations produced working-ish code that
contains documented bugs. The exports of those conversations are kept in
`docs/prior-art/` for context, but **none of their code should be lifted
verbatim**. This document is a checklist of what was wrong so Claude Code
can avoid re-importing the bugs while consulting prior-art for ideas.

## Source files

The exported chats themselves aren't shipped with this repo (they contain
ChatGPT's own commentary, which isn't useful and may have IP issues). The
specific code snippets that mattered are summarised below. The user can
re-share them if needed; refer to the user-uploaded files
`ChatGPT-USB_FTDI_D2XX_Signaling.md` and
`ChatGPT-Popular_JS_Serial_Terminal.md` in the original chat.

## Bug catalogue

### B1 — Wrong baud divisor formula (Python `d2xx-serial.py`)

The Python code used the AN232R-01 fractional table, which has
**6-bit fractional codes** (`0b000000` through `0b000111`):

```python
# WRONG — this is the AN232R-01 table for the FT8U232AM chip,
# NOT the FT232BM / FT232R / FT-X family that includes FT231XS.
_fraction_table = [
    (0.0,   0b000000),
    (0.125, 0b000001),
    # ...
    (0.875, 0b000111),
]

def make_divisor(baud):
    ideal = 48_000_000 / (baud * 16)
    integer_div = min(int(ideal), 0x3FFF)
    frac = ideal - integer_div
    frac_code = min(_fraction_table, key=lambda x: abs(frac - x[0]))[1]
    return (integer_div << 6) | frac_code
```

**What it produces for 115200:** `(26 << 6) | 0` = `1664` = `0x0680`.

**What it should produce:** `0x001A`.

The correct algorithm is in Phase 1 / `docs/BAUD-VECTORS.md`.

### B2 — Wrong baud divisor formula (JS `FTDI_UART.js`)

The JS code used `baseClock = 3_000_000` with eighth-quantisation:

```js
// WRONG — this approximates a different chip family entirely.
static computeDivisor(baud) {
  const baseClock = 3000000;
  const divisor = baseClock / baud;
  const closest = Math.round(divisor * 8) / 8;
  const encoded = Math.round(closest * 512);
  return { value: encoded & 0xffff, index: (encoded >> 16) & 0x3f };
}
```

**What it produces for 115200:** `3000000 / 115200 = 26.04`, rounded to
`26.0`, encoded as `26.0 * 512 = 13312 = 0x3400`. **wValue: `0x3400`.**

**What it should produce:** `0x001A`.

### B3 — Misread of captured `wValue=0x09C4`

The prior chat saw `wValue = 0x09C4` in the USB capture and concluded it
was 115200 baud. **It isn't.** Decoded with the canonical algorithm:

```
divisor = 0x09C4 = 2500
integer part = 2500 & 0x3FFF = 2500
fractional code = 0
effective baud = 48_000_000 / (16 × 2500) = 1200 baud
```

`0x09C4` is **1200 baud**, not 115200. The capture was either taken
during a phase of driver init that briefly sets 1200 baud, or PuTTY's
selected baud rate at capture time wasn't 115200.

**Lesson:** the test vectors in `BAUD-VECTORS.md` are derived from the
canonical algorithm in `ftdi_sio.c`, not from any single capture.

### B4 — Wrong line-properties encoding (JS `setLineProps`)

```js
// WRONG — uses (dataBits - 5) as the encoded value.
async setLineProps(dataBits = 8, stopBits = 1, parity = 0) {
  const format = (dataBits - 5) | ((stopBits - 1) << 11) | (parity << 8);
  // ... 8N1 → format = (8-5) | 0 | 0 = 3 = 0x0003
}
```

**What it produces for 8N1:** `0x0003`.

**What it should produce:** `0x0008`. The chip expects the **literal**
number of data bits in the low byte, not an offset from 5.

### B5 — Wrong bulk-IN endpoint number (JS)

```js
// WRONG — 0x82 is the IN endpoint address (with direction bit) on a
// MULTI-CHANNEL chip (FT2232 channel A). The FT231XS IN endpoint is 0x81.
// And WebUSB's transferIn takes the endpoint NUMBER (1-15), not the address.
this.inEp = 0x82;
this.outEp = 0x02;
// ...
const r = await this.dev.transferIn(this.inEp, 64);
// transferIn(0x82, 64) sends to endpoint 0x82 = 130 (invalid number, max is 15)
```

**Correct:** `transferIn(1, 64)` for FT231XS IN endpoint, `transferOut(2, ...)`
for OUT endpoint. The endpoint number is 1-15, no direction bit.

### B6 — Wrong flow-control field mapping (JS)

```js
// WRONG — puts flow mode in wValue, but it belongs in the high byte
// of wIndex per ftdi_sio.c.
async setFlowControl(mode = 'off') {
  const modes = { off: 0x0000, rtscts: 0x0100, dtrdsr: 0x0200, xonxoff: 0x0400 };
  await this.dev.controlTransferOut({
    requestType: 'vendor', recipient: 'device', request: 2,
    value: modes[mode], index: 0,  // ← wrong field
  });
}
```

**Correct:** mode goes in `wIndex` high byte. For RTS/CTS:
`wValue=0x0000, wIndex=0x0100`. See `docs/phases/PHASE-03-modem-flow.md`.

### B7 — Missing initial reset (JS)

The JS code never calls `SIO_RESET` (request `0x00`, value `0x0000`)
before configuring. The Python code adds it but only after several
iterations of debugging. The official FTDI Windows driver always issues
reset first.

**Correct sequence:** see `docs/SETUP-SEQUENCE.md`.

### B8 — `readLoop` has no error handling (JS)

```js
async function readLoop() {
  while (running && uart) {
    const chunk = await uart.read();  // throws on disconnect
    term.write(new TextDecoder().decode(chunk));
  }
}
```

If the USB device disconnects, the unhandled rejection kills the loop
silently. The xterm terminal looks frozen with no error.

**Correct:** wrap in try/catch, surface error to the user, distinguish
disconnect from timeout. See `docs/phases/PHASE-08-streams.md` for the
stream-based approach with `AbortController` lifecycle.

### B9 — Treating `transferIn` result as `ArrayBuffer` of full size

```js
async read() {
  const r = await this.dev.transferIn(this.inEp, 64);
  const u8 = new Uint8Array(r.data.buffer);
  return u8.slice(2);
}
```

`r.data` is a `DataView` over a buffer that may be **larger** than the
actual data received (WebUSB pre-allocates `length` bytes). Using
`r.data.buffer` may include stale bytes beyond what the chip sent.

**Correct:** use `new Uint8Array(r.data.buffer, r.data.byteOffset, r.data.byteLength)`
or, simpler, wrap in `WebUsbTransport` which copies into a fresh
`Uint8Array` sized exactly to the response.

### B10 — `localStorage` usage in the persistent-settings example

Not a correctness bug, but worth noting: the original JS example used
`localStorage.setItem` directly. For the rebuilt terminal app, prefer
a thin wrapper that JSON-serialises and validates on load, so a
malformed value can't crash the app.

## Summary table

| Bug ID | Symptom                                          | Fix location                        |
|--------|--------------------------------------------------|-------------------------------------|
| B1     | Python `make_divisor()` produces wrong wValue    | Phase 1                              |
| B2     | JS `computeDivisor()` produces wrong wValue      | Phase 1                              |
| B3     | "Capture says 115200 = 0x09C4" — actually 1200   | Phase 1 / BAUD-VECTORS.md            |
| B4     | JS `setLineProps` encodes 8N1 as 0x0003          | Phase 2                              |
| B5     | JS `transferIn(0x82, ...)` — wrong endpoint num  | Phase 6 / PROTOCOL.md                |
| B6     | Flow mode in wValue instead of wIndex high byte  | Phase 3                              |
| B7     | No `SIO_RESET` before configuration              | Phase 6 / SETUP-SEQUENCE.md          |
| B8     | `readLoop` silently dies on disconnect           | Phase 8                              |
| B9     | `transferIn` result not sliced to actual length  | Phase 5 (`WebUsbTransport`)          |
| B10    | Raw `localStorage` access                        | terminal-app repo                    |
