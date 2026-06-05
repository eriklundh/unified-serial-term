# TEST-PLAN.md — ftdi-webusb-driver

Acceptance test plan for the TypeScript WebUSB driver library.
Two tiers: pure-logic unit tests (no hardware) and hardware-in-loop (HIL)
integration tests against the real FT231XS loopback plug.

---

## Tier overview

| Tier | Command | Hardware | Gate |
|------|---------|----------|------|
| Unit | `npm test` | none | always |
| HIL standard | `npm run test:hw` | FTDI loopback plug | `FTDI_HW_TEST=1` |
| HIL + modem | `FTDI_HW_MODEM=1 npm run test:hw` | FTDI plug w/ modem jumpers | `FTDI_HW_TEST=1 FTDI_HW_MODEM=1` |

`npm run test:hw` automatically runs `../../hil-preflight/preflight.sh` before
Vitest starts. If the device is absent the suite exits immediately.

---

## Prerequisites

### Unit tests

None. `npm install` is sufficient.

### HIL tests

1. FTDI loopback plug (FT231XS, VID `0x0403`, PID `0x6015`) connected.
2. Plug wiring:
   - TX shorted to RX — required for all data tests
   - RTS shorted to CTS — required for modem truth-table (`FTDI_HW_MODEM=1`)
   - DTR shorted to DSR — required for modem truth-table (`FTDI_HW_MODEM=1`)
3. Kernel driver unbound before the run:
   ```
   ../../ftdi-unbind/macos-linux/ftdi-unbind 0403:6015
   ```
4. After the run, rebind:
   ```
   ../../ftdi-unbind/macos-linux/ftdi-bind 0403:6015
   ```

---

## Unit test suite — `npm test`

Expected: **89 tests, 10 files, all pass.**

### T-U-01  Baud divisor  (`src/baud.test.ts`)

| Test | Expectation |
|------|-------------|
| All vectors in `docs/BAUD-VECTORS.md` | Correct `{ wValue, wIndex }` for each standard baud rate |
| `baudToDivisor(115200)` | `{ wValue: 0x001A, wIndex: 0x0000 }` |
| `baudToDivisor(3000000)` | Special case: divisor `0x0000` |
| `baudToDivisor(2000000)` | Special case: divisor `0x0001` |
| `baudToDivisor(0)` | Throws `RangeError` |
| `baudToDivisor(4000000)` | Throws `RangeError` |

### T-U-02  Line-properties encoder  (`src/line.test.ts`)

| Test | Expectation |
|------|-------------|
| `{dataBits:8, parity:'none', stopBits:1}` | `0x0008` |
| `{dataBits:7, parity:'even', stopBits:1}` | `0x0207` |
| `{dataBits:8, parity:'odd', stopBits:2}` | `0x1108` |
| `{..., breakOn:true}` | Bit 14 set |
| `dataBits:4` | Throws `RangeError` |
| `parity:'foo'` | Throws `RangeError` |

### T-U-03  Modem-control encoder  (`src/modem.test.ts`)

| Test | Expectation |
|------|-------------|
| `{dtr:true}` | `wValue: 0x0101` (set DTR, DTR change-mask set) |
| `{dtr:false}` | `wValue: 0x0100` (clear DTR, DTR change-mask set) |
| `{rts:true}` | `wValue: 0x0202` |
| `{rts:false}` | `wValue: 0x0200` |
| `{dtr:true, rts:false}` | Both bits encoded independently, no bleed |

### T-U-04  Flow-control encoder  (`src/flow.test.ts`)

| Test | Expectation |
|------|-------------|
| `'none'` | `wValue=0x0000, wIndex=0x0000` |
| `'rtscts'` | Flow-type byte `0x01` in wValue high byte |
| `'dtrdsr'` | Flow-type byte `0x02` |
| `'xonxoff'` with defaults | Flow-type `0x04`, XON=0x11, XOFF=0x13 |
| Custom XON/XOFF chars | Chars round-trip in `wValue` low byte / `wIndex` low byte |

### T-U-05  Status-header stripping  (`src/read.test.ts`)

| Test | Expectation |
|------|-------------|
| Full packet (header + payload) | `modemStatus`, `lineStatus`, `payload` all returned |
| Idle packet (2-byte header only) | `payload.length === 0` |
| Short packet (< 2 bytes) | Throws `RangeError` |
| Modem byte `CTS` bit (bit 4) | `flags.cts === true` |
| Modem byte `DSR` bit (bit 5) | `flags.dsr === true` |
| Modem byte `RI` bit (bit 6) | `flags.ri === true` |
| Modem byte `RLSD` bit (bit 7) | `flags.rlsd === true` |
| Line byte: overrun, parity, framing, break | Corresponding flag bits correct |

### T-U-06  MockUsbTransport  (`src/transport.mock.test.ts`)

| Test | Expectation |
|------|-------------|
| `controlOut` calls recorded in order | Call log entries match parameters exactly |
| `controlIn` returns pre-programmed response | Returned `Uint8Array` matches enqueued data |
| Bulk-IN enqueue then read | Enqueued data returned by `bulkIn` in FIFO order |
| Bulk-OUT captured | Written bytes accessible via `bulkOutLog` |

