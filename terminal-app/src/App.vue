<template>
  <div
    ref="appRef"
    class="app"
  >
    <header
      ref="toolbarRef"
      class="toolbar"
    >
      <div class="toolbar__group">
        <ConnectionSelect
          v-model="connectionTarget"
          :factories="factories"
          :paired="pairedDevices"
          :disabled="isConnected"
          @refresh="refreshPaired"
        />
        <select
          v-model.number="settings.baudRate"
          data-testid="baud-select"
          class="toolbar__select"
          aria-label="Baud rate"
        >
          <option
            v-for="b in BAUD_RATES"
            :key="b"
            :value="b"
          >
            {{ b }}
          </option>
        </select>
        <button
          v-if="!isConnected"
          class="btn btn--primary"
          data-testid="connect-btn"
          :disabled="!canConnect || isConnecting"
          @click="onConnect"
        >
          {{ isConnecting ? 'Connecting…' : 'Connect' }}
        </button>
        <button
          v-if="isConnected"
          class="btn btn--danger"
          data-testid="disconnect-btn"
          @click="onDisconnect"
        >
          Disconnect
        </button>
        <button
          class="btn"
          type="button"
          data-testid="serial-settings-btn"
          :aria-expanded="serialSettingsOpen"
          aria-controls="serial-settings-dialog"
          title="Serial Settings"
          @click="serialSettingsOpen = !serialSettingsOpen"
        >
          Serial Settings
        </button>
        <button
          class="btn"
          type="button"
          data-testid="clear-btn"
          title="Clear terminal"
          @click="onClear"
        >
          Clear
        </button>
        <button
          class="btn"
          type="button"
          data-testid="download-btn"
          title="Download terminal contents"
          @click="onDownload"
        >
          Download
        </button>
        <button
          v-if="fullscreenEnabled"
          class="btn btn--icon"
          type="button"
          data-testid="fullscreen-btn"
          :title="isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'"
          :aria-label="isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'"
          @click="onFullscreen"
        >
          <span aria-hidden="true">{{ isFullscreen ? '⊡' : '⛶' }}</span>
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
        :bell="bell"
        :bell-style="bellStyle"
        @disconnect="disconnect"
        @open-search="openSearch"
        @first-activity="hideSplash"
      />
      <SearchBar
        v-if="searchOpen"
        @find-next="(t) => terminalRef?.findNext(t)"
        @find-prev="(t) => terminalRef?.findPrevious(t)"
        @close="closeSearch"
      />
      <Splash
        v-if="splashVisible"
        @dont-show-again="onDontShowAgain"
      />
    </main>

    <SerialSettings
      :settings="settings"
      :is-connected="isConnected"
      :open="serialSettingsOpen"
      @update:settings="s => { settings = s }"
      @close="serialSettingsOpen = false"
      @reset="reset"
    />

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
          <label class="field field--check">
            <input
              v-model="bell"
              type="checkbox"
              data-testid="bell-enabled"
            >
            <span class="field__label">Bell</span>
          </label>
          <label class="field">
            <span class="field__label">Bell style</span>
            <select
              v-model="bellStyle"
              data-testid="bell-style"
              :disabled="!bell"
            >
              <option
                v-for="s in BELL_STYLES"
                :key="s"
                :value="s"
              >{{ s }}</option>
            </select>
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
            Connection
          </h3>
          <p class="group__hint">
            Revoke browser access to all previously paired serial ports and USB
            devices. You will need to re-select a device on the next connect.
          </p>
          <div class="row">
            <button
              class="btn btn--subtle"
              type="button"
              data-testid="forget-btn"
              :disabled="forgetting"
              @click="forgetAllPaired"
            >
              {{ forgetting ? 'Forgetting…' : 'Forget all paired devices' }}
            </button>
          </div>
        </section>

        <section class="group">
          <h3 class="group__title">
            About
          </h3>
          <p class="group__hint">
            Unified Serial Console — browser-based terminal over WebUSB and Web Serial.
          </p>
          <p class="group__hint">
            <a
              href="https://github.com/eriklundh/unified-serial-term"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="about-source-link"
              class="about-link"
            >github.com/eriklundh/unified-serial-term</a>
          </p>
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
import SearchBar from './components/SearchBar.vue'
import Splash from './components/Splash.vue'
import ConnectionSelect from './components/ConnectionSelect.vue'
import SerialSettings from './components/SerialSettings.vue'
import type { PairedDevice } from './components/ConnectionSelect.vue'
import { FACTORIES_KEY } from './backends/injectionKeys'
import { resolveFactory, writePreference } from './settings/backendPreference'
import { useSettings } from './settings/useSettings'
import { useAppearance, SYSTEM_MONO } from './settings/useAppearance'
import { useBell, BELL_STYLES } from './settings/useBell'
import { matchesHotkey, eventToHotkey } from './settings/hotkey'
import { exportSettings, importSettings, requestPersistentStorage } from './settings/io'
import { isAutoReconnectSuppressed, suppressAutoReconnect, allowAutoReconnect } from './settings/reconnect'
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
const appRef = ref<HTMLElement | null>(null)
const factories = inject(FACTORIES_KEY, [])

