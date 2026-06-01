<template>
  <div class="backend-selector">
    <template v-if="availableFactories.length > 0">
      <label for="backend-select" class="backend-label">Backend</label>
      <select
        id="backend-select"
        :value="modelValue ?? undefined"
        :disabled="disabled"
        @change="onChange"
      >
        <option
          v-for="factory in availableFactories"
          :key="factory.id"
          :value="factory.id"
        >
          {{ factory.displayName }}
        </option>
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
import type { BackendId, SerialBackendFactory } from '../backends/SerialBackend'

const props = defineProps<{
  factories: SerialBackendFactory[]
  modelValue: BackendId | null
  disabled: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: BackendId]
}>()

const availableFactories = computed(() => props.factories.filter((f) => f.isAvailable()))

function onChange(event: Event) {
  const select = event.target as HTMLSelectElement
  emit('update:modelValue', select.value as BackendId)
}
</script>

<style scoped>
.backend-selector {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.backend-label {
  font-size: 0.875rem;
  color: #9d9d9d;
}

select {
  padding: 0.2rem 0.4rem;
  background: #3c3c3c;
  color: #d4d4d4;
  border: 1px solid #555;
  border-radius: 2px;
  font-size: 0.875rem;
  cursor: pointer;
}

select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.no-backend-msg {
  font-size: 0.875rem;
  color: #f48771;
}
</style>
