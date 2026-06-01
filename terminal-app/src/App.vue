<template>
  <div class="app">
    <header class="app-header">
      <div class="controls">
        <button data-testid="connect-btn" disabled>Connect</button>
      </div>
      <div data-testid="settings-panel" class="settings-panel">
        <!-- Settings panel — populated in Phase 5 -->
      </div>
    </header>
    <main class="terminal-pane">
      <Terminal />
    </main>
  </div>
</template>

<script setup lang="ts">
import Terminal from './components/Terminal.vue'
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
