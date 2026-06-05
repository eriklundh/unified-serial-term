# PLAN.md — ftdi-webusb-driver library

A phased, test-first plan. Each phase is a feature branch. Within a phase,
work in red → green → refactor cycles, committing at each transition.

Acceptance criteria for "phase complete":
1. All tests in the phase pass on `npm test`.
2. `npm run typecheck` is clean.
3. `npm run lint` is clean.
4. Phase document has been updated with any deviations or learnings.
5. Branch is merged into `main` with `--no-ff`.

---

## Phase 0 — Project bootstrap

Branch: `phase/00-bootstrap`

**Goal:** A buildable, testable, lintable empty TypeScript library project.

Steps:
1. `npm init -y` → edit `package.json` (name `ftdi-webusb-driver`, type `module`,
   exports field, license MIT).
2. Add devDeps: `typescript`, `vitest`, `@types/w3c-web-usb`,
   `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`,
   `eslint`, `prettier`, `vite`.
3. Add `tsconfig.json` (strict, target ES2022, moduleResolution bundler,
   declaration true, outDir dist).
4. Add `vite.config.ts` (library mode, entry `src/index.ts`).
5. Add `vitest.config.ts` (environment `node` by default, separate
   `test:browser` script with `jsdom` for any DOM-touching code).
6. Add `.eslintrc.cjs`, `.prettierrc`, `.gitignore`, `.editorconfig`.
7. Add `src/index.ts` with a single `export const VERSION = "0.0.1";`.
8. Add a smoke test `src/index.test.ts` that asserts `VERSION` exists.
9. Add npm scripts: `test`, `test:watch`, `typecheck`, `lint`, `build`,
   `format`.
10. Verify all scripts work locally. **Commit. Push.**

Commits expected:
- `chore(proj): scaffold package.json and tooling configs`
- `test(proj): add smoke test for package entry`
- `feat(proj): export VERSION constant`

---

## Phase 1 — Baud divisor calculator

Branch: `phase/01-baud-divisor`

**Goal:** A pure function `baudToDivisor(baud) → { wValue, wIndex }` that
matches the canonical `ftdi_sio.c` algorithm exactly.

This is the foundational TDD phase. The prior chat code in `docs/prior-art/`
got this wrong in two different ways. We get it right by writing tests
against authoritative reference vectors first.

See `docs/phases/PHASE-01-baud.md` for the full step-by-step.

Acceptance:
- `baudToDivisor(115200)` returns `{ wValue: 0x001A, wIndex: 0x0000 }`
- All vectors in `docs/BAUD-VECTORS.md` pass.
- Special cases (3 Mbaud → divisor `0x0000`, 2 Mbaud → divisor `0x0001`) pass.
- Out-of-range bauds throw a typed error (`RangeError` with descriptive message).

Commits expected:
- `test(baud): add ftdi_sio.c reference vectors as failing tests`
- `feat(baud): implement 232BM-family divisor algorithm`
- `test(baud): cover special cases (2 Mbaud, 3 Mbaud)`
- `feat(baud): handle special-case divisor remapping`
- `test(baud): cover out-of-range input`
- `feat(baud): throw RangeError for unreachable bauds`
- `refactor(baud): extract divfrac lookup as named constant`

---

## Phase 2 — Line-properties encoder

Branch: `phase/02-line-properties`

**Goal:** A pure function `encodeLineProperties({ dataBits, parity, stopBits, breakOn? }) → number`
that produces the correct `wValue` for `SIO_SET_DATA` (request `0x04`).

Per `ftdi_sio.h`:
- bits [7:0]: data bits literal (5, 6, 7, 8)
- bits [10:8]: parity (0=N, 1=O, 2=E, 3=M, 4=S)
- bits [13:11]: stop bits (0=1, 1=1.5, 2=2)
- bit  [14]: break

See `docs/phases/PHASE-02-line-properties.md`.

