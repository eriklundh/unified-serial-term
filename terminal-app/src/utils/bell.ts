import type { BellStyle } from '../settings/useBell'

/** Play a square-wave beep via the Web Audio API. */
export function beep(volume: number, frequency: number, durationMs: number): void {
  const ctx = new AudioContext()
  const gain = ctx.createGain()
  const osc = ctx.createOscillator()

  osc.type = 'square'
  osc.frequency.setValueAtTime(frequency, ctx.currentTime)
  gain.gain.setValueAtTime(volume, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + durationMs / 1000)
  osc.onended = () => ctx.close()
}

/**
 * Returns an xterm onBell callback.
 * Extracted for unit testing — Terminal.vue wires this to terminal.onBell().
 */
export function createBellHandler(
  getStyle: () => BellStyle,
  isEnabled: () => boolean,
  flash: () => void,
  beepFn: (vol: number, freq: number, dur: number) => void = beep,
  throttleMs = 500,
): () => void {
  let lastAt = 0
  return () => {
    if (!isEnabled() || getStyle() === 'none') return
    const now = Date.now()
    if (now - lastAt < throttleMs) return
    lastAt = now
    const style = getStyle()
    if (style === 'visual' || style === 'both') flash()
    if (style === 'sound' || style === 'both') beepFn(0.3, 520, 80)
  }
}
