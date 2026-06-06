<template>
  <div class="app">
    <header
      ref="toolbarRef"
      class="toolbar"
    >
      <div class="toolbar__group">
        <BackendSelector
          v-model="selectedId"
          :factories="factories"
          :disabled="isConnected"
        />
        <button
          v-if="!isConnected"
          class="btn btn--primary"
          data-testid="connect-btn"
          :disabled="!canConnect || isConnecting"
          @click="connect"
        >
          {{ isConnecting ? 'Connecting…' : 'Connect' }}
        </button>
        <button
          v-if="isConnected"
          class="btn btn--danger"
          data-testid="disconnect-btn"
          @click="disconnect"
        >
          Disconnect
        </button>
        <button
          class="btn"
          type="button"
          data-testid="clear-btn"
          title="Clear terminal"
          @click="clearTerminal"
        >
          Clear
        </button>
      </div>

      <span
        v-if="statusMsg"
        data-testid="status-msg"
        class="status"
      >{{ statusMsg }}</span>

      <button
        class="btn btn--icon"
        type="button"
        data-testid="settings-btn"
        :aria-expanded="drawerOpen"
        aria-controls="settings-drawer"
        title="Settings"
        @click="drawerOpen = !drawerOpen"
      >
        <span aria-hidden="true">⚙</span> Settings
      </button>
    </header>

    <main class="terminal-pane">
      <Terminal
        ref="terminalRef"
        :readable="activeReadable ?? undefined"
        :writable="activeWritable ?? undefined"
        :local-echo="settings.localEcho"
        :font-family="appearance.fontFamily"
        :font-size="appearance.fontSize"
        :theme="currentTheme.xterm"
        @disconnect="disconnect"
      />
    </main>

    <dialog
      id="settings-drawer"
      class="drawer"
      data-testid="settings-drawer"
      aria-label="Settings"
      :open="drawerOpen"
      :inert="!drawerOpen"
    >
      <div
        data-testid="settings-panel"
        class="drawer__panel"
      >
        <div class="drawer__head">
          <h2 class="drawer__title">
            Settings
          </h2>
          <button
            class="btn btn--icon"
            type="button"
            data-testid="drawer-close"
            aria-label="Close settings"
            @click="drawerOpen = false"
          >
            ✕
          </button>
        </div>

        <section class="group">
          <h3 class="group__title">
            Connection
          </h3>
          <label class="field">
            <span class="field__label">Baud</span>
            <select
              v-model.number="settings.baudRate"
              data-testid="baud-select"
              :disabled="isConnected"
            >
              <option
                v-for="b in BAUD_RATES"
                :key="b"
                :value="b"
              >{{ b }}</option>
            </select>
          </label>
          <label class="field">
            <span class="field__label">Data bits</span>
            <select
              v-model.number="settings.dataBits"
              data-testid="databits-select"
              :disabled="isConnected"
            >
              <option :value="8">8</option>
              <option :value="7">7</option>
            </select>
          </label>
          <label class="field">
            <span class="field__label">Parity</span>
            <select
              v-model="settings.parity"
              data-testid="parity-select"
              :disabled="isConnected"
            >
              <option value="none">None</option>
              <option value="even">Even</option>
              <option value="odd">Odd</option>
            </select>
          </label>
          <label class="field">
            <span class="field__label">Stop bits</span>
            <select
              v-model.number="settings.stopBits"
              data-testid="stopbits-select"
              :disabled="isConnected"
            >
              <option :value="1">1</option>
              <option :value="2">2</option>
            </select>
          </label>
          <label class="field">
            <span class="field__label">Flow control</span>
            <select
              v-model="settings.flowControl"
              data-testid="flowcontrol-select"
              :disabled="isConnected"
            >
              <option value="none">None</option>
              <option value="hardware">RTS/CTS</option>
            </select>
          </label>
          <label class="field field--check">
            <input
              v-model="settings.localEcho"
              data-testid="echo-checkbox"
              type="checkbox"
              @change="terminalRef?.focus()"
            >
            <span class="field__label">Local echo</span>
          </label>
          <button
            class="btn btn--subtle"
            data-testid="reset-btn"
            :disabled="isConnected"
            @click="reset"
          >
            Reset connection defaults
          </button>
        </section>

        <section class="group">
          <h3 class="group__title">
            Appearance
          </h3>
          <label class="field">
            <span class="field__label">Theme</span>
            <select
              v-model="appearance.themeId"
              data-testid="theme-select"
            >
              <option
                v-for="t in THEMES"
                :key="t.id"
                :value="t.id"
              >{{ t.label }}</option>
            </select>
          </label>
          <label class="field">
            <span class="field__label">Font</span>
            <select
              v-model="appearance.fontFamily"
              data-testid="font-select"
            >
              <option
                v-for="f in FONT_CHOICES"
                :key="f.label"
                :value="f.value"
              >{{ f.label }}</option>
            </select>
          </label>
          <label class="field">
            <span class="field__label">Font size</span>
            <input
              v-model.number="appearance.fontSize"
              data-testid="fontsize-input"
              type="number"
              min="8"
              max="32"
              step="1"
            >
          </label>
          <div class="field">
            <span class="field__label">Clear hotkey</span>
            <div class="hotkey">
              <code data-testid="hotkey-value">{{ appearance.clearHotkey || 'Off' }}</code>
              <button
                class="btn btn--subtle"
                type="button"
                data-testid="hotkey-rebind"
                @click="startRebind"
              >
                {{ capturingHotkey ? 'Press a key…' : 'Rebind' }}
              </button>
              <button
                class="btn btn--subtle"
                type="button"
                data-testid="hotkey-off"
                @click="hotkeyOff"
              >
                Off
              </button>
            </div>
          </div>
        </section>

        <section class="group">
          <h3 class="group__title">
            Storage
          </h3>
          <p class="group__hint">
            Settings are saved in this browser. Export a file to move them to
            another machine or to survive a reset.
          </p>
          <div class="row">
            <button
              class="btn btn--subtle"
              type="button"
              data-testid="export-btn"
              @click="exportSettingsFile"
            >
              Export…
            </button>
            <label class="btn btn--subtle">
              Import…
              <input
                data-testid="import-input"
                type="file"
                accept="application/json,.json"
                hidden
                @change="importSettingsFile"
              >
            </label>
            <button
              class="btn btn--subtle"
              type="button"
              data-testid="persist-btn"
              @click="makePersistent"
            >
              Keep on this device
            </button>
          </div>
          <span
            v-if="storageMsg"
            data-testid="storage-msg"
            class="group__hint"
          >{{ storageMsg }}</span>
        </section>
      </div>
    </dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, inject, computed, watch, onMounted, onUnmounted } from 'vue'
