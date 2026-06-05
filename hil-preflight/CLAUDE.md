# CLAUDE.md — hil-preflight

Claude Code's project memory for the `hil-preflight` component (a
subdirectory of the `unified-serial-term` repo). Read this at the start
of every session in this directory.

## What this component is

A Python preflight suite that verifies all USB hardware rigs are present
and working **before** hardware-in-loop (HIL) tests run in the sibling
components.

It orchestrates two independent verification suites in sequence:

| Step | Suite | Device | VID:PID | Library |
|------|-------|--------|---------|---------|
| 1/2 | `pico-cdc-test-rig/py-verify/` | Raspberry Pi Pico (CDC loopback) | 0x2E8A:0x000A | pyserial |
| 2/2 | `ftdi-loopback-verify/` | FT231X loopback plug | 0x0403:0x6015 | pyftdi |

The Pico validates the **Web Serial backend** (`navigator.serial`).
The FTDI plug validates the **WebUSB + FTDI backend** (`navigator.usb`).

Both sub-suites are independently runnable (they have their own `verify.sh` /
`run_tests.sh` and `.venv`). This repo is **only an orchestration layer** — it
calls the sub-suites, never duplicates their logic.

## Repository layout

This repo, `unified-serial-term`, contains these components as
subdirectories:

```
unified-serial-term/
├── hil-preflight/          ← this component (HIL preflight orchestrator)
├── pico-cdc-test-rig/      ← Pico CDC firmware + verification harness
├── ftdi-loopback-verify/   ← FTDI loopback verification (pyftdi)
├── ftdi-driver/            ← TypeScript WebUSB driver library
└── terminal-app/           ← Browser terminal app (Vue 3 + xterm.js)
```

`hil-preflight/` orchestrates the two verification suites in the sibling
`pico-cdc-test-rig/` and `ftdi-loopback-verify/` directories. The repo
origin is `<git origin>`.

## Why this exists

`ftdi-driver` and `terminal-app` run HIL tests against real USB devices.
Without a preflight gate, a missing or misbehaving device causes confusing
browser test failures rather than a clear hardware diagnosis.

The preflight exits non-zero the moment a device is absent or a check fails,
so the downstream test runner never starts against a broken hardware environment.

## Operating principles

These apply across all components — they are non-negotiable:

1. **Test-first, always.** Every behavioural change starts with a test that
   fails before the code exists. For this repo: a new sub-suite check is added
   as an assertion in `preflight.sh` or a new test file in the sub-repo before
   the firmware/wiring change that makes it pass.

2. **Small commits, pushed immediately.** One logical step per commit,
   following the convention below. Push to `origin` after **every
   commit** — do not batch. This project is worked on across multiple
   hardware environments (a dev VM, a Raspberry Pi test host, etc.); any
   unpushed commit is stranded on one machine and causes branch
   divergence when you switch. If the remote is temporarily unreachable,
   note it explicitly and push at the first opportunity. Never stop a
   session with unpushed commits.

3. **No speculative features.** Stick to `PLAN.md`. The preflight's job is to
   verify hardware presence and correctness, nothing more.

4. **Maintain docs as code.** `PLAN.md`, `README.md`, and this file are not
   write-once artifacts. If reality diverges (new device, changed path, renamed
   script), update the doc in the same commit as the fix.
   Commit: `docs: update <file> to match reality`.

5. **Standalone suites stay standalone.** Never add hil-preflight-specific logic
   to `py-verify/` or `ftdi-loopback-verify/`. The sub-suites must remain
   independently runnable for device-specific development work.

6. **Hard-fail on missing hardware, not skip.** Each sub-suite should have a
   `TestDevicePresent` (or equivalent) that calls `pytest.fail()` — not
   `pytest.skip()` — when the device is absent and no override is given. A
   silent skip hides broken hardware.

## Commit message convention

Same format as all sibling components:

```
<type>(<scope>): <imperative subject ≤ 60 chars>

<body — what & why, not how, wrapped at 72 cols>

Refs: <phase>
```

Types: `test`, `feat`, `fix`, `refactor`, `docs`, `chore`, `build`.
Scopes: `preflight`, `ftdi`, `pico`, `harness`, `ci`, `proj`.

Examples:
- `test(ftdi): add early-fail test for FTDI device presence`
- `feat(harness): gate test:hw behind hil-preflight`
- `docs: update PLAN.md to reflect actual Phase 2 flow`
- `chore(ci): add GitLab CI job for Pi 5 runner`

## Branching

Same as sibling components:
- `main` is always green.
- Feature work on `phase/NN-short-name` branches.
- Merge `--no-ff` after acceptance criteria pass.
- Never force-push `main`.

## Stack

- **Language:** Python 3 (target: 3.11+)
- **Test runner:** pytest ≥ 7.0
- **Hardware libraries:** pyserial ≥ 3.5 (Pico CDC), pyftdi ≥ 0.55 + pyusb ≥ 1.2 (FTDI)
- **Entry point:** `preflight.sh` (bootstraps `.venv`, then runs both sub-suites)
- **Deps:** `requirements.txt` (union of both sub-suites)

## Downstream integration

Both `ftdi-driver` and `terminal-app` call the preflight via npm
lifecycle hooks before their hardware test commands:

```json
"pretest:hw": "bash ../hil-preflight/preflight.sh",
"test:hw": "..."
```

npm runs `pretest:hw` automatically before `test:hw`. The `../hil-preflight`
path is correct because the components are sibling subdirectories of the
`unified-serial-term` repo.

## How to extend for a new rig

1. Create a verification repo for the new device (e.g. `new-device-verify/`).
2. Add a `test_0_device_present.py` to it that hard-fails when the device is absent.
3. Add a new section to `preflight.sh` invoking `pytest` on the new repo.
4. Update `requirements.txt` with any new library deps.
5. Update `PLAN.md` and this file to document the new rig.

## What to read, in order

1. This file (`CLAUDE.md`)
2. `PLAN.md` — phased plan and acceptance criteria
3. `README.md` — usage and downstream integration patterns
4. `pico-cdc-test-rig/CLAUDE.md` — CDC test rig conventions, TDD pattern
5. `ftdi-loopback-verify/README.md` — FTDI rig wiring and device binding
6. `ftdi-driver/CLAUDE.md` — library conventions, `test:hw` pattern
7. `terminal-app/CLAUDE.md` — app conventions, Playwright patterns

## Out of scope

- Device-specific test logic (lives in the sub-repos, not here)
- Running firmware builds (belongs in `pico-cdc-test-rig`)
- Browser automation (belongs in `terminal-app`)
- Acting as a CI runner itself (CI calls `preflight.sh` as a step)