// The connection dropdown's value: either a backend id (a "Request…" action) or
// `paired:<key>` for an already-paired device. Default to the preferred backend.
const connectionTarget = ref<string>(resolveFactory(factories)?.id ?? '')

// Persist the chosen *backend* (a Request action) so a reload defaults back to
// it. A transient paired-device pick (`paired:<key>`) is not a preference.
watch(connectionTarget, (t) => {
  if (t && !t.startsWith('paired:')) writePreference(t as BackendId)
})

// The factory behind a "Request…" target (null while a paired device is chosen).
const selectedFactory = computed(() =>
  connectionTarget.value.startsWith('paired:')
    ? null
    : (factories.find((f) => f.id === connectionTarget.value) ?? null),
)

// Already-paired devices across both backends, shown in the dropdown. Refreshed
// when the dropdown is focused so a newly-plugged device appears on open. The
// listed backend instances are kept so Connect can open the exact one chosen.
const pairedDevices = ref<PairedDevice[]>([])
const pairedBackends = new Map<string, SerialBackend>()

async function refreshPaired() {
  const next: PairedDevice[] = []
  pairedBackends.clear()
  for (const factory of factories) {
    if (!factory.isAvailable()) continue
    let list: SerialBackend[]
    try {
      list = await factory.listPaired()
    } catch {
      continue // a backend that can't enumerate just contributes nothing
    }
    list.forEach((b, i) => {
      const key = `${factory.id}#${i}`
      pairedBackends.set(key, b)
      next.push({ key, label: b.label })
    })
  }
  pairedDevices.value = next
}

const { settings, reset, reload: reloadSettings } = useSettings()

const { appearance, reload: reloadAppearance } = useAppearance()
const { bell, bellStyle } = useBell()
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

// --- Serial Settings popover -------------------------------------------------
const serialSettingsOpen = ref(false)

watch(serialSettingsOpen, (open) => {
  if (!open) terminalRef.value?.focus()
})

// --- Toolbar focus return ----------------------------------------------------
// A momentary toolbar button parks focus on itself when clicked. Wrap such
// handlers so focus returns to the terminal — the canonical focus owner — once
// the action settles, so typing resumes immediately. (Toggle controls like the
// settings gear are NOT wrapped; the drawer manages its own focus via the
// drawerOpen watch above.)
function withTerminalFocus<A extends unknown[]>(fn: (...args: A) => unknown) {
  return (...args: A): void => {
    let result: unknown
    try {
      result = fn(...args)
    } finally {
      Promise.resolve(result).then(
        () => terminalRef.value?.focus(),
        () => terminalRef.value?.focus(),
      )
    }
  }
}

