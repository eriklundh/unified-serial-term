import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import App from './App.vue'
import type { BackendId, SerialBackend, SerialBackendFactory } from './backends/SerialBackend'
import { MockSerialBackend } from './backends/MockSerialBackend'
import { FACTORIES_KEY } from './backends/injectionKeys'

const { terminalClear } = vi.hoisted(() => ({ terminalClear: vi.fn() }))

vi.mock('./components/Terminal.vue', () => ({
  default: {
    name: 'Terminal',
    template: '<div class="mock-terminal" />',
    props: ['readable', 'writable', 'localEcho', 'fontFamily', 'fontSize', 'theme'],
    emits: ['disconnect'],
    setup(_props: unknown, { expose }: { expose: (e: Record<string, unknown>) => void }) {
      expose({ clear: terminalClear, focus: () => {} })
    },
  },
}))

// ---------------------------------------------------------------------------
// MockFactory — injects a controllable factory for App tests
// ---------------------------------------------------------------------------
class MockFactory implements SerialBackendFactory {
  constructor(
    readonly id: BackendId = 'web-serial',
    readonly displayName = 'Mock',
    private available = true,
  ) {}

  pickDeviceCalled = false
  lastBackend: MockSerialBackend | null = null

  isAvailable() {
    return this.available
  }

  async pickDevice(): Promise<SerialBackend> {
    this.pickDeviceCalled = true
    this.lastBackend = new MockSerialBackend()
    return this.lastBackend
  }

  async listPaired(): Promise<SerialBackend[]> {
    return []
  }
}

// AutoReconnectMockFactory — listPaired returns a pre-made backend
class AutoReconnectMockFactory implements SerialBackendFactory {
  readonly id: BackendId = 'web-serial'
  readonly displayName = 'Mock Auto'
  readonly autoBackend = new MockSerialBackend()

  isAvailable() {
    return true
  }

  async pickDevice(): Promise<SerialBackend> {
    return this.autoBackend
  }

  async listPaired(): Promise<SerialBackend[]> {
    return [this.autoBackend]
  }
}

function mountWithFactories(factories: SerialBackendFactory[]) {
  return mount(App, {
    attachTo: document.body,
    global: {
      provide: { [FACTORIES_KEY as symbol]: factories },
    },
  })
}

// ---------------------------------------------------------------------------
describe('App.vue', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders the Terminal component', () => {
    const wrapper = mount(App, { attachTo: document.body })
    expect(wrapper.find('.mock-terminal').exists()).toBe(true)
  })

  it('renders a Connect button that is initially disabled', () => {
    const wrapper = mount(App, { attachTo: document.body })
    const btn = wrapper.find('button[data-testid="connect-btn"]')
    expect(btn.exists()).toBe(true)
    expect(btn.attributes('disabled')).toBeDefined()
  })

  it('renders a settings panel placeholder', () => {
    const wrapper = mount(App, { attachTo: document.body })
    expect(wrapper.find('[data-testid="settings-panel"]').exists()).toBe(true)
  })

  it('renders the BackendSelector', () => {
    const wrapper = mountWithFactories([new MockFactory()])
    expect(wrapper.find('.backend-selector').exists()).toBe(true)
  })
})

