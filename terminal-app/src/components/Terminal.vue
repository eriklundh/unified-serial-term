<template>
  <div ref="container" class="terminal-container" />
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'

const container = ref<HTMLElement | null>(null)
let terminal: Terminal | null = null

onMounted(() => {
  terminal = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: 'monospace',
  })
  const fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  terminal.loadAddon(new WebLinksAddon())
  terminal.open(container.value!)
  fitAddon.fit()
})

onUnmounted(() => {
  terminal?.dispose()
  terminal = null
})
</script>

<style scoped>
.terminal-container {
  width: 100%;
  height: 100%;
}
</style>
