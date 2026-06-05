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
import '@xterm/xterm/css/xterm.css'

const props = defineProps<{
  readable?: ReadableStream<Uint8Array>
  writable?: WritableStream<Uint8Array>
  localEcho?: boolean
  fontFamily?: string
  fontSize?: number
  theme?: ITheme
}>()

const emit = defineEmits<{
  data: [value: string]
  disconnect: []
}>()

const container = ref<HTMLElement | null>(null)
let terminal: Terminal | null = null
let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
let writer: WritableStreamDefaultWriter<Uint8Array> | null = null
let resizeObserver: ResizeObserver | null = null
let fitAddon: FitAddon | null = null

onMounted(() => {
  terminal = new Terminal({
    cursorBlink: true,
    fontSize: props.fontSize ?? 14,
    fontFamily: props.fontFamily ?? 'monospace',
    theme: props.theme,
  })
  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  terminal.loadAddon(new WebLinksAddon())
  terminal.open(container.value!)
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

defineExpose({
  focus: () => terminal?.focus(),
  clear: () => terminal?.clear(),
})
</script>

<style scoped>
.terminal-container {
  width: 100%;
  height: 100%;
}
</style>
