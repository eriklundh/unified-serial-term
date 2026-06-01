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
          :disabled="!canConnect"
          @click="connect"
        >
          Connect
        </button>
        <button
          v-if="isConnected"
          data-testid="disconnect-btn"
          @click="disconnect"
        >
          Disconnect
        </button>
      </div>
      <div
        data-testid="settings-panel"
        class="settings-panel"
      >
        <!-- Settings panel — populated in Phase 5 -->
      </div>
    </header>
    <main class="terminal-pane">
      <Terminal
        :readable="activeReadable ?? undefined"
        :writable="activeWritable ?? undefined"
      />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, inject, computed, watch } from 'vue'
import Terminal from './components/Terminal.vue'
import BackendSelector from './components/BackendSelector.vue'
import { FACTORIES_KEY } from './backends/injectionKeys'
import { resolveFactory, writePreference } from './settings/backendPreference'
import type { BackendId, SerialBackend } from './backends/SerialBackend'

const factories = inject(FACTORIES_KEY, [])
const selectedId = ref<BackendId | null>(resolveFactory(factories)?.id ?? null)

watch(selectedId, (id) => {
  if (id) writePreference(id)
})

const selectedFactory = computed(() => factories.find((f) => f.id === selectedId.value) ?? null)

const backend = ref<SerialBackend | null>(null)
const isConnected = ref(false)
const canConnect = computed(() => !!selectedFactory.value && !isConnected.value)
const activeReadable = computed(() => backend.value?.readable ?? null)
const activeWritable = computed(() => backend.value?.writable ?? null)

const defaultSettings = {
  baudRate: 115200,
  dataBits: 8 as const,
  parity: 'none' as const,
  stopBits: 1 as const,
  flowControl: 'none' as const,
}

async function connect() {
  if (!selectedFactory.value) return
  try {
    const b = await selectedFactory.value.pickDevice()
    await b.open(defaultSettings)
    backend.value = b
    isConnected.value = true
  } catch {
    // user cancelled picker or open failed
  }
}

async function disconnect() {
  if (!backend.value) return
  await backend.value.close()
  backend.value = null
  isConnected.value = false
}
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

.settings-panel {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
}

.terminal-pane {
  flex: 1;
  overflow: hidden;
  padding: 0.25rem;
}
</style>
