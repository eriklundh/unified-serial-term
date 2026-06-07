import { describe, it, expect, beforeEach } from 'vitest'
import { useBell, BELL_STYLES, type BellStyle } from './useBell'

describe('useBell', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to bell enabled with visual style', () => {
    const { bell, bellStyle } = useBell()
    expect(bell.value).toBe(true)
    expect(bellStyle.value).toBe('visual')
  })

  it('persists bell enabled flag across instances', () => {
    const a = useBell()
    a.bell.value = false
    const b = useBell()
    expect(b.bell.value).toBe(false)
  })

  it('persists bellStyle across instances', () => {
    const a = useBell()
    a.bellStyle.value = 'sound'
    const b = useBell()
    expect(b.bellStyle.value).toBe('sound')
  })

  it('BELL_STYLES contains the four expected options', () => {
    expect(BELL_STYLES).toEqual(['none', 'visual', 'sound', 'both'])
  })

  it('rejects an invalid bellStyle and falls back to visual', () => {
    localStorage.setItem('bellStyle', 'invalid')
    const { bellStyle } = useBell()
    expect(bellStyle.value).toBe('visual')
  })
})

// Satisfy the BellStyle type export check
const _check: BellStyle = 'both'
void _check
