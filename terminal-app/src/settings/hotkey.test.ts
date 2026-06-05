import { describe, it, expect } from 'vitest'
import { parseHotkey, matchesHotkey, eventToHotkey, type KeyEventLike } from './hotkey'

function ev(partial: Partial<KeyEventLike>): KeyEventLike {
  return { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, key: '', ...partial }
}

describe('parseHotkey', () => {
  it('parses modifiers + key', () => {
    expect(parseHotkey('Ctrl+Shift+K')).toEqual({
      ctrl: true, shift: true, alt: false, meta: false, key: 'K',
    })
  })

  it('is case-insensitive on names and uppercases single-char keys', () => {
    expect(parseHotkey('ctrl+l')).toEqual({
      ctrl: true, shift: false, alt: false, meta: false, key: 'L',
    })
  })

  it('returns null for empty (off) or modifier-only specs', () => {
    expect(parseHotkey('')).toBeNull()
    expect(parseHotkey('Ctrl+Shift')).toBeNull()
  })

  it('keeps named keys verbatim', () => {
    expect(parseHotkey('Alt+Enter')?.key).toBe('Enter')
  })
})

describe('matchesHotkey', () => {
  it('matches an exact modifier+key combo', () => {
    expect(matchesHotkey(ev({ ctrlKey: true, shiftKey: true, key: 'K' }), 'Ctrl+Shift+K')).toBe(true)
    expect(matchesHotkey(ev({ ctrlKey: true, shiftKey: true, key: 'k' }), 'Ctrl+Shift+K')).toBe(true)
  })

  it('does not match when a modifier is missing or extra', () => {
    expect(matchesHotkey(ev({ ctrlKey: true, key: 'K' }), 'Ctrl+Shift+K')).toBe(false)
    expect(matchesHotkey(ev({ ctrlKey: true, shiftKey: true, altKey: true, key: 'K' }), 'Ctrl+Shift+K')).toBe(false)
  })

  it('does not match the wrong key', () => {
    expect(matchesHotkey(ev({ ctrlKey: true, shiftKey: true, key: 'J' }), 'Ctrl+Shift+K')).toBe(false)
  })

  it('never matches when the hotkey is off (empty)', () => {
    expect(matchesHotkey(ev({ ctrlKey: true, shiftKey: true, key: 'K' }), '')).toBe(false)
  })
})

describe('eventToHotkey', () => {
  it('formats a combo', () => {
    expect(eventToHotkey(ev({ ctrlKey: true, shiftKey: true, key: 'k' }))).toBe('Ctrl+Shift+K')
  })

  it('returns empty for modifier-only presses', () => {
    expect(eventToHotkey(ev({ ctrlKey: true, key: 'Control' }))).toBe('')
    expect(eventToHotkey(ev({ shiftKey: true, key: 'Shift' }))).toBe('')
  })

  it('round-trips through matchesHotkey', () => {
    const e = ev({ ctrlKey: true, altKey: true, key: 'g' })
    expect(matchesHotkey(e, eventToHotkey(e))).toBe(true)
  })
})
