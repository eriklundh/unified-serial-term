# MANUAL-SMOKE.md — Browser smoke test protocol for real hardware

These are the manual steps to verify the terminal app works end-to-end against
real USB hardware. Run these after each release candidate and after any change
to the backend or Terminal component.

Automated Playwright tests cover all UI behavior with mocked backends.
This protocol covers the path that cannot be automated: the real USB device
picker dialog and full physical data path.

---

## Prerequisites

- Chromium (version matching the Playwright bundle, or `/usr/bin/chromium` on Pi5)
- App running: `npm run dev` (or deployed URL over HTTPS)
- Both hardware rigs connected and verified: `../hil-preflight/preflight.sh`

---

## Smoke test A — Web Serial backend (Pico CDC test rig)

Device: Raspberry Pi Pico with CDC loopback firmware (`../pico-cdc-test-rig/`).
Expected port: `/dev/ttyACM0`.

### Steps

1. Open `http://localhost:5173` in Chromium.
2. Confirm the backend selector shows "Web Serial".
3. Set baud to **115200**, data bits **8**, parity **None**, stop bits **1**, flow **None**.
4. Click **Connect**. The OS device picker appears.
5. Select the Pico CDC device (appears as "USB Serial Device" or similar).
6. Confirm Connect button is replaced by Disconnect; settings controls are disabled.
7. Click in the terminal pane and type `HELLO`.
   - Expected: `HELLO` echoes back immediately (Pico loopback reflects every byte).
8. Press **Enter**. Cursor moves to a new line.
9. Type a longer string (40+ characters). Confirm all characters echo back correctly.
10. Press **Ctrl+C**. Confirm the terminal writes a byte (no crash).
11. Resize the browser window. Confirm the terminal reflows to fill the pane.
12. Click **Disconnect**. Confirm Connect button returns; no console errors.

### Baud rate sweep

Repeat steps 4–12 at each of these baud rates to confirm the Pico CDC accepts
them: **9600**, **19200**, **38400**, **57600**, **115200**.

---

## Smoke test B — WebUSB FTDI backend (FTDI loopback plug)

Device: FTDI FT231XS loopback plug (VID `0x0403`, PID `0x6015`).
Wiring: TX→RX shorted, RTS→CTS shorted, DTR→DSR shorted.

### Setup

```bash
# Unbind the kernel driver so Chromium can claim the device
../ftdi-rebind-scripts/ftdi-unbind 0403:6015
```

### Steps

1. Open `http://localhost:5173` in Chromium.
2. In the backend selector, choose **WebUSB (FTDI)**.
3. Set baud to **115200**, data bits **8**, parity **None**, stop bits **1**, flow **None**.
4. Click **Connect**. The WebUSB device picker appears.
5. Select the "FT231X" device and click **Connect** in the dialog.
6. Confirm Connect button replaced by Disconnect.
7. Type `HELLO` in the terminal. Expected: `HELLO` echoed back.
8. Type a longer string and confirm echo.
9. **Baud rate change**: Disconnect; change baud to **460800**; reconnect; type `TEST`; confirm echo.
10. **Hardware flow control**: Disconnect; set flow to **RTS/CTS**; reconnect; type `PING`; confirm echo (the loopback plug's RTS→CTS wiring keeps flow enabled).
11. **Local echo on**: Disconnect; check the Echo checkbox; reconnect; type `X`.
    - Expected: `X` appears immediately (local echo) AND again when reflected by FTDI loopback (doubled).
12. Resize window; confirm terminal reflows.
13. Click **Disconnect**; confirm clean close.

### Teardown

```bash
# Rebind the kernel driver
../ftdi-rebind-scripts/ftdi-bind 0403:6015
```

---

## Smoke test C — Settings persistence and auto-reconnect

1. Set baud to **9600**, parity to **even**, echo **on**.
2. Reload the page.
3. Confirm baud is still 9600, parity is still even, echo is still checked.
4. Connect to either device.
5. Reload the page without disconnecting first.
6. Confirm the app auto-reconnects (status message "Auto-reconnected to …" visible).
7. Confirm settings are still as set.
8. Click **Disconnect**.
9. Click **Reset**. Confirm all settings return to defaults (115200, 8, none, 1, none, unchecked).
10. Reload. Confirm defaults are shown.

---

## Smoke test D — Backend switching

1. Connect to the Pico CDC via **Web Serial**.
2. Disconnect.
3. Switch backend selector to **WebUSB (FTDI)** (ensure FTDI plug is connected and ftdi_sio unbound).
4. Connect.
5. Type `PING`; confirm echo from FTDI loopback.
6. Disconnect.
7. Switch back to **Web Serial**; connect to Pico CDC; confirm echo.

---

## Pass criteria

All smoke tests pass when every "Expected:" statement holds true, there are no
JavaScript errors in the browser console, and no connection hangs requiring a
page reload.

Record the result (pass / fail + any notes) and the date when filing a release.