Acceptance:
- `encodeLineProperties({ dataBits: 8, parity: 'none', stopBits: 1 })` → `0x0008`
- `encodeLineProperties({ dataBits: 7, parity: 'even', stopBits: 1 })` → `0x0207`
  (this matches what the previous USB capture actually showed — the previous
  chat misread it as "8N1 with 0x07 = 8 data bits")
- `encodeLineProperties({ dataBits: 8, parity: 'odd', stopBits: 2 })` → `0x1108`
- Invalid combinations (data bits 4, parity 'foo') throw `RangeError`.

Commits expected:
- `test(line): add encoder test vectors covering 8N1/7E1/8O2/8N1+break`
- `feat(line): implement encodeLineProperties`
- `test(line): cover invalid data-bit and parity inputs`
- `feat(line): validate inputs and throw RangeError`

---

## Phase 3 — Modem-control and flow-control encoders

Branch: `phase/03-modem-flow`

**Goal:** Two pure functions:

```
encodeModemControl({ dtr, rts }) → { wValue: number }      // for request 0x01
encodeFlowControl(mode, { xon?, xoff? }) → { wValue, data } // for request 0x02
```

Per `ftdi_sio.h`:

Modem (request `0x01`):
- bit 0 = DTR state, bit 8 = DTR change-mask
- bit 1 = RTS state, bit 9 = RTS change-mask
- "Set DTR high" = `0x0101`, "Set DTR low" = `0x0100`
- "Set RTS high" = `0x0202`, "Set RTS low" = `0x0200`

Flow control (request `0x02`):
- wValue high byte: flow control type bits
  - `0x00` disable
  - `0x01` RTS/CTS
  - `0x02` DTR/DSR
  - `0x04` XON/XOFF
- wValue low byte: XON char (when XON/XOFF mode); else 0
- wIndex low byte: XOFF char (when XON/XOFF mode); else 0

See `docs/phases/PHASE-03-modem-flow.md`.

Commits expected:
- `test(modem): cover DTR/RTS state and change-mask encoding`
- `feat(modem): implement encodeModemControl`
- `test(flow): cover none/rtscts/dtrdsr/xonxoff encoding`
- `feat(flow): implement encodeFlowControl with XON/XOFF chars`

---

## Phase 4 — Bulk-IN status header stripping

Branch: `phase/04-status-strip`

**Goal:** A pure function `stripStatus(packet: Uint8Array) → { modemStatus, lineStatus, payload }`
that handles the FTDI quirk: **every** bulk-IN packet from the chip starts
with two status bytes (modem status, line status). When idle, the chip
still sends 64-byte packets containing only the two status bytes and 62
bytes of nothing.

Per `ftdi_sio.h`:

Modem status (byte 0):
- bit 4: CTS
- bit 5: DSR
- bit 6: RI
- bit 7: RLSD/DCD

Line status (byte 1):
- bit 1: overrun error
- bit 2: parity error
- bit 3: framing error
- bit 4: break interrupt
- bit 5: transmit holding register empty
- bit 6: transmit empty
- bit 7: FIFO error

Acceptance:
- `stripStatus(new Uint8Array([0x01, 0x60, ...]))` returns
  `{ modemStatus: 0x01, lineStatus: 0x60, payload: Uint8Array(...) }`
- Packets shorter than 2 bytes throw a `RangeError`.
- Idle packets (only 2 bytes) return `payload` of length 0.

See `docs/phases/PHASE-04-status-strip.md`.

Commits expected:
- `test(read): cover status header stripping for full/idle/short packets`
- `feat(read): implement stripStatus with typed status flags`
- `refactor(read): expose ModemStatusFlags and LineStatusFlags as enums`

---

## Phase 5 — UsbTransport interface and mock

Branch: `phase/05-usb-mock`

