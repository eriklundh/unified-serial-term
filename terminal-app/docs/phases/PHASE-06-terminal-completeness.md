# PHASE-06-terminal-completeness.md

Branch: `phase/06-terminal-completeness`

## Goal

Fill the two functional gaps discovered by the TEST-PLAN.md review and replace the
E2E smoke test placeholder with real assertions. These three items are small but
block both the manual smoke tests and the Phase 7 E2E suite from being written
with accurate expectations.

---

## Gap 1 — Local echo not wired

### Problem

`settings.localEcho` is persisted and exposed in the UI, but the Terminal component
never reads it. Keystrokes are always sent to the device and never locally echoed,
regardless of the checkbox state.

### Fix

**`src/App.vue`**

Pass the setting as a prop to Terminal:

```diff
  <Terminal
    :readable="activeReadable ?? undefined"
    :writable="activeWritable ?? undefined"
+   :local-echo="settings.localEcho"
  />
```

**`src/components/Terminal.vue`**

1. Add prop to `defineProps`:

```diff
  const props = defineProps<{
    readable?: ReadableStream<Uint8Array>
    writable?: WritableStream<Uint8Array>
+   localEcho?: boolean
  }>()
```

2. In the `onData` callback, echo locally when enabled:

```diff
  terminal.onData((data) => {
    emit('data', data)
+   if (props.localEcho) {
+     terminal.write(new TextEncoder().encode(data))
+   }
    if (writer) {
      writer.write(new TextEncoder().encode(data)).catch(() => {})
    }
  })
```

### Tests

Add to `src/components/Terminal.test.ts`:

- Mount Terminal with `localEcho: true`; simulate `onData` firing; assert `terminal.write` called with the keystroke bytes.
- Mount Terminal with `localEcho: false` (or omitted); simulate `onData`; assert `terminal.write` NOT called for that keystroke.

### Commits

```
test(terminal): assert local echo writes keystroke to terminal when enabled
feat(terminal): wire localEcho prop to echo keystrokes before sending
```

---

## Gap 2 — FitAddon has no ResizeObserver

### Problem

`fitAddon.fit()` is called once in `onMounted`. If the browser window or the
`.terminal-pane` container is resized afterwards, the xterm canvas stays at its
original dimensions. Characters wrap or clip; the terminal does not fill the pane.

### Fix

**`src/components/Terminal.vue`** — extend `onMounted` and `onUnmounted`:

```diff
+ let resizeObserver: ResizeObserver | null = null

  onMounted(() => {
    terminal = new Terminal({ cursorBlink: true, fontSize: 14, fontFamily: 'monospace' })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(new WebLinksAddon())
    terminal.open(container.value!)
    fitAddon.fit()
+   resizeObserver = new ResizeObserver(() => fitAddon.fit())
+   resizeObserver.observe(container.value!)
    // ... rest unchanged
  })

  onUnmounted(() => {
+   resizeObserver?.disconnect()
+   resizeObserver = null
    terminal?.dispose()
    terminal = null
    void reader?.cancel()
    writer?.releaseLock()
  })
```

### Tests

Add to `src/components/Terminal.test.ts`:

- Mock `ResizeObserver` (jsdom doesn't include it) so the constructor is spied on.
- Mount Terminal; assert `ResizeObserver` was constructed.
- Assert `observe(container)` was called with the container element.
- Simulate a resize callback; assert `fitAddon.fit()` was called again.
- Unmount; assert `disconnect()` was called.

### Commits

```
test(terminal): assert ResizeObserver wires fitAddon.fit on container resize
feat(terminal): add ResizeObserver to refit xterm on container size change
```

---

## Gap 3 — E2E smoke test placeholder

### Problem

`e2e/smoke.spec.ts` navigates to `about:blank` and asserts an empty title — it
passes trivially and proves nothing.

### Fix

Replace the file with real assertions against the running dev server:

```ts
// e2e/smoke.spec.ts
import { test, expect } from '@playwright/test'

test('app loads with terminal and controls visible', async ({ page }) => {
  await page.goto('/')  // resolves to http://localhost:5173 via baseURL
  await expect(page).toHaveTitle(/serial/i)
  await expect(page.getByRole('combobox', { name: /backend/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /connect/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /connect/i })).toBeDisabled()
  await expect(page.locator('.terminal-container')).toBeVisible()
  // terminal pane must have been sized — xterm canvas has non-zero area
  const box = await page.locator('.terminal-container').boundingBox()
  expect(box!.width).toBeGreaterThan(100)
  expect(box!.height).toBeGreaterThan(50)
})
```

Note: `navigator.serial` and `navigator.usb` are both undefined on first load
(no `addInitScript` in this test), so `isAvailable()` returns false for both
backends, making Connect disabled. That is the correct baseline.

### Commits

```
test(e2e): replace about:blank placeholder with real app smoke test
```

---

## Acceptance criteria

- [ ] Typing characters with local echo on appears in terminal immediately
- [ ] Typing characters with local echo off appears only when device echoes back
- [ ] Resizing the browser window causes terminal to reflow to fill the pane
- [ ] `npm run test:e2e` runs smoke test and it passes (dev server starts, page loads)
- [ ] `npm test` passes (all Vitest assertions including new Terminal tests)
- [ ] `npm run typecheck` clean
- [ ] `npm run lint` clean
- [ ] Branch merged into main with `--no-ff`
