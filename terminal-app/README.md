# Unified Serial Console

A browser-based serial terminal that connects to USB serial devices through
two interchangeable backends:

| Backend | When to use | What the OS sees |
|---------|-------------|------------------|
| **Web Serial** | CDC devices; FTDI chips bound to the FTDI VCP driver | A COM port |
| **WebUSB (FTDI)** | FTDI chips bound to WinUSB (share device with JTAG tools) | A raw USB device |

The user picks the backend before connecting. Everything downstream — terminal
rendering, settings, copy/paste, local echo — works identically regardless of
which backend is active.

**Browser requirement:** Chromium 89+ (Chrome, Edge, Brave). Web Serial and
WebUSB are not available in Firefox or Safari.

**HTTPS requirement:** Both APIs require a secure context. The app works at
`http://localhost` for development, but production deployments must be served
over HTTPS.

---

## Quick start — development

```bash
npm install
npm run dev          # http://localhost:5173
```

## Build

```bash
npm run build        # output: dist/
```

`dist/` is a self-contained folder of static files (HTML, JS, CSS). Drop it
into any web server's document root. No Node.js, no runtime dependencies.
See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for full deploy instructions.

---

## Lab setup quickstart for instructors

### Deciding which backend to use

| Scenario | Backend |
|----------|---------|
| Pico, Arduino, or any CDC-ACM device | Web Serial |
| FTDI chip shared with JTAG tools in the same session | WebUSB (FTDI) |

For most introductory embedded labs, **Web Serial is simpler** — no driver
binding required on Windows. Use WebUSB only when students need to keep JTAG
and UART in the same browser session without swapping drivers.

### Windows — binding WinUSB with Zadig (WebUSB backend only)

1. Download [Zadig](https://zadig.akeo.ie/) and run it as Administrator.
2. Plug in the FT231XS board. Under **Options → List All Devices**, find
   "FT231X USB UART" (or similar).
3. Change the right-hand driver to **WinUSB** and click **Replace Driver**.
4. The device now appears in Chromium's WebUSB picker instead of as a COM port.
5. To revert: Device Manager → right-click the device → **Update driver** →
   browse to `C:\Windows\System32\drivers\` and pick `ftser2k.sys`.

See [docs/LAB-SETUP.md](docs/LAB-SETUP.md) for detailed classroom deployment
notes including permission management and Chromium version requirements.

### Linux — udev rules for WebUSB access without root

```udev
# /etc/udev/rules.d/99-ftdi-webusb.rules
SUBSYSTEM=="usb", ATTR{idVendor}=="0403", ATTR{idProduct}=="6015", \
  MODE="0660", GROUP="plugdev", TAG+="uaccess"
```

```bash
sudo udevadm control --reload-rules && sudo udevadm trigger
# Add your user to the plugdev group if not already there:
sudo usermod -aG plugdev $USER   # log out and in again
```

The Web Serial backend uses the kernel's `ftdi_sio` driver and doesn't need
udev rules — it appears as `/dev/ttyUSB0` and the user just needs to be in the
`dialout` group:

```bash
sudo usermod -aG dialout $USER
```

---

## Feature summary

- **Two serial backends** selected at runtime from a dropdown
- **xterm.js terminal** with FitAddon (auto-resizes with the browser window)
  and WebLinksAddon (clickable URLs)
- **Settings panel:** baud rate (12 options from 300 to 921 600), data bits
  (7/8), parity (none/even/odd), stop bits (1/2), flow control (none/RTS-CTS),
  local echo
- **Persistence:** all settings and backend preference saved to `localStorage`;
  auto-restores on reload
- **Auto-reconnect:** reconnects to the last-paired device on page load
- **Full Playwright E2E suite** (mocked backends) — all UI flows covered

---

## Testing

```bash
npm test             # Vitest unit + component tests (170 tests)
npm run test:e2e     # Playwright E2E (38 mock tests; @hardware excluded)
npm run test:hw      # preflight.sh + @hardware E2E (real USB; TERMINAL_HW_TEST=1)
npm run typecheck    # vue-tsc strict
npm run lint         # ESLint
```

CI runs the unit/lint/typecheck/build jobs plus `test:e2e` on every relevant
change. To stand up the (currently dormant) runners, see
[docs/CI-RUNNER-SETUP.md](docs/CI-RUNNER-SETUP.md).

Manual hardware smoke tests: [docs/MANUAL-SMOKE.md](docs/MANUAL-SMOKE.md)
Claude-assisted (Playwright MCP) smoke tests: [docs/SEMIAUTO-SMOKE.md](docs/SEMIAUTO-SMOKE.md)

---

## Attribution

The connection state machine and xterm.js component structure were informed by
reading [zaxbux/web-serial-console](https://github.com/zaxbux/web-serial-console).
No code was copied; all lines in this repo were written from scratch under TDD
discipline.

The FTDI USB backend uses the
[ftdi-webusb-driver](../ftdi-driver/README.md) library developed
alongside this app (the sibling `ftdi-driver/` directory).

---

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full procedure including
nginx/Apache config, HTTPS setup, subpath deployment, and the one-command
rsync deploy workflow.

---

## License

MIT — see [LICENSE](LICENSE).
