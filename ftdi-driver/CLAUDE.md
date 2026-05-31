# CLAUDE.md — ftdi-webusb-driver library

This file is Claude Code's project memory. Read it at the start of every session.

## Project goal

Build a **pure-TypeScript WebUSB driver** for the FTDI **FT-X family** chips
(primary target: **FT231XS**, VID `0x0403`, PID `0x6015`) that exposes a
clean serial-port-like API to browser applications.

The driver replaces the OS-level FTDI VCP driver. With WinUSB/libusb claiming
the device, this library reproduces the chip's serial functionality entirely
in JavaScript over WebUSB, so the same WinUSB binding can serve both JTAG
(via separate code) and UART access — no driver swapping in the lab.

A companion repo (`terminal-app`) builds an xterm.js-based browser
terminal on top of this library. This repo is **library-only**.

## Operating principles (non-negotiable)

1. **Test-First Development.** Every behavioural change starts with a failing
   test. No production code is written without a red test that demands it.
2. **Small commits.** One logical step per commit. Commit message format
   below. Push after each phase.
3. **No speculative API.** If a feature isn't covered by a test or a task in
   `PLAN.md`, don't add it.
4. **Verify against authoritative sources, not prior chat output.** The
   reference implementation is the Linux kernel `drivers/usb/serial/ftdi_sio.c`
   and `ftdi_sio.h`. Prior ChatGPT-generated code that lives in `docs/prior-art/`
   is for context only and contains documented bugs — see `docs/PRIOR-ART-BUGS.md`.
5. **Distinguish pure logic from I/O.** Baud divisor, line-properties encoding,
   modem-bitmask, status-byte stripping etc. are pure functions and get full
   unit-test coverage. WebUSB calls are isolated behind a thin interface so
   they can be mocked.
6. **Maintain the docs as code.** `PLAN.md`, the phase docs, `OPERATING-CLAUDE-CODE.md`,
   `PROTOCOL.md`, `BAUD-VECTORS.md`, `SETUP-SEQUENCE.md`, `TESTING.md`,
   `PRIOR-ART-BUGS.md`
   are not write-once artifacts. As work proceeds, keep them honest:
   - If a phase ends up doing something different from what the phase
     doc prescribed (different commit order, an extra step, a subtask
     that turned out to be unnecessary), update the phase doc in the
     same merge commit that lands the work.
     Commit message: `docs(plan): update Phase N to reflect actual flow`.
   - If a procedure in `docs/...md` needs adjustment because something
     doesn't match reality, update the doc as part of the fix. Don't
     leave docs that misrepresent the code.
   - If you discover something the planning docs don't cover at all and
     it's not a one-off, add a new section or new doc and reference it
     from `README.md`.
   - Major architectural divergence (e.g., "we ended up not needing a
     whole phase") gets its own explanatory commit *before* the work
     that embodies the divergence, so the rationale is in git history.
   Docs that go stale are worse than no docs. Treat them as code.

## Commit message convention

```
<type>(<scope>): <imperative subject ≤ 60 chars>

<body — what & why, not how, wrapped at 72 cols>

Refs: <issue/phase>
```

Types: `test`, `feat`, `fix`, `refactor`, `docs`, `chore`, `build`.
Scopes: `baud`, `line`, `flow`, `modem`, `reset`, `read`, `write`, `setup`,
`stream`, `usb-mock`, `device`, `proj`.

Examples:
- `test(baud): add ftdi_sio.c reference vectors`
- `feat(baud): implement 232BM-family divisor algorithm`
- `fix(read): strip 2-byte status header on every bulk-IN packet`
- `refactor(device): extract UsbTransport interface for mocking`

Each phase in `PLAN.md` should land as a sequence of commits (typically:
one `test(...)` red commit, one `feat(...)` green commit, optional
`refactor(...)`).

## Branching

- `main` is always green (all tests pass).
- Each phase from `PLAN.md` is a feature branch: `phase/NN-short-name`.
- Merge with `--no-ff` after the phase's acceptance criteria pass.
- Never force-push `main`.

## What to read, in order, when starting work

1. This file (`CLAUDE.md`)
2. `docs/OPERATING-CLAUDE-CODE.md` — Pro plan limits, Remote Control,
   token-conserving habits, VS Code Remote-SSH workflow. Read once at
   the start of any session; refer back when you see `/usage` getting tight.
3. `PLAN.md` — the phased plan
4. The phase document for the current phase, e.g. `docs/phases/PHASE-01-baud.md`
5. `docs/PROTOCOL.md` — FTDI USB protocol facts
6. `docs/BAUD-VECTORS.md` — known-good test vectors
7. `docs/TESTING.md` — testing strategy and mocking approach

## Stack

- **Language:** TypeScript (strict mode, `"strict": true`, no `any` without justification)
- **Build:** Vite library mode → ESM + types output
- **Test runner:** Vitest (jsdom environment for WebUSB type defs; node for pure-logic)
- **Lint:** ESLint with `@typescript-eslint`, `eslint-plugin-vitest`
- **Format:** Prettier (default config, 100-col line length)
- **Types:** `@types/w3c-web-usb` for `USBDevice`, `USBInTransferResult`, etc.

## Out of scope (for now)

- MPSSE / JTAG / bit-bang modes
- Multi-channel chips (FT2232x, FT4232x) — code should be *open* to future
  extension but only FT231XS is tested and supported in v0.1.
- EEPROM read/write
- Firefox / Safari (WebUSB unsupported there; Chromium-based only)

## Hardware required for integration tests

- An FT231XS-equipped board (the user's ULX3S board is the reference target).
- The board's UART TX should be observable, e.g. looped back to RX, or
  connected to an MCU that echoes input back (the user has an ESP32 hooked up).
- On Windows: WinUSB binding via Zadig. On Linux: udev rule allowing the user
  to claim the device, or running tests with `sudo`.

Hardware-in-loop tests run via `npm run test:hw` and are excluded from
`npm test` by default. See `docs/TESTING.md`.