### T-U-07  FtdiUart setup sequence  (`src/ftdi-uart.test.ts`)

| Test | Expectation |
|------|-------------|
| `configure()` control-transfer sequence | 8 calls in exact order: reset → data format → DTR → RTS → flow → baud → latency → modem-status read |
| Each call carries correct `wValue`/`wIndex` | Values match output of pure-function encoders (T-U-01 through T-U-04) |
| `close()` | Releases interface then calls `transport.close()` |
| `FtdiUart.open(device)` | Builds `WebUsbTransport`, opens it, returns ready `FtdiUart` |

### T-U-08  Read / write paths  (`src/ftdi-uart-rw.test.ts`)

| Test | Expectation |
|------|-------------|
| `write(empty)` | Zero bulk-OUT calls |
| `write(63 bytes)` | One bulk-OUT of 63 bytes |
| `write(64 bytes)` | One bulk-OUT of 64 bytes, no zero-length follow-up |
| `write(65 bytes)` | Two bulk-OUTs: 64 + 1 |
| `write(256 bytes)` | Four bulk-OUTs of 64 |
| `read()` from idle device | Returns `Uint8Array` of length 0 |
| `read()` with 10-byte payload | Returns `Uint8Array` of length 10 |

### T-U-09  Stream API  (`src/ftdi-uart-streams.test.ts`)

| Test | Expectation |
|------|-------------|
| `readable` yields stripped payload | Chunks from `read()` appear on the stream |
| `readable` skips idle packets | Empty payloads not enqueued |
| `writable` accepts `Uint8Array` | Delegates to `write()`, data lands in bulk-OUT log |
| `cancel()` on readable | Stops read loop; does not hang |

### T-U-10  Package entry  (`src/index.test.ts`)

| Test | Expectation |
|------|-------------|
| `VERSION` exported | Non-empty string |
| All public symbols re-exported | Importable from the package root |

---

## HIL integration suite — `npm run test:hw`

**Hardware required:** FTDI loopback plug, `ftdi_sio` unbound.  
**Expected (standard):** 13 tests pass, modem tests skipped unless `FTDI_HW_MODEM=1`.  
**Expected (with modem):** 14 tests pass.

### T-H-01  Device discovery  (implicit in all hw tests)

`getTestDevice()` in `test-hw/setup.ts`:
- `FTDI_HW_TEST` env var must be set; if absent every test throws before running.
- Returns a `USBDevice` matching VID `0x0403`, PID `0x6015`.
- Fails with a clear error message if no matching device is found.

### T-H-02  Baud cycling  (`test-hw/baud.test.ts`)

For each rate in `[9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]`:

| Step | Expectation |
|------|-------------|
| `ftdi.configure({ baud })` | Resolves without error |
| Underlying USB control transfers | Complete without USB `STALL` or error response |

**Pass criterion:** All 8 reconfiguration calls resolve cleanly.

### T-H-03  Data loopback  (`test-hw/loopback.test.ts`)

| Step | Expectation |
|------|-------------|
| Open device, configure 115200 8N1, latency 4 ms | No error |
| Write `"PING\n"` (5 bytes) via `ftdi.write()` | No error |
| Collect bytes over 2 s timeout | ≥ 5 bytes received |
| Decode collected bytes | Contains `"PING"` |

**Pass criterion:** Written bytes reflected back and decoded correctly.

### T-H-04  Stream data loopback  (`test-hw/streams.test.ts`)

| Step | Expectation |
|------|-------------|
| Open device, configure 115200 8N1, latency 4 ms | No error |
| Write `"HELLO"` via `ftdi.writable` writer | No error |
| Read 5 bytes from `ftdi.readable` reader within 2 s | Value matches `"HELLO"` |
| Release reader and writer locks | No errors or hangs |

**Pass criterion:** `ReadableStream` / `WritableStream` pair correctly pipes 5 bytes round-trip.

### T-H-05  Modem truth-table  (`test-hw/modem.test.ts`)

**Gate:** `FTDI_HW_MODEM=1` (in addition to `FTDI_HW_TEST=1`).  
**Hardware:** RTS→CTS and DTR→DSR jumpers wired on the loopback plug.

For each row `{ dtr, rts }` in `[ F/F, F/T, T/F, T/T ]`:

| Step | Expectation |
|------|-------------|
| `ftdi.setModemControl({ dtr, rts })` | No error |
| Wait 20 ms for line settling | — |
| `ftdi.getModemStatus()` | `status.dsr === dtr`, `status.cts === rts` |

**Pass criterion:** All 4 rows of the modem truth-table assert correctly.

---

## Pass criteria summary

| Check | Command | Required result |
|-------|---------|-----------------|
| Unit tests | `npm test` | 89/89 pass |
| HIL standard | `npm run test:hw` | 13/13 pass (modem tests skipped) |
| HIL with modem | `FTDI_HW_MODEM=1 npm run test:hw` | 14/14 pass |
| TypeScript | `npm run typecheck` | 0 errors |
| Lint | `npm run lint` | 0 errors |
