import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { beep, createBellHandler } from './bell'

// Minimal AudioContext mock
function makeMockAudioContext() {
  const gainNode = {
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
  }
  const oscillator = {
    type: '' as OscillatorType,
    frequency: { setValueAtTime: vi.fn() },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null as (() => void) | null,
  }
  const ctx = {
    currentTime: 0,
    destination: {},
    createOscillator: vi.fn(() => oscillator),
    createGain: vi.fn(() => gainNode),
    close: vi.fn(),
  }
  return { ctx, oscillator, gainNode }
}

describe('beep', () => {
  let OriginalAudioContext: typeof AudioContext
  let mockCtx: ReturnType<typeof makeMockAudioContext>

  beforeEach(() => {
    OriginalAudioContext = window.AudioContext
    mockCtx = makeMockAudioContext()
    const captured = mockCtx.ctx
    vi.stubGlobal(
      'AudioContext',
      vi.fn().mockImplementation(class { constructor() { return captured } }),
    )
  })

  afterEach(() => {
    vi.stubGlobal('AudioContext', OriginalAudioContext)
    vi.restoreAllMocks()
  })

  it('creates an oscillator with a square wave at the given frequency', () => {
    beep(0.5, 880, 100)
    expect(mockCtx.oscillator.type).toBe('square')
    expect(mockCtx.oscillator.frequency.setValueAtTime).toHaveBeenCalledWith(880, 0)
  })

  it('connects oscillator → gain → destination', () => {
    beep(0.5, 880, 100)
    expect(mockCtx.oscillator.connect).toHaveBeenCalledWith(mockCtx.gainNode)
    expect(mockCtx.gainNode.connect).toHaveBeenCalledWith(mockCtx.ctx.destination)
  })

  it('sets the gain envelope with the given volume', () => {
    beep(0.7, 880, 100)
    expect(mockCtx.gainNode.gain.setValueAtTime).toHaveBeenCalledWith(0.7, 0)
  })

  it('starts and schedules stop after duration ms', () => {
    beep(0.5, 880, 200)
    expect(mockCtx.oscillator.start).toHaveBeenCalledWith(0)
    expect(mockCtx.oscillator.stop).toHaveBeenCalledWith(0.2) // 200ms → 0.2s
  })
})

describe('createBellHandler', () => {
  it('does nothing when bell is disabled', () => {
    const flash = vi.fn()
    const beepFn = vi.fn()
    const handler = createBellHandler(() => 'sound', () => false, flash, beepFn)
    handler()
    expect(flash).not.toHaveBeenCalled()
    expect(beepFn).not.toHaveBeenCalled()
  })

  it('does nothing when style is none', () => {
    const flash = vi.fn()
    const beepFn = vi.fn()
    const handler = createBellHandler(() => 'none', () => true, flash, beepFn)
    handler()
    expect(flash).not.toHaveBeenCalled()
    expect(beepFn).not.toHaveBeenCalled()
  })

  it('calls flash only when style is visual', () => {
    const flash = vi.fn()
    const beepFn = vi.fn()
    const handler = createBellHandler(() => 'visual', () => true, flash, beepFn)
    handler()
    expect(flash).toHaveBeenCalledOnce()
    expect(beepFn).not.toHaveBeenCalled()
  })

  it('calls beepFn only when style is sound', () => {
    const flash = vi.fn()
    const beepFn = vi.fn()
    const handler = createBellHandler(() => 'sound', () => true, flash, beepFn)
    handler()
    expect(flash).not.toHaveBeenCalled()
    expect(beepFn).toHaveBeenCalledOnce()
    expect(beepFn).toHaveBeenCalledWith(0.3, 520, 80)
  })

  it('calls both flash and beepFn when style is both', () => {
    const flash = vi.fn()
    const beepFn = vi.fn()
    const handler = createBellHandler(() => 'both', () => true, flash, beepFn)
    handler()
    expect(flash).toHaveBeenCalledOnce()
    expect(beepFn).toHaveBeenCalledOnce()
  })

  it('throttles rapid successive calls', () => {
    vi.useFakeTimers()
    const flash = vi.fn()
    const beepFn = vi.fn()
    const handler = createBellHandler(() => 'sound', () => true, flash, beepFn, 500)
    handler()
    handler()
    handler()
    expect(beepFn).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })

  it('allows a second call after the throttle window', () => {
    vi.useFakeTimers()
    const flash = vi.fn()
    const beepFn = vi.fn()
    const handler = createBellHandler(() => 'sound', () => true, flash, beepFn, 500)
    handler()
    vi.advanceTimersByTime(501)
    handler()
    expect(beepFn).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})
