# SEMIAUTO-SMOKE.md — Claude-assisted smoke test protocol (Playwright MCP)

A curated, semi-automated version of the real-hardware smoke test. Claude
Code drives a real browser through the Playwright MCP server; a human only
grants the OS device picker when it appears. Everything else — navigation,
backend selection, typing, and assertions — is automated and reproducible.

This sits between the two other protocols:

| Protocol | Driver | Backends | Coverage |
|----------|--------|----------|----------|
| `e2e/*.spec.ts` | Playwright CI | Mocked | All UI behaviour, no hardware |
| **This doc** | **Claude + MCP** | **Real loopback rigs** | **Connect + full TX→RX data path, fast** |
| `MANUAL-SMOKE.md` | Human | Real hardware | Exhaustive: baud sweep, flow control, resize, settings |

Run this as a quick real-hardware confidence check after backend/Terminal
changes or before a release candidate. Run the full `MANUAL-SMOKE.md` when
you need the exhaustive sweep.

See `PLAYWRIGHT.md` → "Playwright MCP on Windows" for one-time MCP setup
and the "verified patterns" subsection for the reasoning behind each step
below.

---

## Prerequisites

- Claude Code running **on the laptop with the USB devices** (the MCP
  server and browser must share the machine that owns the USB ports).
- Playwright MCP server registered and `✓ Connected` (`claude mcp list`).
- Both HIL **loopback rigs** connected:
  - **Web Serial** → Raspberry Pi Pico CDC loopback rig (`../pico-cdc-test-rig/`).
  - **WebUSB (FTDI)** → FT231x loopback plug (VID `0x0403`, PID `0x6015`),
    kernel driver unbound so Chromium can claim it (Linux only; on
    Windows bind WinUSB with Zadig once).
- A secure-context URL: the deployed app
  (`https://<deploy-host>/`) or a local
  `http://localhost:5173` dev server.

> **Why loopback rigs make this work:** both devices reflect every byte
> they receive, so a single keystroke is a complete round-trip assertion —
> no test firmware that prints prompts is needed.

---

## Division of labour

| Step | Who |
|------|-----|
| Navigate, select backend, configure settings, click Connect | **Claude** |
| Grant the device in the OS picker dialog (first pairing only) | **You** |
| Type markers, read `.xterm-rows`, assert echo counts, disconnect | **Claude** |

The picker only appears the **first** time a device is paired in the
browser profile. On later runs the app auto-reconnects and Claude proceeds
without pausing — that is expected, not a failure.

---

## The core assertion: echo count

Claude types a distinctive marker and reads the rendered rows directly:

```js
() => Array.from(document.querySelector('.xterm-rows').children)
  .map(r => r.textContent).filter(s => s && s.trim().length)
```

- **Echo OFF** → each typed char appears **once** (hardware loopback only).
- **Echo ON** → each char appears **twice** (app local echo + loopback).

A char that never appears = broken read/write path. A char doubled with
echo *off* = the app is wrongly local-echoing.

Send keystrokes with `browser_press_key` after clicking `.xterm-screen`
to focus — the xterm input textarea is off-screen and cannot be `fill()`ed.

---

## Protocol A — Web Serial (Pico CDC loopback)

1. Claude navigates to the app URL.
2. Confirm backend selector reads **Web Serial** (default).
3. Confirm settings: **115200 / 8 / None / 1 / None**, Echo **off**.
4. Claude clicks **Connect**. *(First run: you grant the Pico in the
   picker. Later runs: auto-reconnect, no picker.)*
5. Assert the button flipped to **Disconnect** and settings are disabled.
6. Claude focuses the terminal and types a marker, e.g. `PING`.
   - **Expect:** rows contain `PING` (once).
7. Claude checks the **Echo** box (allowed while connected), types `ZQ`.
   - **Expect:** the new chars render `ZZQQ` (doubled).
8. Claude un-checks Echo (restore default).
9. Claude clicks **Disconnect**; assert **Connect** returns.
10. Assert browser console has **0 errors / 0 warnings**.

---

## Protocol B — WebUSB (FTDI FT231x loopback)

1. Claude selects **WebUSB (FTDI)** in the backend selector.
2. Confirm settings: **115200 / 8 / None / 1 / None**, Echo **off**.
3. Claude clicks **Connect**. *(First run: you grant the FT231x in the
   picker. Later runs: auto-reconnect, no picker.)*
4. Assert the button flipped to **Disconnect**.
5. Claude focuses the terminal and types a marker, e.g. `USB`.
   - **Expect:** the newly appended tail is `USB` (once). The buffer from
     Protocol A may still be on screen — assert on the *appended* tail,
     not the whole buffer.
6. Claude checks **Echo**, types `K`.
   - **Expect:** the new char renders `KK` (doubled).
7. Claude un-checks Echo; clicks **Disconnect**.
8. Assert console has **0 errors / 0 warnings**.

---

## Protocol C — Backend switch round-trip (optional)

1. With Web Serial connected (Protocol A), Claude clicks **Disconnect**.
2. Claude switches the selector to **WebUSB (FTDI)** and connects.
3. Type a marker; confirm single-echo loopback.
4. Disconnect, switch back to **Web Serial**, reconnect, confirm echo.

This exercises the backend-switch path and confirms the selector is locked
while connected and re-enabled while disconnected.

---

## Pass criteria

All protocols pass when:

- Every "Expect:" echo-count assertion holds.
- The backend selector and settings controls are **disabled while
  connected** and **enabled while disconnected**.
- The browser console shows **0 errors and 0 warnings** for the session.
- No connection hangs requiring a page reload.

Record the result (pass / fail + notes), the app URL, and the date when
filing a release. A transient `Target page closed` on the very first
action that recovers on re-navigate is not a failure.

---

## What this protocol does NOT cover

Defer these to `MANUAL-SMOKE.md` (they need physical judgement or a sweep
that isn't worth automating through MCP):

- Baud-rate sweep across the full list.
- Hardware flow control (RTS/CTS) behaviour against the plug's wiring.
- Window resize / terminal reflow.
- Settings persistence and auto-reconnect across a full page reload.
- Ctrl+C and other control-byte handling.
