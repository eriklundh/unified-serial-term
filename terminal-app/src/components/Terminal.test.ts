import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

// ResizeObserver is not available in jsdom — stub it for all tests.
// Tests that specifically verify ResizeObserver behaviour override this stub.
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('ResizeObserver', vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    disconnect: vi.fn(),
  })))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Terminal.vue', () => {
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
      start: (c) => { controller = c },
    })

    mount(Terminal, { props: { readable }, attachTo: document.body })
    await new Promise((r) => setTimeout(r, 0))

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
      write: (chunk) => { written.push(chunk) },
    })

    mount(Terminal, { props: { writable }, attachTo: document.body })
    onDataCb!('hi')
    await new Promise((r) => setTimeout(r, 0))

    expect(written).toEqual([new TextEncoder().encode('hi')])
  })

  // ── local echo ──────────────────────────────────────────────────────────────

  it('writes keystroke to xterm immediately when localEcho is true', async () => {
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

    mount(Terminal, { props: { localEcho: true }, attachTo: document.body })
    onDataCb!('X')

    const instance = (XTerm as ReturnType<typeof vi.fn>).mock.results[0]!.value
    expect(instance.write).toHaveBeenCalledWith(new TextEncoder().encode('X'))
  })

  it('does not echo keystroke to xterm when localEcho is false', async () => {
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

    mount(Terminal, { props: { localEcho: false }, attachTo: document.body })
    onDataCb!('X')

    const instance = (XTerm as ReturnType<typeof vi.fn>).mock.results[0]!.value
    expect(instance.write).not.toHaveBeenCalled()
  })

  it('does not echo keystroke to xterm when localEcho prop is omitted', async () => {
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

    mount(Terminal, { attachTo: document.body }) // no localEcho prop
    onDataCb!('X')

    const instance = (XTerm as ReturnType<typeof vi.fn>).mock.results[0]!.value
    expect(instance.write).not.toHaveBeenCalled()
  })

  // ── ResizeObserver ───────────────────────────────────────────────────────────

  it('creates a ResizeObserver and observes the container on mount', () => {
    const mockObserve = vi.fn()
    const MockResizeObserver = vi.fn().mockImplementation(() => ({
      observe: mockObserve,
      disconnect: vi.fn(),
    }))
    vi.stubGlobal('ResizeObserver', MockResizeObserver)

    mount(Terminal, { attachTo: document.body })

    expect(MockResizeObserver).toHaveBeenCalledOnce()
    expect(mockObserve).toHaveBeenCalledWith(expect.any(HTMLElement))
  })

  it('calls fitAddon.fit() when ResizeObserver fires', async () => {
    const { FitAddon } = await import('@xterm/addon-fit')

    let resizeCb: ResizeObserverCallback | null = null
    vi.stubGlobal('ResizeObserver', vi.fn().mockImplementation((cb: ResizeObserverCallback) => {
      resizeCb = cb
      return { observe: vi.fn(), disconnect: vi.fn() }
    }))

    mount(Terminal, { attachTo: document.body })
    const fitInstance = (FitAddon as ReturnType<typeof vi.fn>).mock.results[0]!.value
    const callsBefore = (fitInstance.fit as ReturnType<typeof vi.fn>).mock.calls.length

    resizeCb!([], null as unknown as ResizeObserver)

    expect(fitInstance.fit).toHaveBeenCalledTimes(callsBefore + 1)
  })

  it('disconnects ResizeObserver on unmount', () => {
    const mockDisconnect = vi.fn()
    vi.stubGlobal('ResizeObserver', vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      disconnect: mockDisconnect,
    })))

    const wrapper = mount(Terminal, { attachTo: document.body })
    wrapper.unmount()

    expect(mockDisconnect).toHaveBeenCalledOnce()
  })
})