import Terminal from './components/Terminal.vue'
import BackendSelector from './components/BackendSelector.vue'
import { FACTORIES_KEY } from './backends/injectionKeys'
import { resolveFactory, writePreference } from './settings/backendPreference'
import { useSettings } from './settings/useSettings'
import { useAppearance, SYSTEM_MONO } from './settings/useAppearance'
import { matchesHotkey, eventToHotkey } from './settings/hotkey'
import { exportSettings, importSettings, requestPersistentStorage } from './settings/io'
import { THEMES, getTheme, applyThemeTokens } from './themes'
import type { BackendId, SerialBackend } from './backends/SerialBackend'

const BAUD_RATES = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]

const FONT_CHOICES = [
  { label: 'System monospace', value: SYSTEM_MONO },
  { label: 'Source Code Pro', value: `'Source Code Pro', ${SYSTEM_MONO}` },
  { label: 'JetBrains Mono', value: `'JetBrains Mono', ${SYSTEM_MONO}` },
  { label: 'Fira Code', value: `'Fira Code', ${SYSTEM_MONO}` },
  { label: 'Cascadia Code', value: `'Cascadia Code', ${SYSTEM_MONO}` },
  { label: 'IBM Plex Mono', value: `'IBM Plex Mono', ${SYSTEM_MONO}` },
]

