# CLAUDE.md — web-serial-console (the terminal app)

This file is Claude Code's project memory for the terminal-app repo.
Read it at the start of every session.

## What this repo is

A small, single-page browser terminal that connects to a serial device
through one of two interchangeable backends:

1. **Web Serial API** (`navigator.serial`) — for CDC devices and FTDI
   chips bound to the FTDI VCP driver.
2. **WebUSB + the `ftdi-webusb-driver` library** — for FTDI chips bound to
   WinUSB / libusb, so the same WinUSB binding can also serve JTAG /
   MPSSE in the same browser session without driver swapping.

The user picks the backend in the UI before connecting. Everything
downstream of the backend boundary — terminal rendering, settings
panel, history, copy/paste — works identically regardless of which
backend is active.

This is **not a fork.** The repo is built from scratch under TDD
discipline. [zaxbux/web-serial-console](https://github.com/zaxbux/web-serial-console)
is excellent reference material for the UI shape and connection state
machine — read it, learn from it, attribute it in the README — but
don't lift code from it. Every line in our repo gets written
test-first.

## Why both backends?

The two backends serve different scenarios:

| Backend           | When to use                                            | What the OS sees |
|-------------------|--------------------------------------------------------|------------------|
| **Web Serial**    | Standard CDC devices; FTDI chips bound to FTDI VCP     | A COM port       |
| **WebUSB + FTDI** | FTDI chips bound to WinUSB (JTAG / MPSSE share the device) | A raw USB device |

The classroom workflow this enables: bind WinUSB once with Zadig at the
start of term. After that, JTAG tools (which need WinUSB) and this
terminal (which uses the `ftdi-webusb-driver` backend, also WinUSB-based)
both work without ever swapping drivers. The Web Serial path stays for
non-FTDI boards or for students who haven't bound WinUSB yet.

## Relationship to the `ftdi-webusb-driver` library

This app depends on `ftdi-webusb-driver`. During development the dependency is
`file:../ftdi-webusb-driver` (or `npm link`). For production it's a fixed
version from a registry once published.

Both backends present the **same shape** to the rest of the app: a
`readable: ReadableStream<Uint8Array>`, a `writable: WritableStream<Uint8Array>`,
plus open/close and a settings hook. The Web Serial API natively
provides this shape; `ftdi-webusb-driver.FtdiUart` was deliberately designed
to match it. The backend abstraction (`src/backends/SerialBackend.ts`)
is a thin interface over both.

If the app needs new behaviour from the library — say a missing
control transfer or a chip-status query — that work belongs in the
library repo first. This app never reaches into FTDI internals.

## Operating principles (non-negotiable)

Same as the library repo:

1. **Test-First.** Every behavioural change starts with a failing
   test. Pure modules (backend abstraction, settings persistence,
   reconnect logic, encoding detection) get Vitest unit tests written
   before the implementation.
2. **Small commits.** One logical step per commit.
3. **No speculative features.** Stick to what's in `PLAN.md`.
4. **Reference reading is fine; copy-pasting is not.** Reading
   zaxbux/web-serial-console to understand how to wire xterm.js into a
   Vue 3 component is good engineering. Pasting their code into ours
   skips the test-first cycle and is not allowed.
5. **Maintain the docs as code.** `PLAN.md`, `docs/OPERATING-CLAUDE-CODE.md`,
   `docs/PLAYWRIGHT.md`, `docs/DEPLOYMENT.md`, `docs/LAB-SERVER-SETUP.md`
   are not write-once artifacts. As work proceeds, keep them honest:
   - If a phase ends up doing something different from what `PLAN.md`
     prescribed (different commit order, an extra step, a subtask
     that turned out to be unnecessary), update `PLAN.md` in the same
     merge commit that lands the work.
     Commit: `docs(plan): update Phase N to reflect actual flow`.
   - If a procedure in `docs/...md` (deployment, lab setup, Playwright
     patterns) needs adjustment because something doesn't work as
     documented, update the doc as part of the fix. Don't leave docs
     that misrepresent reality.
   - If you discover something the planning docs don't cover and it's
     not a one-off, add a new section or new doc and reference it from
     `README.md`.
   - Major architectural divergence gets its own explanatory commit
     *before* the work that embodies it, so the rationale is in git
     history.
   Docs that go stale are worse than no docs. Treat them as code.

## Environment assumptions

The lab VM where Claude Code runs:

- **Debian 13 (Trixie)**
- **External IP** `194.14.84.44` reachable as `serial-lab.test.delivery-academy.se`
  (wildcard DNS `*.test.delivery-academy.se` → `194.14.84.44`)
- **Privileged user** has `NOPASSWD: ALL` in `/etc/sudoers.d/`, so
  `sudo` runs non-interactively. Use sudo only where it's actually
  needed (web-server config, ufw, certbot, writes under `/var/www/`,
  installs from `apt`). Don't run normal development under sudo.
- **nginx + Let's Encrypt** already provisioned per
  `docs/LAB-SERVER-SETUP.md` before deployment phases run.

UI tests use Playwright. Testable logic lives in pure modules with
Vitest unit tests. The xterm.js + DOM glue is verified manually plus
by Playwright smoke tests.

## Commit message convention

Same format as the library repo:

```
<type>(<scope>): <imperative subject ≤ 60 chars>

<body — what & why, not how, wrapped at 72 cols>

Refs: <issue/phase>
```

Types: `test`, `feat`, `fix`, `refactor`, `docs`, `chore`, `build`, `style`.

Scopes: `backend`, `web-serial`, `webusb`, `ui`, `settings`, `reconnect`,
`terminal`, `proj`, `style`.

Examples:
- `feat(backend): define SerialBackend interface`
- `test(web-serial): cover WebSerialBackend open/close lifecycle`
- `feat(webusb): wire FtdiUart through SerialBackend`
- `test(settings): assert backend choice persists across reloads`

## Branching

- `main` is always green (all tests pass; app builds).
- Each phase from `PLAN.md` is a feature branch: `phase/NN-short-name`.
- Merge with `--no-ff` after the phase's acceptance criteria pass.
- Never force-push `main`.

## Stack

- **Framework:** Vue 3 with Composition API and `<script setup>`
- **Build:** Vite (app mode, not lib mode)
- **Language:** TypeScript strict (`"strict": true`, `"noUncheckedIndexedAccess": true`)
- **Terminal renderer:** `@xterm/xterm` v5 with `@xterm/addon-fit` and
  `@xterm/addon-web-links`
- **Test:** Vitest (unit + jsdom for component tests), Playwright (E2E smoke)
- **Style:** Plain CSS + custom properties (no Tailwind etc.; small app
  and the user values a small dep tree)

Don't add a state-management library (Pinia, etc.) unless the state
graph genuinely demands it. Vue's `ref`, `computed`, and
`provide`/`inject` are enough for an app this size.

## What to read, in order

1. This file (`CLAUDE.md`)
2. `docs/OPERATING-CLAUDE-CODE.md` — Pro plan limits, Remote Control,
   token-conserving habits, VS Code Remote-SSH workflow. Read once at
   the start of any session.
3. `PLAN.md` — the phased plan
4. The sibling `ftdi-webusb-driver` repo's `CLAUDE.md` for shared conventions
   and the library's API
5. zaxbux/web-serial-console — as **reference reading** before Phase 0,
   to see how they structured the Vue components and the connection
   state machine

## Out of scope (for v0.1)

- Multi-tab simultaneous serial sessions (one device at a time)
- Recording / scripting (use the dev tools console for that)
- File transfer protocols (xmodem, ymodem, kermit)
- Mobile-first layout (the lab uses laptops)
- Authentication / sharing terminals between users
- A "favourite devices" registry (auto-reconnect to the *last* device is enough)
- Firefox / Safari (WebUSB and Web Serial are both Chromium-only at time of writing)
