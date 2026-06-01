# Web Serial Console

A browser-based serial terminal with two interchangeable backends:

| Backend | When to use |
|---------|-------------|
| **Web Serial** | Standard CDC devices; FTDI chips with the FTDI VCP driver installed |
| **WebUSB (FTDI)** | FTDI chips bound to WinUSB/libusb — enables simultaneous JTAG and terminal use without swapping drivers |

Requires **Chromium** (or Chrome). Firefox and Safari do not support Web Serial
or WebUSB.

---

## Features

- Connect to any USB-serial device through either backend
- Settings panel: baud rate (300–921600), data bits (7/8), parity, stop bits,
  flow control (RTS/CTS), and local echo — all persisted in `localStorage`
- Auto-reconnect on page load if a previously authorised device is available
- xterm.js terminal renderer with full ANSI/VT escape-sequence support,
  adaptive resize, and clickable URLs
- Pure-static deployment — no server-side runtime required

---

## Classroom setup quickstart

### Windows (FTDI WebUSB backend)

1. Download and run [Zadig](https://zadig.akeo.ie).
2. Plug in the FTDI board.
3. Select the device → choose **WinUSB** → **Replace Driver**.
4. Open the app in Chromium, select **WebUSB (FTDI)**, click **Connect**.

The first connection shows a device-picker dialog; Chromium remembers the
permission on subsequent loads and auto-reconnects.

For detailed Zadig instructions, permission revocation, and Linux udev rules,
see [`docs/LAB-SETUP.md`](docs/LAB-SETUP.md).

### Linux (either backend)

Add your user to `dialout` and (for WebUSB) add a udev rule:

```bash
sudo usermod -aG dialout $USER   # re-login after

# For WebUSB / FTDI (adjust product ID for your chip):
sudo tee /etc/udev/rules.d/99-ftdi-webusb.rules <<'EOF'
SUBSYSTEM=="usb", ATTRS{idVendor}=="0403", ATTRS{idProduct}=="6015", MODE="0664", GROUP="dialout"
EOF
sudo udevadm control --reload-rules && sudo udevadm trigger
```

---

## Building and deploying

```bash
npm install
npm run build   # produces dist/
```

`dist/` is a self-contained folder of static files. Copy it to any nginx or
Apache document root. **HTTPS is mandatory** — both Web Serial and WebUSB are
only available in secure contexts.

Quick local smoke test:

```bash
npx serve dist/ -l 8080
# Open http://localhost:8080 in Chromium (localhost counts as secure context)
```

For the full deploy procedure (nginx config, rsync command, subpath
deployment), see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

For the one-time lab-server provisioning (UFW, nginx, Let's Encrypt), see
[`docs/LAB-SERVER-SETUP.md`](docs/LAB-SERVER-SETUP.md).

---

## Development

```bash
npm install
npm run dev        # Vite dev server with HMR
npm test           # Vitest unit tests
npm run typecheck  # vue-tsc
npm run lint       # ESLint
npm run build      # production bundle
```

Tests use Vitest + jsdom for pure modules and Vue components. Playwright E2E
smoke tests live in `e2e/` and are run with `npm run test:e2e`.

---

## Architecture

```
src/
  backends/
    SerialBackend.ts        # shared interface + types
    WebSerialBackend.ts     # Web Serial API adapter
    WebUsbFtdiBackend.ts    # ftdi-webusb-driver adapter
    MockSerialBackend.ts    # test double
    injectionKeys.ts        # Vue provide/inject keys
  components/
    Terminal.vue            # xterm.js wrapper
    BackendSelector.vue     # backend dropdown
  settings/
    useSettings.ts          # composable: baud/bits/parity/… + localStorage
    backendPreference.ts    # preferred backend id + localStorage
  App.vue                   # connection state machine
  main.ts                   # app composition root (factories provided here)
```

Both backends satisfy the same `SerialBackend` interface:
- `readable: ReadableStream<Uint8Array>`
- `writable: WritableStream<Uint8Array>`
- `open(options): Promise<void>` / `close(): Promise<void>`

This means all downstream code — terminal piping, settings, reconnect logic —
is backend-agnostic.

---

## Dependencies

- [`ftdi-webusb-driver`](../ftdi-webusb-driver) — WebUSB transport for FTDI
  chips; this app is its primary consumer
- [`@xterm/xterm`](https://github.com/xtermjs/xterm.js) — terminal renderer
- [Vue 3](https://vuejs.org) — UI framework
- [Vite](https://vitejs.dev) — build tool

---

## Attribution

UI structure and xterm.js integration were informed by reading
[zaxbux/web-serial-console](https://github.com/zaxbux/web-serial-console),
which is an excellent reference for connecting xterm.js to the Web Serial API
in a Vue component. No code was copied from that repo; everything here was
written from scratch under test-first discipline.

---

## License

[MIT](LICENSE)
