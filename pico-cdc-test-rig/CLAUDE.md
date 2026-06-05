# CLAUDE.md — pico-cdc-test-rig

This file is Claude Code's project memory for the pico-cdc-test-rig
repo. Read it at the start of every session.

## What this component is

Firmware for a **Raspberry Pi Pico** that makes it enumerate as a
**USB CDC-ACM device** with deterministic loopback behavior. It is the
known-good CDC test device for the **terminal-app's Web Serial
backend** — the counterpart to the FT231X dongle that tests the WebUSB
backend.

When the host opens the Pico's serial port and sends bytes, the Pico
echoes them back. It also captures the line coding (baud, data bits,
parity, stop bits) and line state (DTR/RTS) the host sets, and can
report them back on request — which lets the terminal-app's Web Serial
backend tests assert that connection settings were passed through
correctly.

Built with the **Raspberry Pi Pico C/C++ SDK 2.2.0** and **TinyUSB**
(bundled with the SDK as a submodule).

## Why this exists

The sibling `terminal-app` component has two serial backends — Web Serial
and WebUSB+FTDI. Hardware-validating them needs two real devices:

| Device | Backend it validates |
|--------|----------------------|
| FT231X dongle (TX↔RX loopback) | WebUSB + `ftdi-driver` |
| **This Pico firmware** (CDC loopback) | **Web Serial (`navigator.serial`)** |

A CDC-ACM device is bound by the OS's standard USB-serial driver and
surfaces as a normal COM port / `/dev/ttyACM*`, which is exactly what
the Web Serial API talks to. So this rig proves terminal-app Phase 2
(Web Serial backend) against real hardware.

## Operating principles

1. **Test-Driven Development (TDD), as far as the target allows.** This
   repo follows the same TDD discipline as its sibling components
   (`ftdi-driver`, `terminal-app`): every behavioural change
   starts with a failing test, then the minimum code to pass it, then
   refactor — red, green, refactor — committed at each transition
   (`test(...)` red commit, `feat(...)` green commit, optional
   `refactor(...)`).

   Firmware imposes one honest limit: you can't run `tud_cdc_write()` or
   USB enumeration in a host unit test. So TDD applies in two layers:
   - **Pure logic → classic host-side TDD.** The RX→TX ring buffer
     (Phase 2) and the settings report formatter (Phase 3) are compiled
     and unit-tested on the host, test-first, red-green-refactor —
     identical to how the TypeScript repos work. These are where the
     bugs hide (off-by-one wrap-around, enum mapping), so they get full
     coverage.
   - **USB / hardware behavior → test-first via a host harness.** The
     pyserial harness (Phase 4) is written *before* the firmware
     behavior it checks: the assertion that "PING round-trips" or
     "the sentinel returns the right settings" is the **red**; the
     firmware passing it is the **green**. The harness assertions are
     authored as each behavior is built, not retrofitted afterward.

   What we do **not** do is write firmware code first and test later.
   Even the on-target behavior is gated by a host-harness assertion
   written ahead of it. See `docs/phases/` — every phase doc leads with
   the test.

2. **Small commits, pushed immediately.** One logical step per commit,
   same convention as the sibling components. Push to `origin` after
   **every commit** — do not batch. This project is worked on across
   multiple hardware environments (a dev VM, a Raspberry Pi test host, etc.);
   any unpushed commit is stranded on one machine and causes branch
   divergence when you switch. If the remote is temporarily unreachable,
   note it explicitly and push at the first opportunity. Never stop a
   session with unpushed commits.
3. **No speculative features.** Stick to `PLAN.md`. The rig's job is
   loopback + settings reporting, nothing more.
4. **Maintain the docs as code.** `PLAN.md`, `docs/DEV-ENVIRONMENT.md`,
   `docs/USB-CDC.md`, `docs/FLASHING.md`, the phase docs are not
   write-once. If reality diverges (a different SDK quirk, a Trixie
   package rename, a flashing gotcha), update the doc in the same
   commit as the fix. Commit: `docs: update <doc> to match reality`.

