<template>
  <div
    class="splash"
    data-testid="splash-overlay"
    aria-label="Welcome"
    role="complementary"
  >
    <div class="splash__card">
      <div
        class="splash__logo"
        data-testid="splash-logo"
        aria-hidden="true"
        v-html="logoSvg"
      />
      <h1 class="splash__title">
        Unified Serial Console
      </h1>
      <p class="splash__tagline">
        A serial terminal that lives in your browser. Talk to FTDI and CDC
        devices over WebUSB or Web Serial — nothing to install, no driver
        juggling.
      </p>
      <p class="splash__hint">
        Pick a device from the connection dropdown above, or just start typing.
      </p>
      <p class="splash__companion">
        WebUSB needs the FTDI chip free of the OS serial driver. The companion
        <a
          href="https://github.com/eriklundh/ftdi-unbind"
          target="_blank"
          rel="noopener noreferrer"
          data-testid="splash-ftdi-unbind-link"
        >ftdi-unbind</a>
        toolkit releases the driver and restores it when you're done.
      </p>
      <p class="splash__credit">
        Erik Lundh · The Joy of Engineering
      </p>
      <p
        class="splash__version"
        data-testid="splash-version"
      >
        v{{ appVersion }} · {{ releaseDate }}
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
import logoSvg from '../assets/joy-of-engineering.svg?raw'

// Injected at build time from package.json / CHANGELOG.md (script/version-info.ts).
const appVersion = __APP_VERSION__
const releaseDate = __APP_RELEASE_DATE__

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

.splash__logo {
  /* brand blue from The Joy of Engineering artwork; the SVG strokes with currentColor */
  color: #0083be;
  align-self: center;
}

.splash__logo :deep(svg) {
  display: block;
  height: 7.5rem;
  width: auto;
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

.splash__companion {
  font-size: 0.8rem;
  color: var(--muted, #9a9a9a);
}

.splash__companion a {
  color: var(--accent, #3b82f6);
  text-decoration: none;
}

.splash__companion a:hover {
  text-decoration: underline;
}

.splash__credit {
  font-size: 0.8rem;
  color: var(--muted, #9a9a9a);
}

.splash__version {
  font-size: 0.75rem;
  color: var(--muted, #9a9a9a);
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
