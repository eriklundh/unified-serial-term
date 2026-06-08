<template>
  <div class="connection-select">
    <template v-if="availableFactories.length > 0">
      <label
        for="connection-select"
        class="connection-label"
      >Serial connect:</label>
      <select
        id="connection-select"
        data-testid="connection-select"
        :value="modelValue"
        :disabled="disabled"
        @change="onChange"
        @focus="emit('refresh')"
      >
        <optgroup
          v-if="paired.length > 0"
          label="Paired devices"
        >
          <option
            v-for="device in paired"
            :key="device.key"
            :value="`paired:${device.key}`"
          >
            {{ device.label }}
          </option>
        </optgroup>
        <optgroup label="Connect a new device">
          <option
            v-for="factory in availableFactories"
            :key="factory.id"
            :value="factory.id"
          >
            {{ factory.displayName }}
          </option>
        </optgroup>
      </select>
    </template>
    <span
      v-else
      data-testid="no-backend-msg"
      class="no-backend-msg"
    >
      This browser doesn't support serial-over-USB; use Chromium.
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { SerialBackendFactory } from '../backends/SerialBackend'

/** A device already paired (Web Serial port or WebUSB device) and openable. */
export interface PairedDevice {
  /** Stable within a render: `${backendId}#${index}`. */
  key: string
  /** Human-readable name derived from VID:PID. */
  label: string
}

const props = defineProps<{
  factories: SerialBackendFactory[]
  paired: PairedDevice[]
  /** A backend id (Request action) or `paired:<key>`. */
  modelValue: string
  disabled: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  refresh: []
}>()

const availableFactories = computed(() => props.factories.filter((f) => f.isAvailable()))

function onChange(event: Event) {
  emit('update:modelValue', (event.target as HTMLSelectElement).value)
}
</script>

<style scoped>
.connection-select {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.connection-label {
  font-size: 0.875rem;
  color: var(--muted, #9d9d9d);
}

select {
  padding: 0.2rem 0.4rem;
  background: var(--surface-2, #3c3c3c);
  color: var(--fg, #d4d4d4);
  border: 1px solid var(--border, #555);
  border-radius: 2px;
  font-size: 0.875rem;
  cursor: pointer;
  max-width: 16rem;
}

select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.no-backend-msg {
  font-size: 0.875rem;
  color: var(--danger, #f48771);
}
</style>
