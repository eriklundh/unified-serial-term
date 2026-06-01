# LAB-SETUP.md — classroom deployment guide for instructors

This guide covers the one-time setup that students (or instructors on their
behalf) must do on each **student machine** before using the Web Serial Console
in a lab session. It covers:

1. Chromium version requirements
2. Windows: binding WinUSB with Zadig
3. Linux: udev rules for USB-serial access
4. The first-connection WebUSB permission prompt
5. Revoking permissions if a board changes hands

For the lab *server* provisioning (nginx, Let's Encrypt), see
`docs/LAB-SERVER-SETUP.md`. For the recurring deploy procedure, see
`docs/DEPLOYMENT.md`.

---

## 1. Chromium version requirements

Both Web Serial and WebUSB are **Chromium-only** APIs. They are not available
in Firefox or Safari.

| API           | Minimum Chromium version | Status as of 2026 |
|---------------|--------------------------|-------------------|
| Web Serial    | 89 (released 2021-03)    | stable            |
| WebUSB        | 61 (released 2017-09)    | stable            |

**Recommended:** Chromium 120 or later (or the matching Chrome release).
Earlier versions may lack minor API surface used internally.

To check:
```
chrome://version
```

The lab VM serves the app over HTTPS. If students open the URL in any browser
other than Chromium/Chrome, the backend selector will show "no backends
available." This is expected and correct — redirect them to use Chromium.

---

## 2. Windows: bind WinUSB to the FTDI chip (Zadig)

This step is required **once per student machine** for the **WebUSB (FTDI)**
backend. Students using the **Web Serial** backend (FTDI VCP driver) can skip
this section.

### Why

By default, Windows binds an FT231XS (or other FTDI chip) to FTDI's VCP
driver, which creates a COM port. The VCP driver prevents WebUSB from claiming
the device, so `navigator.usb.requestDevice()` will not see it.

Zadig replaces the FTDI VCP binding with WinUSB, a generic driver that exposes
the raw USB device to WebUSB without creating a COM port. After binding WinUSB,
the same device can be used by both JTAG tools (OpenOCD, J-Link) and this
terminal app — no driver swapping needed.

### Procedure

1. Download Zadig from [zadig.akeo.ie](https://zadig.akeo.ie) and run it
   (no install needed; it's a standalone `.exe`).
2. Plug the FTDI board into USB.
3. In Zadig, **Options → List All Devices** if the device doesn't appear.
4. Select the device from the dropdown. For an FT231XS it will show something
   like `FT231X USB UART` or just `USB Serial Converter`.
5. Set the target driver to **WinUSB** (right-hand box in the arrow row).
6. Click **Replace Driver** (or **Install Driver** on first use). Wait for the
   progress bar to complete.
7. Verify: open Device Manager → **Universal Serial Bus devices** → the entry
   should now say the device name, **not** appear under Ports (COM & LPT).

### Reverting to VCP (if needed)

1. Open Device Manager.
2. Find the device under **Universal Serial Bus devices**.
3. Right-click → **Uninstall device** → tick "Delete the driver software for
   this device" → **Uninstall**.
4. Unplug and replug the board. Windows will reinstall the FTDI VCP driver
   automatically (or prompt for it from Windows Update).

After reverting, the Web Serial backend works; the WebUSB backend does not.

---

## 3. Linux: udev rules for USB-serial access

On Linux, accessing USB devices as a non-root user requires a udev rule that
grants the current user (or the `dialout`/`plugdev` group) read/write
permission.

### For the WebUSB (FTDI) backend

Create `/etc/udev/rules.d/99-ftdi-webusb.rules`:

```
# FT231XS (VID 0403, PID 6015) — allow access via WebUSB for dialout group
SUBSYSTEM=="usb", ATTRS{idVendor}=="0403", ATTRS{idProduct}=="6015", MODE="0664", GROUP="dialout"
```

Replace `6015` with the actual product ID if you use a different FTDI chip
(FT2232H is `6010`, FT232RL is `6001`, etc.). To find it:
```bash
lsusb | grep -i ftdi
# e.g.: Bus 001 Device 004: ID 0403:6015 Future Technology Devices International, Ltd Bridge(I2C/SPI/UART/FIFO)
```

Then reload udev and replug the device:
```bash
sudo udevadm control --reload-rules
sudo udevadm trigger
```

Add the student's user to `dialout` if not already there:
```bash
sudo usermod -aG dialout $USER
# Log out and back in for the group change to take effect.
```

### For the Web Serial backend

Most Linux distributions put serial devices under `dialout`. Being in the
`dialout` group is sufficient:
```bash
sudo usermod -aG dialout $USER
```

After a re-login, the device (e.g., `/dev/ttyUSB0`) should be accessible
without sudo.

---

## 4. First-connection WebUSB permission prompt

When a student clicks **Connect** with the **WebUSB (FTDI)** backend selected,
Chromium shows a device picker dialog:

1. The dialog lists USB devices that match the WebUSB filter (FTDI VID 0x0403).
2. The student selects the board and clicks **Connect**.
3. Chromium records the permission for that **origin + device** pair. On the
   next reload, `listPaired()` finds the device automatically and the app
   auto-reconnects.

Permission scope: **per-origin, per-browser-profile, per-device**. If a
student uses a different Chromium profile or a different machine, they see the
picker again.

The same picker logic applies to the **Web Serial** backend, just using
`navigator.serial.requestPort()` instead.

---

## 5. Revoking permissions if a board changes hands

### Via the address bar (quickest)

1. Open the terminal app in Chromium.
2. Click the **lock / tune icon** in the address bar → **Site settings**.
3. Scroll to **USB devices** (WebUSB) or **Serial ports** (Web Serial).
4. Find the relevant device → click the **X** (revoke).

On next connect the picker appears again for the new user.

### Via chrome://settings/content/usbDevices

1. Navigate to `chrome://settings/content/usbDevices`.
2. Find the entry for `serial-lab.test.delivery-academy.se`.
3. Click the **trash icon** next to the device.

Same path for Web Serial: `chrome://settings/content/serialPorts`.

### Why this matters

If a board is passed from one student to another without revoking the
permission, the previous student's browser profile still has access to the
device's USB descriptor. In a shared-computer lab this is a non-issue (each
student logs into their own OS profile). In a BYOD setup where boards are
lent out, walk the new student through the revoke flow above.

---

## 6. Verifying the setup

Once the driver binding and udev rules are in place, open the terminal app in
Chromium and check:

- The **backend selector** shows at least one option (Web Serial, WebUSB, or
  both). If it says "no backends available," the app is not being served over
  HTTPS, or you're using the wrong browser.
- Click **Connect**. A device picker should appear.
- Select the board and click **Connect** in the picker.
- Type a character in the terminal; if the board echoes it back, the full
  data path is working.

If the device picker appears but shows no devices:
- **WebUSB**: check Zadig (Windows) or udev rule + `dialout` group (Linux).
- **Web Serial**: check `dialout` group membership (Linux) or that no other
  application (e.g., a COM port monitor) has the port open (Windows).