## The build-vs-flash split (important)

Building firmware and flashing it are different jobs with different
location requirements — the same pattern as the browser-local
constraint in the sibling components:

| Job | Needs the Pico physically attached? | Where |
|-----|-------------------------------------|-------|
| **Build** (`cmake` → `.uf2`) | No — pure compilation | Claude Code on <build-host> can do this autonomously |
| **Flash** (UF2 / picotool / SWD) | Yes | A machine with the Pico attached (Pi 5, or your laptop) |
| **Test** (open port, assert echo) | Yes, and running | Same machine the Pico is attached to |

So Claude Code on <build-host> owns the build — it produces a `.uf2`
artifact and can iterate on compilation, CMake config, and host-side
pure-logic tests. Flashing and the hardware-in-loop test are a human
step (or run on the Pi 5 where the Pico lives). Don't expect Claude
Code on a headless VM to flash a Pico it can't see.

## Commit message convention

Same format as the sibling components:

```
<type>(<scope>): <imperative subject ≤ 60 chars>

<body — what & why, not how, wrapped at 72 cols>

Refs: <phase>
```

Types: `test`, `feat`, `fix`, `refactor`, `docs`, `chore`, `build`.
Scopes: `usb`, `cdc`, `loopback`, `report`, `linecoding`, `harness`,
`cmake`, `proj`, `flash`.

Examples:
- `chore(cmake): scaffold project against pico-sdk 2.2.0`
- `feat(usb): enumerate as CDC-ACM device`
- `feat(loopback): echo received bytes back to host`
- `test(harness): assert PING round-trips through the device`
- `feat(report): reply with current line coding on sentinel byte`

## Branching

- `main` is always green (builds clean; host-logic tests pass).
- Each phase is a feature branch: `phase/NN-short-name`.
- Merge `--no-ff` after the phase's acceptance criteria pass.
- Never force-push `main`.

## Stack

- **MCU:** RP2040 (original Pico). `PICO_BOARD=pico` default. The
  firmware is board-agnostic — `pico2` (RP2350), `pico_w`, `pico2_w`
  all work; override `PICO_BOARD` at configure time.
- **SDK:** Raspberry Pi Pico C/C++ SDK 2.2.0, pinned via git tag.
- **USB stack:** TinyUSB (SDK submodule). CDC device class.
- **Build:** CMake ≥ 3.13 + Ninja (or Make). ARM GCC cross-compiler.
- **Flash:** UF2 drag-drop via BOOTSEL (default); picotool or SWD for
  faster iteration (see `docs/FLASHING.md`).
- **Host harness:** Python 3 + pyserial (simplest, no browser needed)
  for the firmware's own tests. The terminal-app's Web Serial smoke
  uses this same firmware but tests through a browser.

## What to read, in order

1. This file (`CLAUDE.md`)
2. `docs/OPERATING-CLAUDE-CODE.md` if present (copied from the main
   planning package — Pro plan limits, Remote Control, scheduling,
   budget; all of it applies here too)
3. `PLAN.md` — the phased plan
4. `docs/DEV-ENVIRONMENT.md` — toolchain setup, before Phase 0
5. `docs/USB-CDC.md` — TinyUSB CDC reference, before Phase 1
6. `docs/FLASHING.md` — when you need to put firmware on a device

## Relationship to the other repos

This rig is standalone — it has no code dependency on
`ftdi-driver` or `terminal-app`. It produces a `.uf2` you flash
onto a Pico, and a host harness that proves the Pico behaves. The
terminal-app consumes it only at test time: a flashed Pico plugged into
the test machine is the Web Serial backend's hardware target.

## Out of scope (for v0.1)

- Acting as a real USB-to-UART bridge (it's a loopback rig, not a
  passthrough adapter)
- Multiple CDC interfaces / composite devices
- Configurable baud-rate-dependent timing simulation
- Pico W wireless features
- MicroPython / CircuitPython (this is a C-SDK project by design — the
  user wants the C-SDK specifically)
