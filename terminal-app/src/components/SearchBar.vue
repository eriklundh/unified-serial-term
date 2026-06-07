<template>
  <div
    class="search-bar"
    role="search"
    aria-label="Find in terminal"
  >
    <input
      ref="inputRef"
      v-model="term"
      type="search"
      placeholder="Find…"
      data-testid="search-input"
      aria-label="Search term"
      @keydown.enter.prevent="emit('findNext', term)"
      @keydown.esc.prevent="emit('close')"
    >
    <button
      type="button"
      data-testid="search-prev"
      title="Previous match"
      aria-label="Previous match"
      @click="emit('findPrev', term)"
    >
      ▲
    </button>
    <button
      type="button"
      data-testid="search-next"
      title="Next match"
      aria-label="Next match"
      @click="emit('findNext', term)"
    >
      ▼
    </button>
    <button
      type="button"
      data-testid="search-close"
      title="Close search"
      aria-label="Close search"
      @click="emit('close')"
    >
      ✕
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const emit = defineEmits<{
  findNext: [term: string]
  findPrev: [term: string]
  close: []
}>()

const term = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

onMounted(() => {
  inputRef.value?.focus()
})
</script>

<style scoped>
.search-bar {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.3rem 0.4rem;
  background: var(--surface, #252526);
  border: 1px solid var(--border, #3c3c3c);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgb(0 0 0 / 0.3);
}

.search-bar input[type='search'] {
  font: inherit;
  font-size: 0.85rem;
  padding: 0.2rem 0.4rem;
  background: var(--surface-2, #2d2d30);
  color: var(--fg, #e6e6e6);
  border: 1px solid var(--border, #3c3c3c);
  border-radius: 4px;
  width: 14rem;
  min-width: 0;
}

.search-bar input[type='search']:focus {
  outline: 2px solid var(--accent, #3b82f6);
  outline-offset: 1px;
}

/* suppress native clear-button from some browsers */
.search-bar input[type='search']::-webkit-search-cancel-button {
  display: none;
}

.search-bar button {
  font: inherit;
  font-size: 0.8rem;
  padding: 0.2rem 0.4rem;
  background: transparent;
  color: var(--fg, #e6e6e6);
  border: 1px solid var(--border, #3c3c3c);
  border-radius: 4px;
  cursor: pointer;
  line-height: 1;
}

.search-bar button:hover {
  border-color: var(--accent, #3b82f6);
}

.search-bar button:focus-visible {
  outline: 2px solid var(--accent, #3b82f6);
  outline-offset: 1px;
}
</style>
