# Unified Serial Console

A browser-based serial terminal for FTDI and CDC serial devices.
No driver install. No app to download. Works in Chromium.

**Try it now → [unified-serial.delivery-academy.se](https://unified-serial.delivery-academy.se)**

---

## What it does

Connect to a serial device straight from your browser:

- **Web Serial** — for any CDC/VCP device (Arduino, Raspberry Pi Pico,
  FTDI chips on the OS serial driver, etc.)
- **WebUSB** — for FTDI chips bound to WinUSB/libusb, so the same USB
  binding serves both JTAG and UART in one browser session without
  swapping drivers

Features: configurable baud / data bits / parity / stop bits / flow
control, local echo, colour themes, font selection, in-terminal search
(Ctrl+F), bell, clickable URLs, download terminal buffer, fullscreen.

## Browser requirements

Chromium 103 or later (Chrome, Edge, Brave, Chromium).
Web Serial and WebUSB are **Chromium-only** — Firefox and Safari are not supported.

## FTDI devices on WinUSB (Windows)

To use the WebUSB backend with an FTDI chip, the device must be bound to
**WinUSB** instead of the FTDI VCP driver. The **ftdi-unbind** utility
handles this:

→ **[github.com/eriklundh/ftdi-unbind — Releases](https://github.com/eriklundh/ftdi-unbind/releases)**

Download the Windows binary or the verified shell scripts for Linux/macOS.
No build required.

## Linux / macOS — unbind the kernel serial driver

On Linux, `ftdi_sio` claims the device before WebUSB can reach it. The
same ftdi-unbind package provides a shell script that unbinds it:

```sh
# Linux
sudo ftdi-unbind 0403:6015
```

Restore with `ftdi-bind` when done.

## Source code

This repository: `git@gitlab.compelcon.se:unified-serial-terminal/unified-serial-term.git`

It may be mirrored to GitHub. For developer and contributor documentation,
see [DEVELOPER.md](DEVELOPER.md).
