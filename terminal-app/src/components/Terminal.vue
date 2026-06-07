<template>
  <div
    ref="container"
    class="terminal-container"
  />
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SerializeAddon } from '@xterm/addon-serialize'
import { SearchAddon } from '@xterm/addon-search'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { openLink } from '../utils/links'
import { createBellHandler } from '../utils/bell'
import type { BellStyle } from '../settings/useBell'
import '@xterm/xterm/css/xterm.css'

const props = defineProps<{
  readable?: ReadableStream<Uint8Array>
  writable?: WritableStream<Uint8Array>
  localEcho?: boolean
  fontFamily?: string
  fontSize?: number
  theme?: ITheme
  bell?: boolean
  bellStyle?: BellStyle
}>()

const emit = defineEmits<{
  data: [value: string]
  disconnect: []
  openSearch: []
}>()

const container = ref<HTMLElement | null>(null)
let terminal: Terminal | null = null
let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
let writer: WritableStreamDefaultWriter<Uint8Array> | null = null
let resizeObserver: ResizeObserver | null = null
let fitAddon: FitAddon | null = null
let serializeAddon: SerializeAddon | null = null
let searchAddon: SearchAddon | null = null

onMounted(() => {
  terminal = new Terminal({
    cursorBlink: true,
    fontSize: props.fontSize ?? 14,
    fontFamily: props.fontFamily ?? 'monospace',
    theme: props.theme,
  })
  fitAddon = new FitAddon()
  serializeAddon = new SerializeAddon()
  searchAddon = new SearchAddon()
  terminal.loadAddon(fitAddon)
  terminal.loadAddon(serializeAddon)
  terminal.loadAddon(searchAddon)
  terminal.loadAddon(new Unicode11Addon())
  terminal.unicode.activeVersion = '11'
  terminal.loadAddon(new WebLinksAddon(openLink))
  terminal.attachCustomKeyEventHandler((e) => {
    if (e.key === 'f' && e.ctrlKey && !e.altKey && !e.metaKey) {
      emit('openSearch')
      return false
    }
    return true
  })
  const flash = () => {
    const el = container.value
    if (!el) return
    el.classList.remove('bell-flash')
    void el.offsetWidth // restart animation if already flashing
    el.classList.add('bell-flash')
    setTimeout(() => el.classList.remove('bell-flash'), 200)
  }
  terminal.onBell(createBellHandler(
    () => props.bellStyle ?? 'visual',
    () => props.bell ?? true,
    flash,
  ))
  terminal.open(container.value!)
  // Expose handler for e2e tests (dev/test builds only).
  if (import.meta.env.DEV) {
    ;(window as Window & { __testOpenLink?: typeof openLink }).__testOpenLink = openLink
  }
  fitAddon.fit()
  resizeObserver = new ResizeObserver(() => fitAddon?.fit())
  resizeObserver.observe(container.value!)

  terminal.onData((data) => {
    emit('data', data)
    if (props.localEcho) {
      terminal!.write(new TextEncoder().encode(data))
    }
    if (writer) {
      writer.write(new TextEncoder().encode(data)).catch(() => {})
    }
  })
})

watch(
  () => props.readable,
  async (newReadable) => {
    await reader?.cancel()
    reader = null
    if (newReadable) {
      reader = newReadable.getReader()
      readLoop(reader)
    }
  },
  { immediate: true },
)

watch(
  () => props.writable,
  (newWritable) => {
    writer?.releaseLock()
    writer = null
    if (newWritable) {
      writer = newWritable.getWriter()
    }
  },
  { immediate: true },
)

// Apply appearance changes live (fires only on change, not on mount).
watch(
  () => [props.fontFamily, props.fontSize, props.theme] as const,
  ([family, size, theme]) => {
    if (!terminal) return
    if (family) terminal.options.fontFamily = family
    if (size) terminal.options.fontSize = size
    if (theme) terminal.options.theme = theme
    fitAddon?.fit()
  },
)

async function readLoop(r: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  let errored = false
  try {
    while (true) {
      const { value, done } = await r.read()
      if (done) break
      terminal?.write(value)
    }
  } catch {
    errored = true
  } finally {
    if (reader === r) {
      r.releaseLock()
      reader = null
    }
  }
  if (errored) emit('disconnect')
}

onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  terminal?.dispose()
  terminal = null
  void reader?.cancel() // fire-and-forget; component is destroyed
  writer?.releaseLock()
})

const SEARCH_OPTIONS = { incremental: false, caseSensitive: false, wholeWord: false, regex: false }

defineExpose({
  focus: () => terminal?.focus(),
  // reset() does a full RIS: wipes scrollback and homes the cursor to the
  // top-left. clear() keeps the prompt line and leaves the cursor in place.
  clear: () => terminal?.reset(),
  serialize: () => serializeAddon?.serialize() ?? '',
  findNext: (term: string) => searchAddon?.findNext(term, SEARCH_OPTIONS) ?? false,
  findPrevious: (term: string) => searchAddon?.findPrevious(term, SEARCH_OPTIONS) ?? false,
  clearSearch: () => searchAddon?.clearDecorations(),
})
</script>

<style scoped>
.terminal-container {
  width: 100%;
  height: 100%;
  position: relative;
}

.terminal-container::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: rgba(255, 255, 180, 0.4);
  opacity: 0;
}

@keyframes bell-flash {
  from { opacity: 1; }
  to { opacity: 0; }
}

.terminal-container.bell-flash::after {
  animation: bell-flash 0.2s ease-out forwards;
}
</style>