const terminalRef = ref<InstanceType<typeof Terminal> | null>(null)
const toolbarRef = ref<HTMLElement | null>(null)
const factories = inject(FACTORIES_KEY, [])
const selectedId = ref<BackendId | null>(resolveFactory(factories)?.id ?? null)

watch(selectedId, (id) => {
  if (id) writePreference(id)
})

const selectedFactory = computed(() => factories.find((f) => f.id === selectedId.value) ?? null)

const { settings, reset, reload: reloadSettings } = useSettings()

const { appearance, reload: reloadAppearance } = useAppearance()
const currentTheme = computed(() => getTheme(appearance.value.themeId))
// Apply the theme's design tokens to the document root (chrome) immediately and
// on change; the terminal receives the xterm theme via the <Terminal> props.
watch(currentTheme, (t) => applyThemeTokens(t), { immediate: true })

// --- Settings drawer ---------------------------------------------------------
const drawerOpen = ref(false)

// Return keyboard focus to the terminal whenever the drawer closes, so typing
// resumes immediately instead of staying trapped on whatever control was last
// clicked inside the panel.
watch(drawerOpen, (open) => {
  if (!open) terminalRef.value?.focus()
})

// --- Clear terminal + hotkey -------------------------------------------------
function clearTerminal() {
  terminalRef.value?.clear()
  // Clicking the Clear button (or any toolbar control) parks focus on that
  // button; hand it back to the terminal so the user can keep typing.
  terminalRef.value?.focus()
}

const capturingHotkey = ref(false)
function startRebind() {
  if (capturingHotkey.value) return
  capturingHotkey.value = true
  window.addEventListener('keydown', captureHotkey, true)
}
function captureHotkey(e: KeyboardEvent) {
  e.preventDefault()
  e.stopPropagation()
  if (e.key === 'Escape') {
    stopRebind()
    return
  }
  const spec = eventToHotkey(e)
  if (!spec) return // modifier-only press; wait for a real key
  appearance.value.clearHotkey = spec
  stopRebind()
}
function stopRebind() {
  capturingHotkey.value = false
  window.removeEventListener('keydown', captureHotkey, true)
}
function hotkeyOff() {
  appearance.value.clearHotkey = ''
}

// App-level shortcuts. Capture phase so we intercept before xterm's own keydown
// handler runs (which would otherwise send the keys to the device).
function onKeydown(e: KeyboardEvent) {
  if (capturingHotkey.value) return
  if (e.key === 'Escape' && drawerOpen.value) {
    drawerOpen.value = false
    return
  }
  if (appearance.value.clearHotkey && matchesHotkey(e, appearance.value.clearHotkey)) {
    e.preventDefault()
    e.stopPropagation()
    clearTerminal()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown, true))

// Publish the toolbar's height as `--toolbar-h` so the drawer can sit *below*
// it (`inset: var(--toolbar-h) …`) instead of behind it. The toolbar wraps on
// narrow widths, so its height is dynamic — track it with a ResizeObserver.
let toolbarResizeObserver: ResizeObserver | null = null
function syncToolbarHeight() {
  const h = toolbarRef.value?.offsetHeight ?? 0
  document.documentElement.style.setProperty('--toolbar-h', `${h}px`)
}
onMounted(() => {
  syncToolbarHeight()
  if (typeof ResizeObserver !== 'undefined' && toolbarRef.value) {
    toolbarResizeObserver = new ResizeObserver(syncToolbarHeight)
    toolbarResizeObserver.observe(toolbarRef.value)
  }
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown, true)
  stopRebind()
  toolbarResizeObserver?.disconnect()
  toolbarResizeObserver = null
})

