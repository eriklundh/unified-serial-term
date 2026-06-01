import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import Terminal from './Terminal.vue'

vi.mock('@xterm/xterm', () => {
  const Terminal = vi.fn().mockImplementation(() => ({
    open: vi.fn(),
    dispose: vi.fn(),
    loadAddon: vi.fn(),
    write: vi.fn(),
    onData: vi.fn(),
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
    const instance = (XTerm as ReturnType<typeof vi.fn>).mock.results[0]!.value
    expect(instance.open).toHaveBeenCalledOnce()
    expect(instance.open).toHaveBeenCalledWith(expect.any(HTMLElement))
  })

  it('calls terminal.dispose() on unmount', async () => {
    const { Terminal: XTerm } = await import('@xterm/xterm')
    const wrapper = mount(Terminal, { attachTo: document.body })
    const instance = (XTerm as ReturnType<typeof vi.fn>).mock.results[0]!.value
    wrapper.unmount()
    expect(instance.dispose).toHaveBeenCalledOnce()
  })

  it('writes bytes from readable prop to xterm', async () => {
    const { Terminal: XTerm } = await import('@xterm/xterm')

    let controller!: ReadableStreamDefaultController<Uint8Array>
    const readable = new ReadableStream<Uint8Array>({
      start: (c) => {
        controller = c
      },
    })

    mount(Terminal, { props: { readable }, attachTo: document.body })
    await new Promise((r) => setTimeout(r, 0)) // let watcher fire

    const instance = (XTerm as ReturnType<typeof vi.fn>).mock.results[0]!.value
    controller.enqueue(new Uint8Array([0x41, 0x42]))
    await new Promise((r) => setTimeout(r, 10))

    expect(instance.write).toHaveBeenCalledWith(new Uint8Array([0x41, 0x42]))
  })

  it('emits data event when xterm fires onData', async () => {
    const { Terminal: XTerm } = await import('@xterm/xterm')

    let onDataCb: ((data: string) => void) | undefined
    ;(XTerm as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      open: vi.fn(),
      dispose: vi.fn(),
      loadAddon: vi.fn(),
      write: vi.fn(),
      onData: vi.fn().mockImplementation((cb: (data: string) => void) => {
        onDataCb = cb
      }),
    }))

    const wrapper = mount(Terminal, { attachTo: document.body })
    onDataCb!('hello')

    expect(wrapper.emitted('data')).toEqual([['hello']])
  })

  it('writes typed data to writable when provided', async () => {
    const { Terminal: XTerm } = await import('@xterm/xterm')

    let onDataCb: ((data: string) => void) | undefined
    ;(XTerm as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      open: vi.fn(),
      dispose: vi.fn(),
      loadAddon: vi.fn(),
      write: vi.fn(),
      onData: vi.fn().mockImplementation((cb: (data: string) => void) => {
        onDataCb = cb
      }),
    }))

    const written: Uint8Array[] = []
    const writable = new WritableStream<Uint8Array>({
      write: (chunk) => {
        written.push(chunk)
      },
    })

    mount(Terminal, { props: { writable }, attachTo: document.body })
    onDataCb!('hi')
    await new Promise((r) => setTimeout(r, 0))

    expect(written).toEqual([new TextEncoder().encode('hi')])
  })
})
