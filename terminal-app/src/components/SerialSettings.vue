<template>
  <dialog
    class="drawer"
    data-testid="serial-settings-dialog"
    aria-label="Serial Settings"
    :open="open"
    :inert="!open"
  >
    <div class="drawer__panel">
      <div class="drawer__head">
        <h2 class="drawer__title">
          Serial Settings
        </h2>
        <button
          class="btn btn--icon"
          type="button"
          data-testid="serial-settings-close"
          aria-label="Close serial settings"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>

      <section class="group">
        <label class="field">
          <span class="field__label">Data bits</span>
          <select
            v-model.number="dataBits"
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
            v-model="parity"
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
            v-model.number="stopBits"
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
            v-model="flowControl"
            data-testid="flowcontrol-select"
            :disabled="isConnected"
          >
            <option value="none">None</option>
            <option value="hardware">RTS/CTS</option>
          </select>
        </label>
        <label class="field field--check">
          <input
            v-model="localEcho"
            type="checkbox"
            data-testid="echo-checkbox"
          >
          <span class="field__label">Local echo</span>
        </label>
        <button
          class="btn btn--subtle"
          type="button"
          data-testid="reset-btn"
          :disabled="isConnected"
          @click="$emit('reset')"
        >
          Reset connection defaults
        </button>
      </section>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Settings } from '../settings/useSettings'

const props = defineProps<{
  settings: Settings
  isConnected: boolean
  open: boolean
}>()

const emit = defineEmits<{
  'update:settings': [Settings]
  close: []
  reset: []
}>()

const dataBits = computed({
  get: () => props.settings.dataBits,
  set: (v: 7 | 8) => emit('update:settings', { ...props.settings, dataBits: v }),
})

const parity = computed({
  get: () => props.settings.parity,
  set: (v: Settings['parity']) => emit('update:settings', { ...props.settings, parity: v }),
})

const stopBits = computed({
  get: () => props.settings.stopBits,
  set: (v: 1 | 2) => emit('update:settings', { ...props.settings, stopBits: v }),
})

const flowControl = computed({
  get: () => props.settings.flowControl,
  set: (v: Settings['flowControl']) => emit('update:settings', { ...props.settings, flowControl: v }),
})

const localEcho = computed({
  get: () => props.settings.localEcho,
  set: (v: boolean) => emit('update:settings', { ...props.settings, localEcho: v }),
})
</script>

<style scoped>
/* Sit above the main settings drawer (z-index: 10) so both can be open at once. */
dialog {
  z-index: 15;
}
</style>
