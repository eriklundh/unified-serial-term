# PHASE-09-ui-theming.md — Terminal UX & theming (release v1.1.0)

A UI/UX refresh: a **clear-terminal** action, **font** and **colour-theme**
selection, a modern **non-modal settings drawer**, and contemporary styling of
the controls. Original design — informed by xterm.js and common conventions,
not a copy of any one console.

Ships as **v1.1.0** (minor: new features, backward compatible). Promoted to
production via the tag-gated deploy (`fetch-build-deploy.sh production v1.1.0`);
`/version.json` reports it live.

## Goals

1. **Clear terminal** — an always-visible toolbar button **and** a
   configurable (or off) hotkey.
2. **Font selection** — family (incl. Source Code Pro) + size.
3. **Colour themes** — curated palettes applied to *both* the xterm canvas and
   the app chrome.
4. **Modern controls** — a cohesive toolbar + a **non-modal slide-over drawer**
   for settings (adjust while output streams underneath), token-driven styling.
5. **Durable, portable settings** — `localStorage` +
   `navigator.storage.persist()` + **Export/Import** a settings `.json`.

## Decisions (locked)

- Settings surface: **non-modal drawer** via the native `<dialog>` (focus,
  Esc-to-close, `::backdrop` for free), `.show()` so the terminal stays live.
- Persistence: localStorage + `persist()` + Export/Import JSON.
- Clear lives in the **toolbar** (one click, never hidden in the drawer); hotkey
  default `Ctrl+Shift+K`, rebindable or **Off**, intercepted before xterm so
  device keystrokes are unaffected.
- Fonts: self-host a few woff2 (Source Code Pro, JetBrains Mono, Cascadia Code)
  with `font-display: swap`, plus zero-download system stacks as the default.
- Themes: Dark (default), Light, Solarized Dark, Nord to start; initial default
  honours `prefers-color-scheme`.

## Architecture

- `src/themes/index.ts` — theme registry: `id`, `label`, `dark`, an xterm
  `ITheme` (fg/bg/cursor/selection + 16 ANSI), and CSS **design tokens**;
  `getTheme`, `defaultThemeId(prefersDark)`, `applyThemeTokens`.
- `src/settings/useAppearance.ts` — appearance settings (`themeId`,
  `fontFamily`, `fontSize`, `clearHotkey`) persisted like `useSettings`.
- `src/settings/io.ts` — `exportSettings()` / `importSettings()` over all
  settings keys, and `requestPersistentStorage()`.
- `src/components/Terminal.vue` — reactive `fontFamily` / `fontSize` / `theme`
  props + `defineExpose({ clear })`.
- New `Toolbar.vue`, `SettingsDrawer.vue`, `AppearanceControls.vue`.
- Global CSS: design tokens (`var(--bg|fg|surface|border|accent|…)`) +
  `@font-face`.

## Sub-phases (TDD)

- **A — Appearance foundation.** Theme registry + `useAppearance` + `io` +
  design tokens; Terminal reacts to font/theme; persistence + export/import
  tested. *(Started here.)*
- **B — Clear terminal.** `Terminal.clear()` exposed; toolbar button;
  configurable/off hotkey intercepted app-level; tests.
- **C — Drawer + toolbar restyle.** Non-modal `<dialog>` drawer, restyled
  toolbar, responsive, `:focus-visible`, `prefers-reduced-motion`; Playwright
  smoke.
- **D — Fonts.** Self-hosted woff2 + `@font-face` + family/size pickers (ligature
  toggle a stretch).
- **E — Release.** CHANGELOG, bump to 1.1.0, tag `v1.1.0`, deploy staging →
  verify `/version.json` → promote to production.

## Acceptance

- [ ] Clear works from the toolbar button and the (configurable, non-conflicting)
      hotkey; hotkey can be turned off.
- [ ] Font family + size selectable and applied live; Source Code Pro available.
- [ ] At least 4 colour themes; chrome and terminal stay visually consistent;
      dark is the standard default (independent of `prefers-color-scheme`).
- [ ] Settings open in a non-modal drawer; the terminal keeps streaming.
- [ ] Settings persist across restarts; `persist()` requested; Export/Import a
      `.json` round-trips.
- [ ] All prior tests green + new unit tests for theme/appearance/io/clear.
- [ ] a11y: ARIA on icon buttons, `:focus-visible`, theme contrast.
- [ ] Released as `v1.1.0` and live in production (`/version.json` shows it).
