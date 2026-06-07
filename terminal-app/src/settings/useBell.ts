import { ref, watch } from 'vue'

export const BELL_STYLES = ['none', 'visual', 'sound', 'both'] as const
export type BellStyle = (typeof BELL_STYLES)[number]

function isBellStyle(v: string): v is BellStyle {
  return (BELL_STYLES as readonly string[]).includes(v)
}

export function useBell() {
  const stored = localStorage.getItem('bellStyle')
  const bell = ref<boolean>(localStorage.getItem('bell') !== 'false')
  const bellStyle = ref<BellStyle>(stored && isBellStyle(stored) ? stored : 'visual')

  watch(bell, (v) => localStorage.setItem('bell', String(v)), { flush: 'sync' })
  watch(bellStyle, (v) => localStorage.setItem('bellStyle', v), { flush: 'sync' })

  return { bell, bellStyle }
}
