# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] — 2026-06-01

First public release. A browser-based serial terminal supporting two
interchangeable backends: the Web Serial API (for CDC devices and FTDI chips
bound to the FTDI VCP driver) and WebUSB via the `ftdi-webusb-driver` library
(for FTDI chips bound to WinUSB/libusb).

### Added

- **Web Serial backend** — connect to any USB-serial device via
  `navigator.serial`. Handles `open`/`close` lifecycle including lock-release
  on disconnect to avoid "port is busy" errors.
- **WebUSB + FTDI backend** — connect to FT231XS and similar chips bound to
  WinUSB (Zadig) or libusb via the `ftdi-webusb-driver` library, enabling
  simultaneous JTAG/MPSSE and terminal use in the same browser session.
- **Backend selector** — dropdown filtered to backends supported by the current
  browser; selection persists in `localStorage`.
- **Settings panel** — baud rate, data bits, parity, stop bits, flow control,
  and local-echo; all settings persist in `localStorage`.
- **Auto-reconnect** — on page load, if the selected backend has a previously
  authorised device (`listPaired()`), connects automatically with the saved
  settings.
- **xterm.js terminal renderer** — full ANSI/VT escape-sequence support,
  adaptive resize via `@xterm/addon-fit`, clickable URLs via
  `@xterm/addon-web-links`.
- **Pure-static build** — `npm run build` produces a `dist/` folder of HTML,
  CSS, and JS with relative asset paths (`base: './'`). Drop into any nginx or
  Apache document root; no Node.js required on the server.
- **Deployment docs** — `docs/DEPLOYMENT.md` covers build, HTTPS requirements,
  nginx and Apache snippets, subpath deployment, and the `rsync` deploy command.
- **Lab-server setup docs** — `docs/LAB-SERVER-SETUP.md` covers one-time
  provisioning of the Debian 13 lab VM (UFW, nginx, Let's Encrypt).
- **Classroom setup docs** — `docs/LAB-SETUP.md` covers student-machine
  preparation (WinUSB binding via Zadig, udev rules, Chromium version
  requirements, WebUSB permission flow).

### Technical notes

- Framework: Vue 3 + Composition API + `<script setup>`
- Build: Vite (app mode, `base: './'`)
- Language: TypeScript strict
- Tests: Vitest (unit + jsdom), Playwright (E2E smoke)
- Style: plain CSS + custom properties

[0.1.0]: https://github.com/eriklundh/web-serial-console/releases/tag/v0.1.0