// --- Settings import/export/persistence --------------------------------------
const storageMsg = ref<string | null>(null)

function exportSettingsFile() {
  const blob = new Blob([exportSettings()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'serial-console-settings.json'
  a.click()
  URL.revokeObjectURL(url)
}

async function importSettingsFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const count = importSettings(await file.text())
    reloadSettings()
    reloadAppearance()
    storageMsg.value = `Imported ${count} setting(s).`
  } catch (err) {
    storageMsg.value = `Import failed: ${err instanceof Error ? err.message : String(err)}`
  } finally {
    input.value = ''
  }
}

async function makePersistent() {
  storageMsg.value = (await requestPersistentStorage())
    ? 'Storage will be kept on this device.'
    : 'Persistent storage was not granted by the browser.'
}

// --- Connection --------------------------------------------------------------
const backend = ref<SerialBackend | null>(null)
const isConnected = ref(false)
const isConnecting = ref(false)
const statusMsg = ref<string | null>(null)
const canConnect = computed(() => !!selectedFactory.value && !isConnected.value && !isConnecting.value)
const activeReadable = computed(() => backend.value?.readable ?? null)
const activeWritable = computed(() => backend.value?.writable ?? null)

async function connect() {
  if (!selectedFactory.value || isConnecting.value) return
  isConnecting.value = true
  statusMsg.value = null
  try {
    const b = await selectedFactory.value.pickDevice()
    await b.open(settings.value)
    backend.value = b
    isConnected.value = true
    terminalRef.value?.focus()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const lower = msg.toLowerCase()
    if (lower.includes('cancel') || lower.includes('no device selected') || lower.includes('no port selected')) {
      // user dismissed the picker — silent
    } else if (lower.includes('access denied') || lower.includes('access to the device')) {
      statusMsg.value = 'Access denied — device is claimed by the OS FTDI driver. Use Zadig (Windows) or unbind ftdi_sio (Linux). See Lab Setup guide.'
    } else {
      statusMsg.value = `Connection failed: ${msg}`
    }
  } finally {
    isConnecting.value = false
  }
}

async function disconnect() {
  if (!backend.value) return
  let closeError: string | null = null
  try {
    await backend.value.close()
  } catch (err) {
    // The port is being torn down regardless, but don't hide the failure: a
    // rejected close() can mean the OS handle wasn't released, which blocks
    // the next reconnect. Surface it rather than swallowing it silently.
    closeError = err instanceof Error ? err.message : String(err)
  } finally {
    backend.value = null
    isConnected.value = false
    statusMsg.value = closeError ? `Disconnect warning: ${closeError}` : null
    terminalRef.value?.focus()
  }
}

onMounted(async () => {
  if (!selectedFactory.value) return
  isConnecting.value = true
  try {
    const paired = await selectedFactory.value.listPaired()
    const device = paired[0]
    if (!device) return
    await device.open(settings.value)
    backend.value = device
    isConnected.value = true
    statusMsg.value = `Auto-reconnected to ${device.label}`
  } catch {
    // auto-reconnect failed silently
  } finally {
    isConnecting.value = false
  }
})
</script>