// ---------------------------------------------------------------------------
describe('App.vue — connection flow', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('connect button is enabled when a factory is injected', () => {
    const wrapper = mountWithFactories([new MockFactory()])
    const btn = wrapper.find('[data-testid="connect-btn"]')
    expect(btn.exists()).toBe(true)
    expect(btn.attributes('disabled')).toBeUndefined()
  })

  it('clicking connect calls factory.pickDevice then backend.open', async () => {
    const factory = new MockFactory()
    const wrapper = mountWithFactories([factory])
    await flushPromises() // let onMounted auto-reconnect attempt finish
    await wrapper.find('[data-testid="connect-btn"]').trigger('click')
    await flushPromises()
    expect(factory.pickDeviceCalled).toBe(true)
    expect(factory.lastBackend?.isOpen).toBe(true)
  })

  it('shows Disconnect button and hides Connect after connecting', async () => {
    const factory = new MockFactory()
    const wrapper = mountWithFactories([factory])
    await flushPromises()
    await wrapper.find('[data-testid="connect-btn"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="connect-btn"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="disconnect-btn"]').exists()).toBe(true)
  })

  it('Terminal receives readable and writable props after connecting', async () => {
    const factory = new MockFactory()
    const wrapper = mountWithFactories([factory])
    await flushPromises()
    await wrapper.find('[data-testid="connect-btn"]').trigger('click')
    await flushPromises()

    const terminal = wrapper.findComponent({ name: 'Terminal' })
    expect(terminal.props('readable')).toBe(factory.lastBackend?.readable)
    expect(terminal.props('writable')).toBe(factory.lastBackend?.writable)
  })

  it('clicking Disconnect calls backend.close', async () => {
    const factory = new MockFactory()
    const wrapper = mountWithFactories([factory])
    await flushPromises()
    await wrapper.find('[data-testid="connect-btn"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="disconnect-btn"]').trigger('click')
    await flushPromises()
    expect(factory.lastBackend?.isOpen).toBe(false)
  })

  it('shows Connect button again after disconnecting', async () => {
    const factory = new MockFactory()
    const wrapper = mountWithFactories([factory])
    await flushPromises()
    await wrapper.find('[data-testid="connect-btn"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="disconnect-btn"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="connect-btn"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="disconnect-btn"]').exists()).toBe(false)
  })

  it('backend selector is disabled while connected', async () => {
    const factory = new MockFactory()
    const wrapper = mountWithFactories([factory])
    await flushPromises()
    await wrapper.find('[data-testid="connect-btn"]').trigger('click')
    await flushPromises()
    const select = wrapper.find('select')
    expect(select.attributes('disabled')).toBeDefined()
  })

  it('backend selector is re-enabled after disconnecting', async () => {
    const factory = new MockFactory()
    const wrapper = mountWithFactories([factory])
    await flushPromises()
    await wrapper.find('[data-testid="connect-btn"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="disconnect-btn"]').trigger('click')
    await flushPromises()
    const select = wrapper.find('select')
    expect(select.attributes('disabled')).toBeUndefined()
  })

  it('shows no error when user dismisses the Web Serial picker', async () => {
    // Chromium's exact phrasing when the user closes the port picker
    const factory = new MockFactory()
    factory.pickDevice = async () => {
      throw new DOMException(
        "Failed to execute 'requestPort' on 'Serial': No port selected by the user.",
        'NotFoundError',
      )
    }
    const wrapper = mountWithFactories([factory])
    await flushPromises()
    await wrapper.find('[data-testid="connect-btn"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="status-msg"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="connect-btn"]').exists()).toBe(true)
  })

  it('selects the correct factory when two are available', async () => {
    const ws = new MockFactory('web-serial', 'Web Serial')
    const usb = new MockFactory('webusb-ftdi', 'WebUSB (FTDI)')
    const wrapper = mountWithFactories([ws, usb])
    // Change selection to webusb-ftdi
    await wrapper.find('select').setValue('webusb-ftdi')
    await wrapper.find('[data-testid="connect-btn"]').trigger('click')
    await flushPromises()
    expect(usb.pickDeviceCalled).toBe(true)
    expect(ws.pickDeviceCalled).toBe(false)
  })
})

// ---------------------------------------------------------------------------
describe('App.vue — settings panel', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders baud rate select', () => {
    const wrapper = mountWithFactories([new MockFactory()])
    expect(wrapper.find('[data-testid="baud-select"]').exists()).toBe(true)
  })

  it('renders data bits select', () => {
    const wrapper = mountWithFactories([new MockFactory()])
    expect(wrapper.find('[data-testid="databits-select"]').exists()).toBe(true)
  })

  it('renders parity select', () => {
    const wrapper = mountWithFactories([new MockFactory()])
    expect(wrapper.find('[data-testid="parity-select"]').exists()).toBe(true)
  })

  it('renders stop bits select', () => {
    const wrapper = mountWithFactories([new MockFactory()])
    expect(wrapper.find('[data-testid="stopbits-select"]').exists()).toBe(true)
  })

  it('renders flow control select', () => {
    const wrapper = mountWithFactories([new MockFactory()])
    expect(wrapper.find('[data-testid="flowcontrol-select"]').exists()).toBe(true)
  })

  it('renders local echo checkbox', () => {
    const wrapper = mountWithFactories([new MockFactory()])
    expect(wrapper.find('[data-testid="echo-checkbox"]').exists()).toBe(true)
  })

  it('renders a reset button', () => {
    const wrapper = mountWithFactories([new MockFactory()])
    expect(wrapper.find('[data-testid="reset-btn"]').exists()).toBe(true)
  })

  it('settings controls are disabled while connected', async () => {
    const factory = new MockFactory()
    const wrapper = mountWithFactories([factory])
    await flushPromises()
    await wrapper.find('[data-testid="connect-btn"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="baud-select"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="reset-btn"]').attributes('disabled')).toBeDefined()
  })

  it('echo checkbox remains enabled while connected', async () => {
    const factory = new MockFactory()
    const wrapper = mountWithFactories([factory])
    await flushPromises()
    await wrapper.find('[data-testid="connect-btn"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="echo-checkbox"]').attributes('disabled')).toBeUndefined()
  })

  it('disconnect() resets state even when backend.close() throws', async () => {
    const factory = new MockFactory()
    const wrapper = mountWithFactories([factory])
    await flushPromises()
    await wrapper.find('[data-testid="connect-btn"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="disconnect-btn"]').exists()).toBe(true)

    // Make close() throw to simulate a dead port
    factory.lastBackend!.close = async () => { throw new Error('port already closed') }

    await wrapper.find('[data-testid="disconnect-btn"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="connect-btn"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="disconnect-btn"]').exists()).toBe(false)
  })

  it('resets to disconnected when Terminal emits disconnect', async () => {
    const factory = new MockFactory()
    const wrapper = mountWithFactories([factory])
    await flushPromises()
    await wrapper.find('[data-testid="connect-btn"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="disconnect-btn"]').exists()).toBe(true)

    // Simulate unexpected device removal from the Terminal component
    const terminal = wrapper.findComponent({ name: 'Terminal' })
    await terminal.vm.$emit('disconnect')
    await flushPromises()

    expect(wrapper.find('[data-testid="connect-btn"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="disconnect-btn"]').exists()).toBe(false)
  })

  it('connect uses the current baud rate setting', async () => {
    const factory = new MockFactory()
    const wrapper = mountWithFactories([factory])
    await wrapper.find('[data-testid="baud-select"]').setValue('9600')
    await wrapper.find('[data-testid="connect-btn"]').trigger('click')
    await flushPromises()
    expect(factory.lastBackend?.lastOptions?.baudRate).toBe(9600)
  })
})

