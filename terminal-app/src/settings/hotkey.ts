/**
 * Tiny hotkey parser/matcher for app-level shortcuts (e.g. clear-terminal).
 *
 * A spec is a `+`-joined string like `Ctrl+Shift+K`. An empty spec means the
 * shortcut is **off**. Matching is exact on all four modifiers, so a shortcut
 * never fires when extra modifiers are held.
 */
export interface HotkeySpec {
  ctrl: boolean
  shift: boolean
  alt: boolean
  meta: boolean
  /** Single chars are upper-cased; named keys (e.g. `Enter`) kept verbatim. */
  key: string
}

/** Minimal shape of a KeyboardEvent we depend on (keeps it testable). */
export interface KeyEventLike {
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  metaKey: boolean
  key: string
}

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta'])

function normalizeKey(key: string): string {
  return key.length === 1 ? key.toUpperCase() : key
}

/** Parse a spec string, or `null` if empty/modifier-only/invalid. */
export function parseHotkey(spec: string): HotkeySpec | null {
  if (!spec) return null
  const out: HotkeySpec = { ctrl: false, shift: false, alt: false, meta: false, key: '' }
  for (const raw of spec.split('+')) {
    const part = raw.trim()
    if (!part) continue
    switch (part.toLowerCase()) {
      case 'ctrl':
      case 'control': out.ctrl = true; break
      case 'shift': out.shift = true; break
      case 'alt':
      case 'option': out.alt = true; break
      case 'meta':
      case 'cmd':
      case 'command':
      case 'win': out.meta = true; break
      default: out.key = normalizeKey(part)
    }
  }
  return out.key ? out : null
}

/** Does a keyboard event match the spec? `false` for an empty/off spec. */
export function matchesHotkey(e: KeyEventLike, spec: string): boolean {
  const h = parseHotkey(spec)
  if (!h) return false
  return (
    e.ctrlKey === h.ctrl &&
    e.shiftKey === h.shift &&
    e.altKey === h.alt &&
    e.metaKey === h.meta &&
    normalizeKey(e.key) === h.key
  )
}

/** Format a keyboard event as a spec (for a rebind capture field). `''` if only modifiers are held. */
export function eventToHotkey(e: KeyEventLike): string {
  if (MODIFIER_KEYS.has(e.key)) return ''
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push('Alt')
  if (e.metaKey) parts.push('Meta')
  parts.push(normalizeKey(e.key))
  return parts.join('+')
}
