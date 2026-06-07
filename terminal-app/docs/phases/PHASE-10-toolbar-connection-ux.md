# PHASE-10-toolbar-connection-ux.md — Toolbar & connection UX

A toolbar and connection-flow refresh, informed by the live
[zaxbux/web-serial-console](https://github.com/zaxbux/web-serial-console)
(source cloned at `/home/eriklundh/zaxbux/web-serial-console`). We replicate its
*features*, not its stack: zaxbux is Vuetify + Pinia + vue-router; we stay on
plain CSS + Vue `ref`/`computed`/`provide`-`inject` per the repo `CLAUDE.md`.

Ships as a **minor** release (new features, backward compatible) once 10A–10G
land. Phase 11 (terminal behaviours) is a separate doc.

## Goals

1. Clicking any **toolbar** control returns focus to the terminal afterward.
2. Rename the connection control to **"Serial connect:"** (describe the
   connection, not the architecture).
3. One **connection dropdown** that lists already-paired devices from *both*
   backends alongside "Request…" actions.
4. **Baud** rate as a toolbar dropdown (out of the settings drawer).
5. A **Serial Settings** dropdown for the remaining port options.
6. A **Download** button (terminal contents → text file).
7. A **Fullscreen** toggle button.

## Decisions (locked)

- **No Vuetify/Pinia/vue-router/@vueuse/@mdi.** Fullscreen via the native
  Fullscreen API. Icons via the existing inline-glyph approach.
- The **architecture selector is removed.** The backend (Web Serial vs WebUSB-
  FTDI) becomes implicit in which paired device / "Request…" action is chosen.
- Focus model: **restore focus to the terminal after a toolbar op** — a single
  canonical focus owner. A full focus stack is unnecessary; not built.
- Download starts as **plain text** (`SerializeAddon.serialize()` → `.txt`); a
  Text/HTML split menu (à la zaxbux) is a stretch goal, noted but not required.
- New dep: **`@xterm/addon-serialize`** (small, official) for Download.

## Architecture

- `src/components/BackendSelector.vue` → reworked into a **`ConnectionSelect.vue`**
  (label "Serial connect:") that aggregates paired devices + request actions.
- `src/backends/SerialBackend.ts` — extend the contract so a paired device
  carries a **device-specific label** and can be opened directly:
  - enrich `WebSerialBackend.label` / `WebUsbFtdiBackend.label` from
    `port.getInfo()` / device VID:PID;
  - `listPaired()` already returns the openable backends — selection maps an
    entry → its backend; "Request…" maps to `pickDevice()`.
- `src/backends/usbVendors.ts` (new) — small VID→name table written from the
  public USB-IF registry + FTDI datasheets (FTDI etc.) for friendly labels.
  Pure + unit-tested. (Not copied from any third-party project — zaxbux carries
  no licence and is a *feature* reference only.)
- `src/App.vue` — toolbar reflow; a `withTerminalFocus(fn)` wrapper; baud
  `<select>`; a **`SerialSettings.vue`** popover (native `<dialog>`); Download +
  Fullscreen handlers. The ⚙ drawer loses the port settings, keeps Appearance +
  Storage.
- `src/components/Terminal.vue` — load `SerializeAddon`; expose
  `serialize()` and keep `focus()`.

## Sub-phases (TDD)

- **10A — Focus-return wrapper.** `withTerminalFocus` (App-level helper or
  `useTerminalFocus` composable). Replace the scattered `terminalRef.focus()`
  calls. *Tests:* clicking Clear / Download / Fullscreen / closing a drawer
  leaves focus on the terminal (Vitest component + a Playwright focus assertion).

- **10B — "Serial connect:" + unified device dropdown (items 1, 2).**
  `ConnectionSelect` lists: paired Web Serial ports (`navigator.serial.getPorts()`),
  paired WebUSB-FTDI devices (`navigator.usb.getDevices()`, FTDI-filtered), a
  separator, then "Request Serial device…" / "Request WebUSB (FTDI) device…".
  Labels via `usbVendors` + VID:PID. *Tests:* `usbVendors` mapping (pure);
  dropdown lists mock paired devices from both backends; selecting a paired
  entry opens *that* backend; a "Request…" entry calls the matching
  `pickDevice()`; empty state still shows the "use Chromium" message.

- **10C — Baud dropdown in the toolbar (item 3).** Compact `<select>` bound to
  `settings.baudRate`, next to the connection control, disabled while connected;
  removed from the drawer. *Tests:* toolbar baud present with the 12 standard
  rates; persists across reload; disabled while connected.

- **10D — Serial Settings popover (item 4).** `SerialSettings.vue` (native
  `<dialog>`, styled like the drawer) with data bits, parity, stop bits, flow
  control, local echo (live), reset — moved out of the ⚙ drawer. Port-config
  controls disabled while connected; echo stays live. *Tests:* opens/closes;
  controls present + persist; disabled-while-connected except echo; focus
  returns to terminal on close.

- **10E — Download button (item 5).** Add `@xterm/addon-serialize`; Download
  right of Clear → `SerializeAddon.serialize()` → `Blob` →
  `console-YYYYMMDD-HHMMSS.txt`. *Tests:* Playwright — receive/type content,
  click Download, assert the download filename + that content round-trips
  (`page.waitForEvent('download')`).

- **10F — Fullscreen button (item 6).** Square icon + `title` tooltip; native
  `requestFullscreen()` / `exitFullscreen()` on the app root; icon reflects
  state; hidden when `document.fullscreenEnabled` is false. *Tests:* component
  test with a mocked Fullscreen API toggles state + icon; hidden when
  unsupported.

- **10G — Toolbar reflow + focus integration.** Order:
  `[Serial connect: ▾] [Baud ▾] [Connect/Disconnect] [Serial Settings ▾]` ·
  `[Clear] [Download] [Fullscreen]` … `[⚙ Settings]`. Wrap every button with
  10A. Update affected unit/e2e toolbar tests for the new structure.

## Acceptance

1. `npm test`, `npm run test:e2e`, `npm run typecheck`, `npm run lint`,
   `npm run build` all clean.
2. Manual smoke: paired devices appear in "Serial connect:"; pick one →
   connects; baud + serial settings reachable from the toolbar; Download saves
   the buffer; Fullscreen toggles; after any toolbar click, typing goes to the
   terminal.
3. Merged to `main` with `--no-ff`; CHANGELOG + version bumped.

## Out of scope (this phase)

- Bell, clickable-URL hardening, search, splash → Phase 11.
- Multi-device simultaneous sessions; Text/HTML download split (stretch).