// --- Clear terminal + hotkey -------------------------------------------------
function clearTerminal() {
  terminalRef.value?.clear()
}
const onClear = withTerminalFocus(clearTerminal)

// --- Download terminal contents ----------------------------------------------
function downloadTerminal() {
  const text = terminalRef.value?.serialize() ?? ''
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  a.download = `console-${stamp}.txt`
  a.click()
  URL.revokeObjectURL(url)
}
const onDownload = withTerminalFocus(downloadTerminal)

// --- Fullscreen toggle -------------------------------------------------------
const isFullscreen = ref(false)
const fullscreenEnabled = ref(document.fullscreenEnabled)

function onFullscreenChange() {
  isFullscreen.value = document.fullscreenElement !== null
}
onMounted(() => document.addEventListener('fullscreenchange', onFullscreenChange))
onUnmounted(() => document.removeEventListener('fullscreenchange', onFullscreenChange))

async function toggleFullscreen() {
  if (document.fullscreenElement) {
    await document.exitFullscreen()
  } else {
    await appRef.value?.requestFullscreen()
  }
}
const onFullscreen = withTerminalFocus(toggleFullscreen)

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

// --- Forget paired devices ---------------------------------------------------
// w3c-web-usb types are incomplete (forgetDevice missing); Web Serial types
// are not in the installed type defs at all. Use a local structural cast.
interface _PortWithForget { forget(): Promise<void> }
interface _SerialWithPorts { getPorts(): Promise<_PortWithForget[]> }
interface _UsbWithForget<D> {
  getDevices(): Promise<D[]>
  forgetDevice(device: D): Promise<void>
}
type _NavForget = {
  serial?: _SerialWithPorts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  usb?: _UsbWithForget<any>
}

const forgetting = ref(false)

async function forgetAllPaired() {
  if (forgetting.value) return
  forgetting.value = true
  try {
    const nav = navigator as unknown as _NavForget
    if (nav.serial) {
      const ports = await nav.serial.getPorts()
      await Promise.all(ports.map((p) => p.forget()))
    }
    if (nav.usb) {
      const devices = await nav.usb.getDevices()
      await Promise.all(devices.map((d) => nav.usb!.forgetDevice(d)))
    }
    await refreshPaired()
  } finally {
    forgetting.value = false
  }
}

// --- Splash ------------------------------------------------------------------
const splashVisible = ref(!localStorage.getItem('splash-dismissed'))

function hideSplash() {
  splashVisible.value = false
}

function onDontShowAgain() {
  localStorage.setItem('splash-dismissed', 'true')
  splashVisible.value = false
}

// --- Search ------------------------------------------------------------------
const searchOpen = ref(false)

function openSearch() {
  searchOpen.value = true
}

function closeSearch() {
  searchOpen.value = false
  terminalRef.value?.focus()
}