<style>
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html,
body,
#app {
  height: 100%;
  background: var(--bg, #1e1e1e);
  color: var(--fg, #e6e6e6);
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* --- Toolbar --------------------------------------------------------------- */
.toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: var(--surface, #252526);
  border-bottom: 1px solid var(--border, #3c3c3c);
  flex-shrink: 0;
  flex-wrap: wrap;
  /* Stay above the drawer so the toolbar (incl. the Settings toggle) is always
     clickable; the drawer then visually slides in below the toolbar bar. */
  position: relative;
  z-index: 20;
}

.toolbar__group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.status {
  margin-left: auto;
  font-size: 0.8rem;
  color: var(--muted, #9a9a9a);
  max-width: 50ch;
}

.status + .btn--icon {
  margin-left: 0;
}

.btn--icon {
  margin-left: auto;
}

/* --- Buttons --------------------------------------------------------------- */
.btn {
  font: inherit;
  font-size: 0.85rem;
  line-height: 1.2;
  padding: 0.35rem 0.7rem;
  border: 1px solid var(--border, #3c3c3c);
  border-radius: 6px;
  background: var(--surface-2, #2d2d30);
  color: var(--fg, #e6e6e6);
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease;
}

.btn:hover:not(:disabled) {
  border-color: var(--accent, #3b82f6);
}

.btn:focus-visible {
  outline: 2px solid var(--accent, #3b82f6);
  outline-offset: 1px;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn--primary {
  background: var(--accent, #3b82f6);
  color: var(--accent-fg, #fff);
  border-color: transparent;
}

.btn--danger {
  background: var(--danger, #ef4444);
  color: #fff;
  border-color: transparent;
}

.btn--subtle {
  background: transparent;
  font-size: 0.8rem;
  padding: 0.3rem 0.6rem;
}

.btn--icon {
  background: transparent;
}

/* --- Terminal -------------------------------------------------------------- */
.terminal-pane {
  flex: 1;
  overflow: hidden;
  padding: 0.25rem;
  background: var(--bg, #1e1e1e);
}

/* --- Settings drawer ------------------------------------------------------- */
.drawer {
  /* Override the UA `display:none` so the slide transition can run. */
  display: block;
  position: fixed;
  /* Sit below the toolbar (height published as --toolbar-h) so the drawer's
     own header — title + ✕ close — is never occluded by the toolbar bar. */
  inset: var(--toolbar-h, 0) 0 0 auto;
  width: min(24rem, 100%);
  max-width: 100%;
  margin: 0;
  border: 0;
  border-left: 1px solid var(--border, #3c3c3c);
  background: var(--surface, #252526);
  color: var(--fg, #e6e6e6);
  box-shadow: -8px 0 24px rgb(0 0 0 / 0.25);
  transform: translateX(100%);
  transition: transform 0.2s ease;
  z-index: 10;
  overflow: auto;
}

.drawer[open] {
  transform: translateX(0);
}

@media (prefers-reduced-motion: reduce) {
  .drawer {
    transition: none;
  }
}

.drawer__panel {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.drawer__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.drawer__title {
  font-size: 1rem;
  font-weight: 600;
}

.group {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.group__title {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted, #9a9a9a);
  border-bottom: 1px solid var(--border, #3c3c3c);
  padding-bottom: 0.3rem;
}

.group__hint {
  font-size: 0.75rem;
  color: var(--muted, #9a9a9a);
  line-height: 1.4;
}

.field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.85rem;
}

.field--check {
  justify-content: flex-start;
  gap: 0.5rem;
}

.field__label {
  color: var(--muted, #9a9a9a);
}

.field select,
.field input[type='number'] {
  font: inherit;
  font-size: 0.85rem;
  padding: 0.25rem 0.4rem;
  background: var(--surface-2, #2d2d30);
  color: var(--fg, #e6e6e6);
  border: 1px solid var(--border, #3c3c3c);
  border-radius: 5px;
  min-width: 8rem;
}

.field input[type='number'] {
  min-width: 5rem;
  width: 5rem;
}

.field select:focus-visible,
.field input:focus-visible {
  outline: 2px solid var(--accent, #3b82f6);
  outline-offset: 1px;
}

.field :disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hotkey {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.hotkey code {
  font-family: ui-monospace, monospace;
  background: var(--surface-2, #2d2d30);
  border: 1px solid var(--border, #3c3c3c);
  border-radius: 4px;
  padding: 0.1rem 0.4rem;
  font-size: 0.8rem;
}

.row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
</style>
