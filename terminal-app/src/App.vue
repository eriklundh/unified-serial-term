<template>
  <div class="app">
    <header class="app-header">
      <div class="controls">
        <BackendSelector
          v-model="selectedId"
          :factories="factories"
          :disabled="isConnected"
        />
        <button
          v-if="!isConnected"
          data-testid="connect-btn"
          :disabled="!canConnect || isConnecting"
          @click="connect"
        >
          {{ isConnecting ? 'Connecting…' : 'Connect' }}
        </button>
        <button
          v-if="isConnected"
          data-testid="disconnect-btn"
          @click="disconnect"
        >
          Disconnect
        </button>
        <span
          v-if="statusMsg"
          data-testid="status-msg"
          class="status-msg"
        >{{ statusMsg }}</span>
      </div>
      <div
        data-testid="settings-panel"
        class="settings-panel"
      >
        <label class="setting">
          <span>Baud</span>
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
        <label class="setting">
          <span>Data</span>
          <select
            v-model.number="settings.dataBits"
            data-testid="databits-select"
            :disabled="isConnected"
          >
            <option :value="8">8</option>
            <option :value="7">7</option>
          </select>
        </label>
        <label class="setting">
          <span>Parity</span>
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
        <label class="setting">
          <span>Stop</span>
          <select
            v-model.number="settings.stopBits"
            data-testid="stopbits-select"
            :disabled="isConnected"
          >
            <option :value="1">1</option>
            <option :value="2">2</option>
          </select>
        </label>
        <label class="setting">
          <span>Flow</span>
          <select
            v-model="settings.flowControl"
            data-testid="flowcontrol-select"
            :disabled="isConnected"
          >
            <option value="none">None</option>
            <option value="hardware">RTS/CTS</option>
          </select>
        </label>
        <label class="setting setting--inline">
          <input
            v-model="settings.localEcho"
            data-testid="echo-checkbox"
            type="checkbox"
          >
          <span>Echo</span>
        </label>
        <button
          data-testid="reset-btn"
          class="reset-btn"
          :disabled="isConnected"
          @click="reset"
        >
          Reset
        </button>
      </div>
    </header>
    <main class="terminal-pane">
      <Terminal
        :readable="activeReadable ?? undefined"
        :writable="activeWritable ?? undefined"
        :local-echo="settings.localEcho"
        @disconnect="disconnect"
      />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, inject, computed, watch, onMounted } from 'vue'
import Terminal from './components/Terminal.vue'
import BackendSelector from './components/BackendSelector.vue'
import { FACTORIES_KEY } from './backends/injectionKeys'
import { resolveFactory, writePreference } from './settings/backendPreference'
import { useSettings } from './settings/useSettings'
import type { BackendId, SerialBackend } from './backends/SerialBackend'

const BAUD_RATES = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]

const factories = inject(FACTORIES_KEY, [])
const selectedId = ref<BackendId | null>(resolveFactory(factories)?.id ?? null)

watch(selectedId, (id) => {
  if (id) writePreference(id)
})

const selectedFactory = computed(() => factories.find((f) => f.id === selectedId.value) ?? null)

const { settings, reset } = useSettings()

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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const lower = msg.toLowerCase()
    if (lower.includes('cancel') || lower.includes('no device selected')) {
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
  try {
    await backend.value.close()
  } catch {
    // port already dead — proceed with cleanup
  } finally {
    backend.value = null
    isConnected.value = false
    statusMsg.value = null
  }
}

onMounted(async () => {
  if (!selectedFactory.value) return
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
  background: #1e1e1e;
  color: #d4d4d4;
  font-family: monospace;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.app-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 1rem;
  background: #252526;
  border-bottom: 1px solid #3e3e42;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

button {
  padding: 0.25rem 0.75rem;
  background: #0e639c;
  color: #fff;
  border: none;
  border-radius: 2px;
  cursor: pointer;
  font-size: 0.875rem;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

button[data-testid='disconnect-btn'] {
  background: #6c3030;
}

.reset-btn {
  background: #4a3f3f;
  font-size: 0.75rem;
  padding: 0.15rem 0.5rem;
}

.status-msg {
  font-size: 0.75rem;
  color: #9cdcfe;
}

.settings-panel {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
  flex-wrap: wrap;
}

.setting {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: #9d9d9d;
}

.setting--inline {
  flex-direction: row;
  gap: 0.25rem;
}

.setting select {
  padding: 0.15rem 0.3rem;
  background: #3c3c3c;
  color: #d4d4d4;
  border: 1px solid #555;
  border-radius: 2px;
  font-size: 0.75rem;
}

.setting select:disabled,
.setting input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.terminal-pane {
  flex: 1;
  overflow: hidden;
  padding: 0.25rem;
}
</style>