**Goal:** Define a minimal `UsbTransport` interface that abstracts the
WebUSB calls our driver needs. Build a `MockUsbTransport` for tests that:
- Records every `controlTransferOut` call with full setup parameters
- Returns pre-programmed responses for `controlTransferIn`
- Enqueues outgoing bulk data to a buffer (accessible to tests)
- Lets tests inject incoming bulk data that gets returned by `transferIn`

Real WebUSB backing: a thin `WebUsbTransport` class that wraps an actual
`USBDevice` and implements `UsbTransport` by forwarding to the standard methods.

Interface sketch:
```ts
interface UsbTransport {
  controlTransferOut(setup: USBControlTransferParameters, data?: BufferSource):
    Promise<USBOutTransferResult>;
  controlTransferIn(setup: USBControlTransferParameters, length: number):
    Promise<USBInTransferResult>;
  transferOut(endpoint: number, data: BufferSource):
    Promise<USBOutTransferResult>;
  transferIn(endpoint: number, length: number):
    Promise<USBInTransferResult>;
  open(): Promise<void>;
  close(): Promise<void>;
  claimInterface(n: number): Promise<void>;
  releaseInterface(n: number): Promise<void>;
  selectConfiguration(n: number): Promise<void>;
}
```

See `docs/phases/PHASE-05-usb-mock.md`.

Commits expected:
- `test(usb-mock): assert MockUsbTransport records control calls`
- `feat(usb-mock): implement MockUsbTransport with call recorder`
- `test(usb-mock): assert mock can enqueue bulk-IN data for read tests`
- `feat(usb-mock): support enqueueing bulk-IN responses`
- `feat(device): implement WebUsbTransport adapter for real USBDevice`

---

## Phase 6 — FtdiUart class: open, configure, close

Branch: `phase/06-ftdi-uart-setup`

**Goal:** The main driver class. Takes a `UsbTransport`. Reproduces the
exact setup sequence verified in `docs/SETUP-SEQUENCE.md`.

API:
```ts
class FtdiUart {
  constructor(transport: UsbTransport, opts?: { interface?: number });

  static async open(device: USBDevice, opts?: ...): Promise<FtdiUart>;
  // Convenience: builds a WebUsbTransport, opens it, returns the driver.

  async configure(opts: SerialOptions): Promise<void>;
  // SerialOptions: { baud, dataBits?, parity?, stopBits?, flowControl?,
  //                  dtr?, rts?, latencyMs? }

  async close(): Promise<void>;

  // Endpoint accessors (read-only)
  readonly bulkInEndpoint: number;   // 1 for FT231XS
  readonly bulkOutEndpoint: number;  // 2 for FT231XS
  readonly maxPacketSize: number;    // 64 for FT231XS
}
```

The full setup sequence per the corrected USB capture analysis:

1. `SIO_RESET` (req `0x00`, value `0x0000`) — reset both buffers + chip state
2. `SIO_SET_DATA` (req `0x04`, value encoded from line props)
3. `SIO_MODEM_CTRL` (req `0x01`, value `0x0101`) — DTR high
4. `SIO_MODEM_CTRL` (req `0x01`, value `0x0202`) — RTS high
5. `SIO_SET_FLOW_CTRL` (req `0x02`, value/index from flow opts)
6. `SIO_SET_BAUD_RATE` (req `0x03`, value/index from divisor)
7. `SIO_SET_LATENCY_TIMER` (req `0x09`, value = latencyMs default 16)
8. `SIO_GET_MODEM_STATUS` (req `0x05`, IN, length 2) — sanity check

Tests use `MockUsbTransport` and assert the **exact** sequence of control
calls in the **exact** order, with the **exact** parameter values.

See `docs/phases/PHASE-06-ftdi-uart-setup.md`.

Commits expected:
- `test(setup): assert FtdiUart.configure issues full sequence in order`
- `feat(setup): implement FtdiUart.configure with verified sequence`
- `test(setup): assert close releases interface and closes transport`
- `feat(setup): implement FtdiUart.close`
- `test(setup): assert FtdiUart.open builds WebUsbTransport correctly`
- `feat(setup): implement static FtdiUart.open factory`

