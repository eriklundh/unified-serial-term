# Developer guide — unified-serial-term

Everything you need to build, test, and contribute to this project.
For end-user documentation see [README.md](README.md).

## Repository layout

| Directory | What it is | Notes |
|---|---|---|
| [`ftdi-driver/`](ftdi-driver/) | Pure-TypeScript WebUSB driver for FTDI FT-X chips | Published as the npm package **`ftdi-webusb-driver`**. |
| [`terminal-app/`](terminal-app/) | Vue 3 + Vite browser terminal (xterm.js) | Published as **`unified-serial-console`**. Depends on the driver. |
| [`hil-preflight/`](hil-preflight/) | Hardware-in-loop preflight orchestrator (Python) | Gates `npm run test:hw`. |
| [`pico-cdc-test-rig/`](pico-cdc-test-rig/) | Raspberry Pi Pico CDC-loopback firmware + harness | Validates the Web Serial backend. |
| [`ftdi-loopback-verify/`](ftdi-loopback-verify/) | FTDI loopback pytest suite (pyftdi) | Validates the WebUSB + FTDI backend. |

Each subdirectory is self-contained, with its own `README.md`, `CLAUDE.md`,
`PLAN.md`, and tests. Start there for component-specific detail.

**The terminal app depends on the driver.** `terminal-app` consumes the
driver as a local dependency (`"ftdi-webusb-driver": "file:../ftdi-driver"`)
and its `prebuild`/`predev` hook auto-builds `ftdi-driver/` on demand — a
fresh checkout Just Works.

## Quick start

```sh
git clone https://github.com/eriklundh/unified-serial-term.git
cd unified-serial-term

# Build the driver, then run the app dev server
cd ftdi-driver  && npm ci && npm run build && cd ..
cd terminal-app && npm ci && npm run dev
```

Open the dev URL in Chromium. Web Serial and WebUSB are Chromium-only.

## Running tests

```sh
# Unit + component tests
cd terminal-app && npm test

# Playwright e2e (mock backends — no hardware needed)
cd terminal-app && npm run test:e2e

# Hardware-in-loop (requires Pico CDC rig + FTDI loopback plug)
cd terminal-app && npm run test:hw
```

## Companion repo

Some driver-rebind steps in the docs reference the **ftdi-unbind** repo,
which is not part of this monorepo. Clone it alongside so the documented
relative paths (`../../ftdi-unbind/...`) resolve:

```
<parent>/
├── unified-serial-term/   ← this repo
└── ftdi-unbind/           ← FTDI bind/unbind tooling
```

## Git origin

```
https://github.com/eriklundh/unified-serial-term.git
```

The public repository lives on GitHub
(**github.com/eriklundh/unified-serial-term**). The project is
host-agnostic; the internal canonical remote is documented in the root
`CLAUDE.md`.
Throughout the per-component docs the remote is referred to as
`<git origin>` and deployment infra as `<deploy-host>` / `<deploy-domain>`.

## Deployment

The production app is served from
[unified-serial.delivery-academy.se](https://unified-serial.delivery-academy.se).
See [`terminal-app/docs/DEPLOYMENT.md`](terminal-app/docs/DEPLOYMENT.md)
for the build-and-publish procedure.

## AI-assisted development

This project uses **Claude Code** (Anthropic). See
[`terminal-app/docs/OPERATING-CLAUDE-CODE.md`](terminal-app/docs/OPERATING-CLAUDE-CODE.md)
and the `CLAUDE.md` files in each subdirectory for conventions, phase plan,
and session guidance.

## Prior art and acknowledgements

### zaxbux/web-serial-console

[Zach Schneider](https://github.com/zaxbux) (github.com/zaxbux) built
[web-serial-console](https://github.com/zaxbux/web-serial-console), an
excellent browser serial terminal and the primary prior art for this
project. We read it carefully — UI shape, connection state machine,
terminal behaviours such as the bell — and we gladly recognise the work
behind it.

What we built is deliberately distinct: a **full bottom-up, test-first
re-implementation** of a similar feature set — every line written fresh
under TDD (300+ unit tests, Playwright e2e, and hardware-in-loop rigs in
`hil-preflight/`, `pico-cdc-test-rig/`, and `ftdi-loopback-verify/`),
MIT-licensed. No code was copied or ported; web-serial-console was treated
as reference reading, never as a porting source. The focus also differs:
where web-serial-console drives the Web Serial API (an OS serial driver in
the loop), this project is about making an xterm.js-based web terminal
work well over **WebUSB, talking to FTDI devices with no OS serial driver
in between** — typically an FPGA board whose FTDI chip is bound to
WinUSB/libusb for JTAG programming.

### xterm.js

Terminal rendering is [xterm.js](https://xtermjs.org/), the de-facto
standard terminal for the web. Other well-known users include the
**VS Code** integrated terminal, **JupyterLab**, **Eclipse Theia**,
the **Hyper** terminal, **Azure Cloud Shell** and **Google Cloud Shell**,
and the **ttyd** and **Wetty** web-TTY projects — good company, and a deep
well of reference behaviour for terminal UX.

## History

This repository consolidates several formerly standalone projects, with
their full git history preserved:

| Directory | Former repository |
|---|---|
| `ftdi-driver/` | **ftdi-webusb-driver** |
| `terminal-app/` | **terminal-app** |
| `hil-preflight/` | **hil-preflight** |
| `pico-cdc-test-rig/` | **pico-cdc-test-rig** |
| `ftdi-loopback-verify/` | **ftdi-loopback-verify** |

Original `v0.1.0` releases are preserved as per-component tags:
`ftdi-driver-v0.1.0`, `terminal-app-v0.1.0`, `pico-cdc-test-rig-v0.1.0`.
