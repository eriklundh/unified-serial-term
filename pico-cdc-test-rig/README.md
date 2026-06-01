# pico-cdc-test-rig planning package

A TDD-style development plan for **pico-cdc-test-rig** — firmware for a
Raspberry Pi Pico that enumerates as a USB CDC-ACM device with
loopback behavior, used as the known-good Web Serial test target for
the `terminal-app` repo.

This is the **third** repo in the FTDI WebUSB project family:

| Repo | What it is | Tests which backend |
|------|-----------|---------------------|
| `ftdi-webusb-driver` | TypeScript WebUSB driver for FT-X chips | — (it *is* the driver) |
| `terminal-app` | Vue browser terminal, dual backend | both |
| **`pico-cdc-test-rig`** | **Pico CDC loopback firmware** | **Web Serial (the hardware target)** |

The FT231X dongle (TX↔RX loopback) is the hardware target for the
terminal-app's **WebUSB** backend; this Pico firmware is the hardware
target for its **Web Serial** backend. Together they let you smoke-test
both backends with real devices.

## Built with

- Raspberry Pi Pico C/C++ SDK **2.2.0** (pinned by git tag)
- TinyUSB (bundled with the SDK as a submodule) — CDC device class
- CMake + Ninja, ARM GCC cross-compiler
- Targets RP2040 (Pico) by default; RP2350 / W variants supported

## How to use this package with Claude Code

Clone an empty `pico-cdc-test-rig` repo (e.g. into `~/FPGA_work/`
alongside the other two), then copy these planning docs in:

```
CLAUDE.md                              →  CLAUDE.md
PLAN.md                                →  PLAN.md
docs/DEV-ENVIRONMENT.md                →  docs/DEV-ENVIRONMENT.md
docs/USB-CDC.md                        →  docs/USB-CDC.md
docs/FLASHING.md                       →  docs/FLASHING.md
docs/phases/PHASE-00-devenv.md         →  docs/phases/PHASE-00-devenv.md
docs/phases/PHASE-01-cdc-enumerate.md  →  docs/phases/PHASE-01-cdc-enumerate.md
docs/phases/PHASE-02-loopback.md       →  docs/phases/PHASE-02-loopback.md
docs/phases/PHASE-03-line-reporting.md →  docs/phases/PHASE-03-line-reporting.md
docs/phases/PHASE-04-host-harness.md   →  docs/phases/PHASE-04-host-harness.md
docs/phases/PHASE-05-release.md        →  docs/phases/PHASE-05-release.md
```

Also copy `OPERATING-CLAUDE-CODE.md` from the main planning package into
`docs/` — the Pro-plan limits, Remote Control, scheduling, and budget
guidance all apply here too.

Then in the repo:
> Read CLAUDE.md and docs/DEV-ENVIRONMENT.md, then start Phase 0 from
> docs/phases/PHASE-00-devenv.md.

## The build-vs-flash split

The key operational difference from the TypeScript repos: **building
firmware and flashing it are different jobs**.

- **Build** (`cmake` → `.uf2`): pure compilation. Claude Code on
  agentlab1 does this autonomously.
- **Flash** (UF2 / picotool / SWD) and **test** (open port, assert
  echo): need the Pico physically attached — a bench step on the Pi 5
  or your laptop.

So Claude Code can drive Phases 0–4's build and host-logic work; the
flash-and-verify checkpoints happen where the hardware is. CLAUDE.md and
DEV-ENVIRONMENT.md spell this out.

## TDD on firmware — what's honest

Firmware can't be purely unit-tested (you can't run `tud_cdc_write()` in
a host test). The plan applies test-first where the target allows:

- **Pure logic** — the RX→TX ring buffer (Phase 2) and the settings
  report formatter (Phase 3) — is host-compiled and unit-tested
  test-first, red-green-refactor, exactly like the TypeScript repos.
- **USB enumeration and echo** are validated by a **host-side harness**
  (Phase 4) written before the firmware behavior it checks. The harness
  failing is the "red"; the firmware passing it is the "green."

This keeps the project's TDD discipline honest rather than pretending
hardware behavior can be mocked away.

## Package layout

```
pico-cdc-test-rig-plan/
├── README.md                          ← this file
├── CLAUDE.md                          ← project memory
├── PLAN.md                            ← phased plan (0–5)
└── docs/
    ├── DEV-ENVIRONMENT.md             ← toolchain setup on Debian 13 / RPi OS Trixie
    ├── USB-CDC.md                     ← TinyUSB CDC device reference
    ├── FLASHING.md                    ← UF2 / picotool / SWD
    └── phases/
        ├── PHASE-00-devenv.md         ← toolchain + blink (validate the chain)
        ├── PHASE-01-cdc-enumerate.md  ← enumerate as CDC-ACM
        ├── PHASE-02-loopback.md       ← byte echo + ring buffer (TDD)
        ├── PHASE-03-line-reporting.md ← capture & report settings (TDD formatter)
        ├── PHASE-04-host-harness.md   ← pyserial verification harness
        └── PHASE-05-release.md        ← README, flashing, prebuilt UF2, tag
```

## Where it fits in the test topology

From the library's `PHASE-09-hw-tests.md` "Hardware test topology": the
two test devices map onto the two backends —

- **FT231X dongle → WebUSB** (validated via `ftdi-webusb-driver` Phase 9
  and terminal-app Phase 3 smoke)
- **This Pico → Web Serial** (validated via terminal-app Phase 2 smoke)

Flash a Pico from this rig's release UF2, plug it into the bench
machine, and the terminal-app's Web Serial backend has a real device to
talk to.
