# CLAUDE.md — unified-serial-term (repository root)

Orientation for Claude Code instances working in this repository. Read this
first, then the `CLAUDE.md` in whichever component subdirectory you're
working in.

## What this repo is

A browser-based serial terminal for FTDI devices plus the pure-TypeScript
WebUSB driver it runs on, and the hardware-in-loop test rigs that validate
them. Five components, as subdirectories:

| Directory | Component | Stack |
|---|---|---|
| `ftdi-driver/` | WebUSB FTDI driver (TDD, pure-function-heavy library) | TypeScript; npm `ftdi-webusb-driver` |
| `terminal-app/` | Vue 3 + Vite browser terminal | TypeScript; npm `unified-serial-console` |
| `hil-preflight/` | HIL preflight orchestrator (gates `test:hw`) | Python |
| `pico-cdc-test-rig/` | Raspberry Pi Pico CDC-loopback firmware + harness | C/C++ (Pico SDK) + Python |
| `ftdi-loopback-verify/` | FTDI loopback verification suite | Python (pyftdi) |

`terminal-app` depends on the driver via `file:../ftdi-driver` and
auto-builds it through a `prebuild` hook. The npm **package name** stays
`ftdi-webusb-driver` even though the directory is `ftdi-driver/` — don't
rename imports or the package; only directory paths changed in the
consolidation.

## Git origin

```
git@gitlab.compelcon.se:unified-serial-terminal/unified-serial-term.git
```

This is the current canonical remote, push-mirrored to the public
**github.com/eriklundh/unified-serial-term**. This is the **only** place the
internal GitLab URL is written down: all public-facing links (clone
instructions, Releases) point at GitHub, and internal-infra docs (runner
setup, CI) refer to the instance abstractly as `<gitlab-instance>` /
`<group>`. Per-component docs likewise use `<git origin>`, and deployment
infra is `<deploy-host>` / `<deploy-domain>` / `<deploy-user>`.

## How to work here

- **Scope a session to one component.** Each subdirectory has its own
  `CLAUDE.md`, `PLAN.md`, and conventions; `cd` into `ftdi-driver/` or
  `terminal-app/` and work there. See each component's
  `OPERATING-CLAUDE-CODE.md` for the autonomous-run / Remote Control /
  budget guidance.
- **Commit/push discipline** is defined per component — follow the
  subdirectory's `CLAUDE.md`. Push to `origin` after every commit.
- **HIL tests are in-repo.** `npm run test:hw` runs `../hil-preflight/preflight.sh`,
  which drives `pico-cdc-test-rig/` and `ftdi-loopback-verify/` — all sibling
  subdirectories, no external checkout.
- **Companion repo** (`ftdi-unbind`) is the one remaining separate repo,
  cloned as a sibling of this one; rebind docs reference it at
  `../../ftdi-unbind/...`.

## History

Consolidated from several former standalone repositories, full git history
preserved: `ftdi-driver/` ← **ftdi-webusb-driver**, `terminal-app/` ←
**terminal-app**, `hil-preflight/` ← **hil-preflight**, `pico-cdc-test-rig/`
← **pico-cdc-test-rig**, `ftdi-loopback-verify/` ← **ftdi-loopback-verify**.
Original `v0.1.0` releases are tagged per component (`ftdi-driver-v0.1.0`,
`terminal-app-v0.1.0`, `pico-cdc-test-rig-v0.1.0`). The originals are
retained as read-only archives.
