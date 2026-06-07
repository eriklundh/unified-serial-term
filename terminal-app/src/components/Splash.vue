<template>
  <div
    class="splash"
    data-testid="splash-overlay"
    aria-label="Welcome"
    role="complementary"
  >
    <div class="splash__card">
      <h1 class="splash__title">
        Unified Serial Console
      </h1>
      <p class="splash__tagline">
        Browser-based serial terminal · WebUSB + Web Serial
      </p>
      <p class="splash__hint">
        Type or connect a device to begin.
      </p>
      <label class="splash__dismiss">
        <input
          type="checkbox"
          data-testid="dont-show-again"
          @change="emit('dontShowAgain')"
        >
        Don't show again
      </label>
      <p class="splash__source">
        <a
          href="https://github.com/eriklundh/unified-serial-term"
          target="_blank"
          rel="noopener noreferrer"
          data-testid="splash-source-link"
        >github.com/eriklundh/unified-serial-term</a>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
const emit = defineEmits<{
  dontShowAgain: []
}>()
</script>

<style scoped>
.splash {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg, #1e1e1e);
  /* partial transparency so a peek of the terminal is visible beneath */
  background: color-mix(in srgb, var(--bg, #1e1e1e) 92%, transparent);
}

.splash__card {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 2rem 2.5rem;
  background: var(--surface, #252526);
  border: 1px solid var(--border, #3c3c3c);
  border-radius: 10px;
  box-shadow: 0 8px 32px rgb(0 0 0 / 0.4);
  max-width: 36rem;
  text-align: center;
}

.splash__title {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--fg, #e6e6e6);
}

.splash__tagline {
  font-size: 0.9rem;
  color: var(--muted, #9a9a9a);
}

.splash__hint {
  font-size: 0.85rem;
  color: var(--fg, #e6e6e6);
  margin-top: 0.25rem;
}

.splash__dismiss {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  margin-top: 0.5rem;
  font-size: 0.8rem;
  color: var(--muted, #9a9a9a);
  cursor: pointer;
}

.splash__source {
  font-size: 0.75rem;
  color: var(--muted, #9a9a9a);
}

.splash__source a {
  color: var(--accent, #3b82f6);
  text-decoration: none;
}

.splash__source a:hover {
  text-decoration: underline;
}
</style>
