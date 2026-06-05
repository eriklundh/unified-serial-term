# CLAUDE.md — unified-serial-term (repository root)

Orientation for Claude Code instances working in this repository. Read this
first, then the `CLAUDE.md` in whichever component subdirectory you're
working in.

## What this repo is

A browser-based serial terminal for FTDI devices plus the pure-TypeScript
WebUSB driver it runs on. Two components, as subdirectories:

| Directory | Component | Package |
|---|---|---|
| `ftdi-driver/` | WebUSB FTDI driver (TDD, pure-function-heavy library) | npm `ftdi-webusb-driver` |
| `terminal-app/` | Vue 3 + Vite browser terminal | npm `web-serial-console` |

`terminal-app` depends on the driver via `file:../ftdi-driver` and
auto-builds it through a `prebuild` hook. The npm **package name** stays
`ftdi-webusb-driver` even though the directory is `ftdi-driver/` — don't
rename imports or the package; only directory paths changed in the
consolidation.

## Git origin

```
git@gitlab.compelcon.se:unified-serial-terminal/unified-serial-term.git
```

This is the current canonical remote. The repo is host-agnostic and may be
mirrored to GitHub or elsewhere; per-component docs refer to it abstractly
as `<git origin>`, and to deployment infra as `<deploy-host>` /
`<deploy-domain>` / `<deploy-user>`.

## How to work here

- **Scope a session to one component.** Each subdirectory has its own
  `CLAUDE.md`, `PLAN.md`, and conventions; `cd` into `ftdi-driver/` or
  `terminal-app/` and work there. See each component's
  `OPERATING-CLAUDE-CODE.md` for the autonomous-run / Remote Control /
  budget guidance.
- **Commit/push discipline** is defined per component — follow the
  subdirectory's `CLAUDE.md`. Push to `origin` after every commit.
- **Companion repos** (`hil-preflight`, `ftdi-unbind`) are separate repos
  cloned as siblings of this one; HW-test and rebind docs reference them at
  `../../<repo>`.

## History

Consolidated from two former standalone repositories, full git history
preserved: `ftdi-driver/` ← **ftdi-webusb-driver**, `terminal-app/` ←
**terminal-app**. Original `v0.1.0` releases are tagged per component
(`ftdi-driver-v0.1.0`, `terminal-app-v0.1.0`). The originals are retained
as read-only archives.