---

## Phase 7 — Read and write paths with buffering

Branch: `phase/07-read-write`

**Goal:** `write(data)` and `read(maxBytes?)` methods.

- `write(data: BufferSource)`: splits into ≤ `maxPacketSize` (64-byte)
  chunks and dispatches via `transferOut`. Awaits each chunk.
- `read(maxBytes = 64)`: single `transferIn`, strips status header, returns payload.
- All async, all typed.

Edge cases covered by tests:
- Empty write → no transfer.
- Write of exactly 64 bytes → one transfer, no second zero-length packet.
- Write of 65 bytes → two transfers (64 + 1).
- Write of 256 bytes → four transfers of 64.
- Read returning only status bytes (idle device) → empty Uint8Array.
- Read with a real payload of 10 bytes → 10-byte Uint8Array.

See `docs/phases/PHASE-07-read-write.md`.

Commits expected:
- `test(write): cover empty/sub-packet/multi-packet chunking`
- `feat(write): implement write with 64-byte chunking`
- `test(read): cover idle and payload-carrying responses`
- `feat(read): implement read with status stripping`

---

## Phase 8 — Stream API

Branch: `phase/08-streams`

**Goal:** Expose `readable: ReadableStream<Uint8Array>` and
`writable: WritableStream<Uint8Array>` on `FtdiUart` so consumers can pipe.
This makes the library trivially interoperable with xterm.js's data hooks
and with `pipeTo()` for logging.

The readable stream loops `transferIn` until the stream is cancelled; on
cancel/close, it stops cleanly and releases the underlying transfer
(important: WebUSB will hang if a transfer is in flight on close).

See `docs/phases/PHASE-08-streams.md`.

Commits expected:
- `test(stream): assert readable stream surfaces stripped payload chunks`
- `feat(stream): implement readable as bulk-IN loop`
- `test(stream): assert writable accepts chunked Uint8Array writes`
- `feat(stream): implement writable that delegates to write()`
- `test(stream): assert cancel() stops the read loop without hanging`
- `feat(stream): wire cancel/close lifecycle correctly`

---

## Phase 9 — Hardware-in-loop integration tests

Branch: `phase/09-hw-tests`

**Goal:** A `test:hw` script that runs against a real FT231XS. Skipped by
default; requires `FTDI_HW_TEST=1` env var.

Scenarios:
1. Open device, configure 115200 8N1, write `"PING\n"`, read echo from
   loopback or attached MCU, assert it matches.
2. Configure latency timer to 1 ms, write 1000 bytes, time the round trip,
   assert it's under a sane threshold (sanity, not a perf test).
3. Cycle baud rates (9600 → 115200 → 921600), write at each, assert no
   error responses on `controlTransferOut`.

Because this requires real hardware, these tests live in `test-hw/` and
are excluded from the default Vitest glob. The user runs them locally
with the board plugged in.

See `docs/phases/PHASE-09-hw-tests.md`.

Commits expected:
- `test(hw): add loopback PING/echo test`
- `test(hw): add baud-cycle test`
- `docs(hw): document hardware test setup`

---

## Phase 10 — Documentation, examples, release prep

Branch: `phase/10-release`

**Goal:** Public-facing docs and an example.

- README.md with quick-start, install instructions, and an example.
- API.md generated from TSDoc comments (use `typedoc`).
- An `examples/minimal.html` that opens a device and prints incoming
  bytes to the dev console. This is a sanity smoke-test, not the full
  terminal app (that lives in the sibling `terminal-app/` directory).
- CHANGELOG.md.
- Version bump to `0.1.0`. Tag `v0.1.0`. Push tag.

Commits expected:
- `docs: write README with quick-start`
- `docs: add API.md generated from TSDoc`
- `feat: add examples/minimal.html`
- `chore: bump version to 0.1.0`
- `chore: tag v0.1.0`
