# unified-serial-term

A browser-based serial terminal for FTDI devices, together with the
pure-TypeScript WebUSB driver it runs on. Connect to a serial device from
Chromium with no native driver install: either via the **Web Serial API**
(for devices on the OS serial/VCP driver) or via **WebUSB** against an FTDI
chip bound to WinUSB/libusb — so the same WinUSB binding can serve JTAG and
UART in one browser session without driver swapping.

## Layout

This repository contains five components as subdirectories:

| Directory | What it is | Notes |
|---|---|---|
| [`ftdi-driver/`](ftdi-driver/) | Pure-TypeScript WebUSB driver for FTDI FT-X chips | Published as the npm package **`ftdi-webusb-driver`** (the package name is kept even though the directory is `ftdi-driver/`). |
| [`terminal-app/`](terminal-app/) | Vue 3 + Vite browser terminal (xterm.js) | Published as **`unified-serial-console`**. Depends on the driver. |
| [`hil-preflight/`](hil-preflight/) | Hardware-in-loop preflight orchestrator (Python) | Gates `npm run test:hw`; runs the two verification suites below and fails fast on missing hardware. |
| [`pico-cdc-test-rig/`](pico-cdc-test-rig/) | Raspberry Pi Pico CDC-loopback firmware + harness | Known-good device for validating the **Web Serial** backend. |
| [`ftdi-loopback-verify/`](ftdi-loopback-verify/) | FTDI loopback pytest suite (pyftdi) | Validates the **WebUSB + FTDI** backend. |

**The terminal app depends on the driver.** `terminal-app` consumes the
driver as a local dependency, `"ftdi-webusb-driver": "file:../ftdi-driver"`,
and its `prebuild`/`predev` hook auto-builds `ftdi-driver/` on demand when
its `dist/` is missing or stale — a fresh checkout Just Works.

**The HIL test chain lives here too.** `npm run test:hw` in `ftdi-driver/`
and `terminal-app/` runs `../hil-preflight/preflight.sh` first, which in turn
exercises `pico-cdc-test-rig/` and `ftdi-loopback-verify/` against the real
USB rigs — all in-repo, no external checkouts.

Each subdirectory is self-contained, with its own `README.md`, `CLAUDE.md`,
`PLAN.md`, and tests. Start there for component-specific detail.

## Git origin

```
git@gitlab.compelcon.se:unified-serial-terminal/unified-serial-term.git
```

This is the current canonical remote. The project is host-agnostic and may
be mirrored to GitHub or elsewhere; throughout the per-component docs the
remote is referred to abstractly as `<git origin>`, and deployment infra as
`<deploy-host>` / `<deploy-domain>`.

## Quick start

```sh
git clone git@gitlab.compelcon.se:unified-serial-terminal/unified-serial-term.git
cd unified-serial-term

# build the driver, then the app (the app auto-builds the driver too)
cd ftdi-driver  && npm ci && npm run build && cd ..
cd terminal-app && npm ci && npm run dev
```

Open the dev URL in Chromium (Web Serial / WebUSB are Chromium-only).

## Companion repo (clone alongside)

A couple of device-rebind steps in the docs reference the **ftdi-unbind**
repo, which is **not** part of this repo. Clone it next to
`unified-serial-term/` so the documented relative paths
(`../../ftdi-unbind/...`) resolve:

```
<parent>/
├── unified-serial-term/   ← this repo
└── ftdi-unbind/           ← FTDI bind/unbind tooling; macos-linux/ holds the scripts
```

## History

This repository consolidates several formerly standalone projects, with
their full git history preserved here under the directories above:

- `ftdi-driver/` ← **ftdi-webusb-driver**
- `terminal-app/` ← **terminal-app**
- `hil-preflight/` ← **hil-preflight**
- `pico-cdc-test-rig/` ← **pico-cdc-test-rig**
- `ftdi-loopback-verify/` ← **ftdi-loopback-verify**

Original `v0.1.0` releases are preserved as per-component tags:
`ftdi-driver-v0.1.0`, `terminal-app-v0.1.0`, and `pico-cdc-test-rig-v0.1.0`.
The original repositories are retained as read-only archives.
