# LAB-SETUP.md — classroom deployment guide for instructors

This guide covers everything an instructor needs to deploy the Web Serial
Console in a computer lab and help students connect to their boards for
the first time.

For provisioning the web server that hosts the app, see
[LAB-SERVER-SETUP.md](LAB-SERVER-SETUP.md).

---

## 1. Chromium version requirements

Both Web Serial and WebUSB are **Chromium-only** features. They work in:

- Google Chrome ≥ 89
- Microsoft Edge ≥ 89 (Chromium-based)
- Brave ≥ 1.24
- Any other Chromium-based browser ≥ 89

**Does not work in:** Firefox, Safari, iOS Safari, Chrome on iOS.

Check the installed version: navigate to `chrome://version` or `edge://version`.
The installed Playwright-bundled Chromium on the lab VM is the test reference.

---

## 2. Choosing a backend for your lab

| Scenario | Recommended backend |
|----------|---------------------|
| Raspberry Pi Pico, Arduino, or any USB CDC device | **Web Serial** |
| FTDI FT231XS (or FT-X family) shared with JTAG tools | **WebUSB (FTDI)** |
| Mixed lab (some Pico CDC, some FTDI) | Both — selector in the UI |

**Web Serial** is simpler for students: the OS treats the device as a COM port
and no driver binding step is needed beyond the standard VCP driver.

**WebUSB** requires WinUSB binding (Windows) or a udev rule (Linux) — see
sections 3 and 4. Use it when students need to keep JTAG and UART active in
the same browser session without swapping drivers (the WinUSB binding is
shared by both).

---

## 3. Windows — WinUSB binding with Zadig (WebUSB backend only)

### One-time setup per machine

1. Download [Zadig](https://zadig.akeo.ie/) and run it as Administrator.
2. Plug in the FTDI board.
3. In Zadig: **Options → List All Devices**, find "FT231X USB UART"
   (VID: 0403, PID: 6015).
4. Set the right-hand driver to **WinUSB**.
5. Click **Replace Driver** and wait for completion (~30 s).

After this, the device appears in Chromium's WebUSB picker instead of as a
COM port. The binding persists across reboots and USB replug.

### Reverting to the VCP driver (COM port)

Open **Device Manager**, expand **Universal Serial Bus devices**, right-click
the FT231X device → **Update driver** → **Browse my computer** →
**Let me pick from a list** → select **USB Serial Port (FTDI)** or install
from the [FTDI VCP driver package](https://ftdichip.com/drivers/vcp-drivers/).

### Student experience (first time)

1. Navigate to the app URL in Chrome.
2. Select **WebUSB (FTDI)** in the backend dropdown.
3. Click **Connect**.
4. A browser dialog appears: "unified-serial-console wants to connect to a USB
   device." Student selects the FT231X and clicks **Connect**.
5. The browser remembers this permission. On the next page load the app
   auto-reconnects without prompting.

---

## 4. Linux — udev rules for WebUSB and Web Serial

### WebUSB (FTDI)

The kernel must not claim the device with `ftdi_sio`. Either unbind it
manually or add a udev rule that prevents automatic binding:

```udev
# /etc/udev/rules.d/99-ftdi-webusb.rules
# Grant the logged-in user access; prevent ftdi_sio from claiming the device.
SUBSYSTEM=="usb", ATTR{idVendor}=="0403", ATTR{idProduct}=="6015", \
  MODE="0660", GROUP="plugdev", TAG+="uaccess", \
  ENV{ID_MM_DEVICE_IGNORE}="1"
```

```bash
sudo udevadm control --reload-rules && sudo udevadm trigger
sudo usermod -aG plugdev $USER   # log out and in again to take effect
```

To unbind without a persistent rule (testing only):

```bash
# From this repo's parent:
../../ftdi-unbind/macos-linux/ftdi-unbind 0403:6015
# Rebind after:
../../ftdi-unbind/macos-linux/ftdi-bind 0403:6015
```

### Web Serial

Users need to be in the `dialout` group (serial port access):

```bash
sudo usermod -aG dialout $USER   # log out and in again
```

No udev rule is required for CDC devices under Web Serial — the kernel driver
(`cdc_acm`) handles the device and exposes it as `/dev/ttyACM0`.

### Raspberry Pi Pico (Pico CDC DUT)

The Pico appears as a CDC-ACM device. Pico-specific udev rules:

```udev
# /etc/udev/rules.d/99-pico-usb.rules
SUBSYSTEM=="usb", ATTR{idVendor}=="2e8a", ATTR{idProduct}=="000a", \
  MODE="0660", GROUP="plugdev", TAG+="uaccess"
```

---

## 5. One-time WebUSB permission prompt

Chromium's WebUSB permission is **per-origin, per-device, per-user-profile**.

- **First connect:** the browser shows a device picker dialog. Student selects
  the device once and clicks **Connect**.
- **Subsequent visits:** the app auto-reconnects (the permission is remembered).
- **Different student, same machine:** the new student must grant permission
  again (new browser profile = no remembered permission).

### Revoking permissions

**If a board changes hands** between students or between classes:

1. In Chrome: `chrome://settings/content/usbDevices`
2. Find the device associated with the app's origin.
3. Click the **trash icon** to revoke.

Or right-click the lock icon in the address bar → **Site settings** → **USB
devices** → remove the entry.

---

## 6. Chromium flags (not normally needed)

In controlled lab environments, the following flags may simplify setup:

| Flag | Effect |
|------|--------|
| `--enable-features=WebSerial` | Force-enable Web Serial on older Chromium |
| `--disable-web-security` | **Only for localhost testing; never in class** |

Do not use `--disable-web-security` in a classroom setting — it removes all
same-origin protections.

---

## 7. Common student issues

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| "This browser doesn't support serial-over-USB" | Not using Chromium, or Chromium < 89 | Install Chrome/Edge ≥ 89 |
| Backend selector shows nothing | App served over plain HTTP (not localhost) | Serve over HTTPS or use localhost |
| Connect dialog appears but no devices listed | WinUSB not bound (Windows); udev rule missing (Linux) | Steps 3 or 4 above |
| Auto-reconnect connects to wrong device | Another device was last-paired | Click Disconnect, then Connect to pick the right one |
| Bytes appear garbled | Baud rate mismatch | Match the baud rate to the firmware |
| Nothing echoed back | Local echo off and device doesn't echo | Enable the **Echo** checkbox in settings |

---

## 8. Security notes

- The app is **read-only in the browser's sandbox** — it cannot access the
  filesystem or any other origin.
- WebUSB and Web Serial permissions are stored per-browser-profile, not
  per-OS-user. Shared machines with shared Windows user accounts will share
  permissions. Use separate Chrome profiles for separate students if this
  matters.
- The app itself has no backend server, no login, no persistent storage beyond
  `localStorage`. No student data is transmitted anywhere.