// ---------------------------------------------------------------------------
describe('App.vue — auto-reconnect', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('auto-connects on mount when listPaired returns a device', async () => {
    const factory = new AutoReconnectMockFactory()
    mountWithFactories([factory])
    await flushPromises()
    expect(factory.autoBackend?.isOpen).toBe(true)
  })

  it('shows auto-reconnect status message after auto-connect', async () => {
    const factory = new AutoReconnectMockFactory()
    const wrapper = mountWithFactories([factory])
    await flushPromises()
    expect(wrapper.find('[data-testid="status-msg"]').exists()).toBe(true)
  })

  it('does not auto-connect when listPaired returns empty', async () => {
    const factory = new MockFactory()
    const wrapper = mountWithFactories([factory])
    await flushPromises()
    expect(wrapper.find('[data-testid="connect-btn"]').attributes('disabled')).toBeUndefined()
    expect(factory.pickDeviceCalled).toBe(false)
  })

  it('manual connect is blocked while auto-reconnect is in progress', async () => {
    // Hold listPaired in-flight to keep the auto-reconnect window open
    let resolveList!: (backends: SerialBackend[]) => void
    const pickDeviceSpy = vi.fn().mockResolvedValue(new MockSerialBackend())
    const factory: SerialBackendFactory = {
      id: 'web-serial',
      displayName: 'Mock',
      isAvailable: () => true,
      pickDevice: pickDeviceSpy,
      listPaired: () => new Promise((r) => { resolveList = r }),
    }

    const wrapper = mountWithFactories([factory])
    // Click connect while listPaired is still pending (isConnecting=true from onMounted)
    await wrapper.find('[data-testid="connect-btn"]').trigger('click')
    // pickDevice must not have been called — connect() returned early
    expect(pickDeviceSpy).not.toHaveBeenCalled()

    // Let auto-reconnect complete, then connect should work normally
    resolveList([])
    await flushPromises()
    await wrapper.find('[data-testid="connect-btn"]').trigger('click')
    await flushPromises()
    expect(pickDeviceSpy).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
describe('App.vue — clear terminal', () => {
  beforeEach(() => {
    localStorage.clear()
    terminalClear.mockClear()
  })

  it('renders an always-visible Clear button', () => {
    const wrapper = mount(App, { attachTo: document.body })
    expect(wrapper.find('[data-testid="clear-btn"]').exists()).toBe(true)
  })

  it('clears the terminal when the Clear button is clicked', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await wrapper.get('[data-testid="clear-btn"]').trigger('click')
    expect(terminalClear).toHaveBeenCalled()
  })

  it('clears the terminal on the default hotkey (Ctrl+Shift+K)', () => {
    mount(App, { attachTo: document.body })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'K', ctrlKey: true, shiftKey: true }))
    expect(terminalClear).toHaveBeenCalled()
  })

  it('does not clear on a non-matching key (missing modifier)', () => {
    mount(App, { attachTo: document.body })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'K', ctrlKey: true })) // no Shift
    expect(terminalClear).not.toHaveBeenCalled()
  })
})
