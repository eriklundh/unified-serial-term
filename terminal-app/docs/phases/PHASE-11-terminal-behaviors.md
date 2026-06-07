# PHASE-11-terminal-behaviors.md — Terminal behaviours & polish

The terminal-side half of the zaxbux-informed UI/UX uplift (Phase 10 covers the
toolbar/connection chrome). Same stack rule: replicate zaxbux features in plain
CSS + Vue, no Vuetify/Pinia/router. Reference source:
`/home/eriklundh/zaxbux/web-serial-console`.

Ships as a **minor** release once 11A–11D land.

## Goals

1. Valid URLs in terminal output are **clickable** (verified, not just rendered).
2. **Bell** handling with the same options as zaxbux.
3. Adopt the worthwhile **xterm addons** zaxbux uses (answer to "what else can we
   add via packages").
4. A **splash screen** in the terminal window that promotes the project and
   disappears on first activity.

## Decisions (locked)

- **New deps (small, official `@xterm/*` only):**
  - `@xterm/addon-serialize` — already added in Phase 10E (Download); reused.
  - `@xterm/addon-search` — in-terminal find (Ctrl+F overlay).
  - `@xterm/addon-unicode11` *(optional)* — correct wide-character widths;
    activate Unicode v11.
- **Declined:** Vuetify, Pinia, vue-router, `@vueuse/core`, `@mdi/font`,
  `roboto-fontface` — out of step with our small-dep, plain-CSS stack.
- **Bell** mirrors zaxbux exactly: `bell` on/off + `bellStyle` one of
  `none | visual | sound | both` (default `visual`).
- **Splash** is a **DOM overlay** over the terminal pane (not a modal, **no
  colour samples**), dismissed on the first typed key *or* first received byte.

## Architecture

- `src/components/Terminal.vue` — central to all four:
  - 11A: ensure `WebLinksAddon` opens validated `http(s)` links in a new tab
    (`window.open(url, '_blank', 'noopener')` handler if the default needs it).
  - 11B: wire `terminal.onBell()`; throttle; visual flash class on the pane.
  - 11C: `loadAddon(new SearchAddon())`; optional `Unicode11Addon` +
    `terminal.unicode.activeVersion = '11'`.
  - 11D: splash overlay element; hide on first `onData` (typed) or first
    read-pump chunk (received).
- `src/settings/useBell.ts` (new) — `bell`, `bellStyle` persisted via the
  established localStorage-composable pattern (cf. `useAppearance.ts`).
- `src/utils/bell.ts` (new) — Web Audio square-wave `beep(vol, freq, dur)`
  ported from zaxbux `utils/bell.ts`. Pure-ish; lazy `AudioContext`.
- `src/components/SearchBar.vue` (new) — find overlay (next/prev/close), driven
  by `SearchAddon`.
- `src/components/Splash.vue` (new) — the promo overlay; an optional persisted
  "don't show again" flag.
- Bell controls live in the **⚙ Settings drawer** (Appearance/Storage section).

## Sub-phases (TDD)

| Sub-phase | Status |
|-----------|--------|
| 11A — Clickable URLs | ✅ Complete |
| 11B — Bell | ✅ Complete |
| 11C — xterm addons (Search + Unicode11) | ✅ Complete |
| 11D — Splash screen | ⬜ Pending |
| 11E — Forget paired devices | ⬜ Pending |

- **11A — Clickable URLs (item 7).** Verify + harden link activation; open in a
  new tab with `noopener`; reject non-`http(s)` schemes. *Tests:* extend the e2e
  beyond "URL rendered" to assert a **click** opens the expected URL (intercept
  `window.open` / `page.on('popup')`).

- **11B — Bell (item 8).** `useBell` + `beep()` + `onBell` wiring; visual flash;
  throttle. *Tests:* `beep` shape (oscillator/gain params, mocked AudioContext);
  `onBell` triggers sound/visual per `bellStyle`; persistence; throttle limits
  rapid bells.

- **11C — xterm addons (item 9).** Search overlay (find next/prev, highlight,
  Esc to close, no leakage of Ctrl+F to the device); optional Unicode11. *Tests:*
  search finds + highlights a match in mock output; Ctrl+F is intercepted
  app-level; (if added) a wide-char width sanity check.

- **11D — Splash screen (item 10).** Overlay visible on load; hidden on first
  typed key or first received byte; never re-shown that session. *Tests:*
  Playwright — overlay present at load; gone after a keystroke; gone after a
  simulated device byte (`__pushFromDevice`).

## Acceptance

1. `npm test`, `npm run test:e2e`, `npm run typecheck`, `npm run lint`,
   `npm run build` all clean.
2. Manual smoke: a URL in output opens on click; BEL flashes/beeps per setting;
   Ctrl+F searches the buffer; the splash shows on load and clears on first
   activity.
3. Merged to `main` with `--no-ff`; CHANGELOG + version bumped.

- **11E — Forget paired devices.** A "Forget all paired devices" button in the
  Settings drawer (Connection section) that calls `port.forget()` on every port
  returned by `navigator.serial.getPorts()` and `usb.forgetDevice()` on every
  device returned by `navigator.usb.getDevices()`, then calls `refreshPaired()`
  so the dropdown clears immediately. Mirrors the equivalent clear function in
  zaxbux. *Tests:* mock `getPorts()`/`getDevices()` returning one entry each;
  click Forget; assert `forget()`/`forgetDevice()` called and paired dropdown
  empties.

## Out of scope (this phase)

- Adopting any non-xterm framework dep.
- Scripting/recording, file-transfer protocols (xmodem/ymodem) — still out of
  scope for v1.x per the root `CLAUDE.md`.