// App-level shortcuts. Capture phase so we intercept before xterm's own keydown
// handler runs (which would otherwise send the keys to the device).
function onKeydown(e: KeyboardEvent) {
  if (capturingHotkey.value) return
  if (e.key === 'f' && e.ctrlKey && !e.altKey && !e.metaKey) {
    e.preventDefault()
    e.stopPropagation()
    openSearch()
    return
  }
  if (e.key === 'Escape' && searchOpen.value) {
    closeSearch()
    return
  }
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
const canConnect = computed(() => {
  if (isConnected.value || isConnecting.value) return false
  if (connectionTarget.value.startsWith('paired:')) {
    return pairedBackends.has(connectionTarget.value.slice('paired:'.length))
  }
  return !!selectedFactory.value
})
const activeReadable = computed(() => backend.value?.readable ?? null)
const activeWritable = computed(() => backend.value?.writable ?? null)

// When port-config settings change while a connection is open, push them to
// the device immediately so the user doesn't need to disconnect to apply them.
watch(
  settings,
  async (s) => {
    if (isConnected.value && backend.value) {
      try {
        await backend.value.reconfigure(s)
      } catch (err) {
        statusMsg.value = `Reconfigure failed: ${err instanceof Error ? err.message : String(err)}`
      }
    }
  },
  { deep: true },
)

async function connect() {
  if (isConnecting.value) return
  isConnecting.value = true
  statusMsg.value = null
  // Hoisted so the catch block can call forget() on a stale backend.
  let b: SerialBackend | undefined
  try {
    // A paired entry opens that exact device; a Request action pops the picker.
    if (connectionTarget.value.startsWith('paired:')) {
      const found = pairedBackends.get(connectionTarget.value.slice('paired:'.length))
      if (!found) return
      b = found
    } else {
      if (!selectedFactory.value) return
      b = await selectedFactory.value.pickDevice()
    }
    await b.open(settings.value)
    backend.value = b
    isConnected.value = true
    // Explicit connect — a later reload should auto-reconnect again.
    allowAutoReconnect()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const lower = msg.toLowerCase()
    if (lower.includes('cancel') || lower.includes('no device selected') || lower.includes('no port selected')) {
      // user dismissed the picker — silent
    } else if (lower.includes('claiminterface') || lower.includes('unable to claim')) {
      // Stale USB device handle (e.g. device re-enumerated after a bind/unbind
      // cycle). Forget the grant so the entry disappears from the dropdown.
      await b?.forget?.()
      await refreshPaired()
      statusMsg.value = 'Stale device removed. Select it again from the dropdown or use Request…'
    } else if (lower.includes('access denied') || lower.includes('access to the device')) {
      statusMsg.value = 'Access denied — device is claimed by the OS FTDI driver. Use Zadig (Windows) or unbind ftdi_sio (Linux). See Lab Setup guide.'
    } else {
      statusMsg.value = `Connection failed: ${msg}`
    }
  } finally {
    isConnecting.value = false
  }
}

// The Disconnect button. An explicit disconnect is sticky across reloads, so
// remember it; the Terminal's unexpected-drop path calls disconnect() directly
// and deliberately leaves auto-reconnect enabled.
function disconnectByUser() {
  suppressAutoReconnect()
  return disconnect()
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
  }
}
const onConnect = withTerminalFocus(connect)
const onDisconnect = withTerminalFocus(disconnectByUser)

onMounted(async () => {
  const factory = resolveFactory(factories)
  if (!factory) return
  // Honour a previous explicit Disconnect — don't silently reconnect to the
  // still-paired device just because the page was reloaded.
  if (isAutoReconnectSuppressed()) return
  isConnecting.value = true
  try {
    const paired = await factory.listPaired()
    const device = paired[0]
    if (!device) return
    try {
      await device.open(settings.value)
    } catch (err) {
      // A rejected open() can still leave an OS handle claimed; release it so
      // the next manual connect doesn't fail on a busy port.
      await device.close().catch(() => {})
      throw err
    }
    // open() resolving is not proof of a usable port. Trust the backend's own
    // isOpen, and tear down anything that opened but isn't actually ready
    // rather than showing a live connection the user can't use.
    if (!device.isOpen) {
      await device.close().catch(() => {})
      return
    }
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

.toolbar__select {
  padding: 0.2rem 0.4rem;
  background: var(--surface-2, #3c3c3c);
  color: var(--fg, #d4d4d4);
  border: 1px solid var(--border, #555);
  border-radius: 2px;
  font: inherit;
  font-size: 0.875rem;
  cursor: pointer;
}

.toolbar__select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
  position: relative;
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
  /* Override the UA <dialog> `height: fit-content`, which would let the panel
     grow past the viewport bottom on short screens — hiding the lower
     controls with no way to scroll. `height: auto` lets the top/bottom insets
     clamp the height, so `overflow: auto` (below) yields a real scrollbar. */
  height: auto;
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

.about-link {
  color: var(--accent, #3b82f6);
  font-size: 0.8rem;
  text-decoration: none;
}

.about-link:hover {
  text-decoration: underline;
}
</style>
