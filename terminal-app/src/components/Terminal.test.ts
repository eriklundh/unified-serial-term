import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import Terminal from './Terminal.vue'

vi.mock('@xterm/xterm', () => {
  const Terminal = vi.fn().mockImplementation(() => ({
    open: vi.fn(),
    dispose: vi.fn(),
    loadAddon: vi.fn(),
  }))
  return { Terminal }
})

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => ({ fit: vi.fn() })),
}))

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: vi.fn().mockImplementation(() => ({})),
}))

describe('Terminal.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates an xterm Terminal instance on mount', async () => {
    const { Terminal: XTerm } = await import('@xterm/xterm')
    mount(Terminal, { attachTo: document.body })
    expect(XTerm).toHaveBeenCalledOnce()
  })

  it('calls terminal.open() with the container div on mount', async () => {
    const { Terminal: XTerm } = await import('@xterm/xterm')
    mount(Terminal, { attachTo: document.body })
    const instance = (XTerm as ReturnType<typeof vi.fn>).mock.results[0].value
    expect(instance.open).toHaveBeenCalledOnce()
    expect(instance.open).toHaveBeenCalledWith(expect.any(HTMLElement))
  })

  it('calls terminal.dispose() on unmount', async () => {
    const { Terminal: XTerm } = await import('@xterm/xterm')
    const wrapper = mount(Terminal, { attachTo: document.body })
    const instance = (XTerm as ReturnType<typeof vi.fn>).mock.results[0].value
    wrapper.unmount()
    expect(instance.dispose).toHaveBeenCalledOnce()
  })
})
