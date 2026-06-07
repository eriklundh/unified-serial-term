import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import Terminal from './Terminal.vue'

vi.mock('@xterm/xterm', () => {
  const Terminal = vi.fn().mockImplementation(function () {
    return {
      open: vi.fn(),
      dispose: vi.fn(),
      loadAddon: vi.fn(),
      write: vi.fn(),
      onData: vi.fn(),
      onBell: vi.fn(),
      focus: vi.fn(),
      clear: vi.fn(),
      reset: vi.fn(),
    }
  })
  return { Terminal }
})

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(function () {
    return { fit: vi.fn() }
  }),
}))

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: vi.fn().mockImplementation(function () {
    return {}
  }),
}))

vi.mock('@xterm/addon-serialize', () => ({
  SerializeAddon: vi.fn().mockImplementation(function () {
    return { serialize: vi.fn().mockReturnValue('serialized content') }
  }),
}))

// ResizeObserver is not available in jsdom — stub it for all tests.
// Tests that specifically verify ResizeObserver behaviour override this stub.
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('ResizeObserver', vi.fn().mockImplementation(function () {
    return {
      observe: vi.fn(),
      disconnect: vi.fn(),
    }
  }))
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

  it('exposes clear() which resets the xterm buffer and homes the cursor', async () => {
    const { Terminal: XTerm } = await import('@xterm/xterm')
    const wrapper = mount(Terminal, { attachTo: document.body })
    const instance = (XTerm as ReturnType<typeof vi.fn>).mock.results[0]!.value
    ;(wrapper.vm as unknown as { clear: () => void }).clear()
    // clear() maps to terminal.reset() (full RIS) so the cursor returns home.
    expect(instance.reset).toHaveBeenCalledOnce()
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
    ;(XTerm as ReturnType<typeof vi.fn>).mockImplementationOnce(function () {
      return {
        open: vi.fn(),
        dispose: vi.fn(),
        loadAddon: vi.fn(),
        write: vi.fn(),
        onData: vi.fn().mockImplementation((cb: (data: string) => void) => {
          onDataCb = cb
        }),
        onBell: vi.fn(),
      }
    })

    const wrapper = mount(Terminal, { attachTo: document.body })
    onDataCb!('hello')

    expect(wrapper.emitted('data')).toEqual([['hello']])
  })

  it('writes typed data to writable when provided', async () => {
    const { Terminal: XTerm } = await import('@xterm/xterm')

    let onDataCb: ((data: string) => void) | undefined
    ;(XTerm as ReturnType<typeof vi.fn>).mockImplementationOnce(function () {
      return {
        open: vi.fn(),
        dispose: vi.fn(),
        loadAddon: vi.fn(),
        write: vi.fn(),
        onData: vi.fn().mockImplementation((cb: (data: string) => void) => {
          onDataCb = cb
        }),
        onBell: vi.fn(),
      }
    })

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
    ;(XTerm as ReturnType<typeof vi.fn>).mockImplementationOnce(function () {
      return {
        open: vi.fn(),
        dispose: vi.fn(),
        loadAddon: vi.fn(),
        write: vi.fn(),
        onData: vi.fn().mockImplementation((cb: (data: string) => void) => {
          onDataCb = cb
        }),
        onBell: vi.fn(),
      }
    })

    mount(Terminal, { props: { localEcho: true }, attachTo: document.body })
    onDataCb!('X')

    const instance = (XTerm as ReturnType<typeof vi.fn>).mock.results[0]!.value
    expect(instance.write).toHaveBeenCalledWith(new TextEncoder().encode('X'))
  })

  it('does not echo keystroke to xterm when localEcho is false', async () => {
    const { Terminal: XTerm } = await import('@xterm/xterm')

    let onDataCb: ((data: string) => void) | undefined
    ;(XTerm as ReturnType<typeof vi.fn>).mockImplementationOnce(function () {
      return {
        open: vi.fn(),
        dispose: vi.fn(),
        loadAddon: vi.fn(),
        write: vi.fn(),
        onData: vi.fn().mockImplementation((cb: (data: string) => void) => {
          onDataCb = cb
        }),
        onBell: vi.fn(),
      }
    })

    mount(Terminal, { props: { localEcho: false }, attachTo: document.body })
    onDataCb!('X')

    const instance = (XTerm as ReturnType<typeof vi.fn>).mock.results[0]!.value
    expect(instance.write).not.toHaveBeenCalled()
  })

  it('does not echo keystroke to xterm when localEcho prop is omitted', async () => {
    const { Terminal: XTerm } = await import('@xterm/xterm')

    let onDataCb: ((data: string) => void) | undefined
    ;(XTerm as ReturnType<typeof vi.fn>).mockImplementationOnce(function () {
      return {
        open: vi.fn(),
        dispose: vi.fn(),
        loadAddon: vi.fn(),
        write: vi.fn(),
        onData: vi.fn().mockImplementation((cb: (data: string) => void) => {
          onDataCb = cb
        }),
        onBell: vi.fn(),
      }
    })

    mount(Terminal, { attachTo: document.body }) // no localEcho prop
    onDataCb!('X')

    const instance = (XTerm as ReturnType<typeof vi.fn>).mock.results[0]!.value
    expect(instance.write).not.toHaveBeenCalled()
  })

  // ── focus() ──────────────────────────────────────────────────────────────────

  it('exposes focus() which delegates to xterm terminal.focus()', async () => {
    const { Terminal: XTerm } = await import('@xterm/xterm')
    const wrapper = mount(Terminal, { attachTo: document.body })
    const instance = (XTerm as ReturnType<typeof vi.fn>).mock.results[0]!.value

    wrapper.vm.focus()

    expect(instance.focus).toHaveBeenCalledOnce()
  })

  // ── serialize() ──────────────────────────────────────────────────────────────

  it('exposes serialize() which delegates to SerializeAddon.serialize()', async () => {
    const { SerializeAddon } = await import('@xterm/addon-serialize')
    const wrapper = mount(Terminal, { attachTo: document.body })
    const addonInstance = (SerializeAddon as ReturnType<typeof vi.fn>).mock.results[0]!.value

    const result = (wrapper.vm as unknown as { serialize: () => string }).serialize()

    expect(addonInstance.serialize).toHaveBeenCalledOnce()
    expect(result).toBe('serialized content')
  })

  // ── bell ─────────────────────────────────────────────────────────────────────

  it('wires terminal.onBell() on mount', async () => {
    const { Terminal: XTerm } = await import('@xterm/xterm')
    mount(Terminal, { attachTo: document.body })
    const instance = (XTerm as ReturnType<typeof vi.fn>).mock.results[0]!.value
    expect(instance.onBell).toHaveBeenCalledOnce()
    expect(instance.onBell).toHaveBeenCalledWith(expect.any(Function))
  })

  // ── disconnect event ─────────────────────────────────────────────────────────

  it('emits disconnect when readable stream errors unexpectedly', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const readable = new ReadableStream<Uint8Array>({
      start: (c) => { controller = c },
    })

    const wrapper = mount(Terminal, { props: { readable }, attachTo: document.body })
    await new Promise((r) => setTimeout(r, 0))

    controller.error(new DOMException('Device disconnected', 'NetworkError'))
    await new Promise((r) => setTimeout(r, 10))

    expect(wrapper.emitted('disconnect')).toBeTruthy()
  })

  it('does not emit disconnect on a clean stream close', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const readable = new ReadableStream<Uint8Array>({
      start: (c) => { controller = c },
    })

    const wrapper = mount(Terminal, { props: { readable }, attachTo: document.body })
    await new Promise((r) => setTimeout(r, 0))

    controller.close()
    await new Promise((r) => setTimeout(r, 10))

    expect(wrapper.emitted('disconnect')).toBeFalsy()
  })

  // ── ResizeObserver ───────────────────────────────────────────────────────────

  it('creates a ResizeObserver and observes the container on mount', () => {
    const mockObserve = vi.fn()
    const MockResizeObserver = vi.fn().mockImplementation(function () {
      return {
        observe: mockObserve,
        disconnect: vi.fn(),
      }
    })
    vi.stubGlobal('ResizeObserver', MockResizeObserver)

    mount(Terminal, { attachTo: document.body })

    expect(MockResizeObserver).toHaveBeenCalledOnce()
    expect(mockObserve).toHaveBeenCalledWith(expect.any(HTMLElement))
  })

  it('calls fitAddon.fit() when ResizeObserver fires', async () => {
    const { FitAddon } = await import('@xterm/addon-fit')

    let resizeCb: ResizeObserverCallback | null = null
    vi.stubGlobal('ResizeObserver', vi.fn().mockImplementation(function (cb: ResizeObserverCallback) {
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
    vi.stubGlobal('ResizeObserver', vi.fn().mockImplementation(function () {
      return {
        observe: vi.fn(),
        disconnect: mockDisconnect,
      }
    }))

    const wrapper = mount(Terminal, { attachTo: document.body })
    wrapper.unmount()

    expect(mockDisconnect).toHaveBeenCalledOnce()
  })
})
