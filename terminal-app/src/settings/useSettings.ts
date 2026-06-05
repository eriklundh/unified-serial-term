import { ref, watch } from 'vue'
import type { SerialOptions } from '../backends/SerialBackend'

export interface Settings extends SerialOptions {
  baudRate: number
  dataBits: 7 | 8
  parity: 'none' | 'even' | 'odd'
  stopBits: 1 | 2
  flowControl: 'none' | 'hardware'
  localEcho: boolean
}

const DEFAULTS: Settings = {
  baudRate: 115200,
  dataBits: 8,
  parity: 'none',
  stopBits: 1,
  flowControl: 'none',
  localEcho: false,
}

const STORAGE_KEYS = {
  baudRate: 'settings.baudRate',
  dataBits: 'settings.dataBits',
  parity: 'settings.parity',
  stopBits: 'settings.stopBits',
  flowControl: 'settings.flowControl',
  localEcho: 'settings.localEcho',
} as const

function load(): Settings {
  const baud = Number(localStorage.getItem(STORAGE_KEYS.baudRate))
  const bits = Number(localStorage.getItem(STORAGE_KEYS.dataBits))
  const stop = Number(localStorage.getItem(STORAGE_KEYS.stopBits))
  return {
    baudRate: baud > 0 ? baud : DEFAULTS.baudRate,
    dataBits: (bits === 7 || bits === 8 ? bits : DEFAULTS.dataBits) as 7 | 8,
    parity: (localStorage.getItem(STORAGE_KEYS.parity) as Settings['parity'] | null) ?? DEFAULTS.parity,
    stopBits: (stop === 1 || stop === 2 ? stop : DEFAULTS.stopBits) as 1 | 2,
    flowControl:
      (localStorage.getItem(STORAGE_KEYS.flowControl) as Settings['flowControl'] | null) ??
      DEFAULTS.flowControl,
    localEcho: localStorage.getItem(STORAGE_KEYS.localEcho) === 'true',
  }
}

function save(s: Settings): void {
  localStorage.setItem(STORAGE_KEYS.baudRate, String(s.baudRate))
  localStorage.setItem(STORAGE_KEYS.dataBits, String(s.dataBits))
  localStorage.setItem(STORAGE_KEYS.parity, s.parity)
  localStorage.setItem(STORAGE_KEYS.stopBits, String(s.stopBits))
  localStorage.setItem(STORAGE_KEYS.flowControl, s.flowControl)
  localStorage.setItem(STORAGE_KEYS.localEcho, String(s.localEcho))
}

function clearStorage(): void {
  for (const key of Object.values(STORAGE_KEYS)) {
    localStorage.removeItem(key)
  }
}

export function useSettings() {
  const settings = ref<Settings>(load())

  let skipNextSave = false

  watch(
    settings,
    (s) => {
      if (skipNextSave) {
        skipNextSave = false
        return
      }
      save(s)
    },
    { deep: true },
  )

  function reset() {
    clearStorage()
    skipNextSave = true
    settings.value = { ...DEFAULTS }
  }

  return { settings, reset }
}
