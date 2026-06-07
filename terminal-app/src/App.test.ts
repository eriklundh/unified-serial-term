import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import App from './App.vue'
import type { BackendId, SerialBackend, SerialBackendFactory } from './backends/SerialBackend'
import { MockSerialBackend } from './backends/MockSerialBackend'
import { FACTORIES_KEY } from './backends/injectionKeys'
import { SYSTEM_MONO } from './settings/useAppearance'
import { suppressAutoReconnect } from './settings/reconnect'

const { terminalClear, terminalFocus, terminalSerialize, terminalFindNext, terminalFindPrev, terminalClearSearch } = vi.hoisted(() => ({
  terminalClear: vi.fn(),
  terminalFocus: vi.fn(),
  terminalSerialize: vi.fn().mockReturnValue(''),
  terminalFindNext: vi.fn().mockReturnValue(true),
  terminalFindPrev: vi.fn().mockReturnValue(true),
  terminalClearSearch: vi.fn(),
}))

vi.mock('./components/Terminal.vue', () => ({
  default: {
    name: 'Terminal',
    template: '<div class="mock-terminal" />',
    props: ['readable', 'writable', 'localEcho', 'fontFamily', 'fontSize', 'theme', 'bell', 'bellStyle'],
    emits: ['disconnect', 'openSearch', 'firstActivity'],
    setup(_props: unknown, { expose }: { expose: (e: Record<string, unknown>) => void }) {
      expose({
        clear: terminalClear,
        focus: terminalFocus,
        serialize: terminalSerialize,
        findNext: terminalFindNext,
        findPrevious: terminalFindPrev,
        clearSearch: terminalClearSearch,
      })
    },
  },
}))

vi.mock('./components/SearchBar.vue', () => ({
  default: {
    name: 'SearchBar',
    template: '<div data-testid="search-bar" />',
    emits: ['findNext', 'findPrev', 'close'],
  },
}))

vi.mock('./components/Splash.vue', () => ({
  default: {
    name: 'Splash',
    template: '<div data-testid="splash-overlay" />',
    emits: ['dontShowAgain'],
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

  it('publishes the toolbar height as --toolbar-h so the drawer clears it', () => {
    mount(App, { attachTo: document.body })
    // The drawer is offset below the toolbar via `inset: var(--toolbar-h) …`;
    // App measures the (wrap-variable) toolbar and exposes it on :root.
    const v = document.documentElement.style.getPropertyValue('--toolbar-h')
    expect(v).toMatch(/px$/)
  })

  it('renders the ConnectionSelect', () => {
    const wrapper = mountWithFactories([new MockFactory()])
    expect(wrapper.find('.connection-select').exists()).toBe(true)
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

  it('lists paired devices in the dropdown and opens the chosen one directly', async () => {
    // Stay disconnected on mount so we can drive the dropdown ourselves.
    suppressAutoReconnect()
    const factory = new AutoReconnectMockFactory() // listPaired → [autoBackend]
    const pickSpy = vi.spyOn(factory, 'pickDevice')
    const wrapper = mountWithFactories([factory])
    await flushPromises()
    expect(wrapper.find('[data-testid="connect-btn"]').exists()).toBe(true)

    // Focusing the dropdown refreshes the paired list from both backends.
    const select = wrapper.find('[data-testid="connection-select"]')
    await select.trigger('focus')
    await flushPromises()
    const pairedOption = wrapper
      .findAll('option')
      .find((o) => (o.element as HTMLOptionElement).value === 'paired:web-serial#0')
    expect(pairedOption?.text()).toBe('Mock Serial')

    // Selecting it and connecting opens THAT backend — no picker.
    await select.setValue('paired:web-serial#0')
    await wrapper.find('[data-testid="connect-btn"]').trigger('click')
    await flushPromises()
    expect(factory.autoBackend.isOpen).toBe(true)
    expect(pickSpy).not.toHaveBeenCalled()
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

  it('reset button is disabled while connected', async () => {
    const factory = new MockFactory()
    const wrapper = mountWithFactories([factory])
    await flushPromises()
    await wrapper.find('[data-testid="connect-btn"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="reset-btn"]').attributes('disabled')).toBeDefined()
  })

  it('port-config controls are enabled while connected', async () => {
    const factory = new MockFactory()
    const wrapper = mountWithFactories([factory])
    await flushPromises()
    await wrapper.find('[data-testid="connect-btn"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="baud-select"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-testid="databits-select"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-testid="parity-select"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-testid="stopbits-select"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-testid="flowcontrol-select"]').attributes('disabled')).toBeUndefined()
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

  it('surfaces a warning when backend.close() throws on disconnect', async () => {
    const factory = new MockFactory()
    const wrapper = mountWithFactories([factory])
    await flushPromises()
    await wrapper.find('[data-testid="connect-btn"]').trigger('click')
    await flushPromises()

    factory.lastBackend!.close = async () => { throw new Error('port already closed') }

    await wrapper.find('[data-testid="disconnect-btn"]').trigger('click')
    await flushPromises()

    const status = wrapper.find('[data-testid="status-msg"]')
    expect(status.exists()).toBe(true)
    expect(status.text()).toContain('port already closed')
  })

  it('clears any status message on a clean disconnect', async () => {
    const factory = new MockFactory()
    const wrapper = mountWithFactories([factory])
    await flushPromises()
    await wrapper.find('[data-testid="connect-btn"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-testid="disconnect-btn"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="status-msg"]').exists()).toBe(false)
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

  it('a manual disconnect suppresses auto-reconnect on the next load', async () => {
    const factory = new AutoReconnectMockFactory()
    const first = mountWithFactories([factory])
    await flushPromises()
    expect(first.find('[data-testid="disconnect-btn"]').exists()).toBe(true)

    await first.find('[data-testid="disconnect-btn"]').trigger('click')
    await flushPromises()
    first.unmount()

    // Simulate a page reload: a fresh mount, same still-paired device.
    const second = mountWithFactories([factory])
    await flushPromises()
    expect(second.find('[data-testid="connect-btn"]').exists()).toBe(true)
    expect(second.find('[data-testid="disconnect-btn"]').exists()).toBe(false)
  })

  it('an unexpected device drop still auto-reconnects on the next load', async () => {
    const factory = new AutoReconnectMockFactory()
    const first = mountWithFactories([factory])
    await flushPromises()

    // Device error path: the Terminal emits 'disconnect' (not a user click).
    first.findComponent({ name: 'Terminal' }).vm.$emit('disconnect')
    await flushPromises()
    first.unmount()

    const second = mountWithFactories([factory])
    await flushPromises()
    expect(second.find('[data-testid="disconnect-btn"]').exists()).toBe(true)
  })

  it('connecting again clears the suppression so a reload auto-reconnects', async () => {
    const factory = new AutoReconnectMockFactory()
    const first = mountWithFactories([factory])
    await flushPromises()
    // Manual disconnect → suppressed.
    await first.find('[data-testid="disconnect-btn"]').trigger('click')
    await flushPromises()
    // Manual connect → suppression cleared.
    await first.find('[data-testid="connect-btn"]').trigger('click')
    await flushPromises()
    expect(first.find('[data-testid="disconnect-btn"]').exists()).toBe(true)
    first.unmount()

    const second = mountWithFactories([factory])
    await flushPromises()
    expect(second.find('[data-testid="disconnect-btn"]').exists()).toBe(true)
  })

  it('does not auto-connect when listPaired returns empty', async () => {
    const factory = new MockFactory()
    const wrapper = mountWithFactories([factory])
    await flushPromises()
    expect(wrapper.find('[data-testid="connect-btn"]').attributes('disabled')).toBeUndefined()
    expect(factory.pickDeviceCalled).toBe(false)
  })

  it('closes the half-opened device when auto-reconnect open() fails', async () => {
    // A rejected open() can still leave an OS handle claimed; releasing it
    // keeps the next manual connect from failing on a busy port.
    const backend = new MockSerialBackend()
    const closeSpy = vi.spyOn(backend, 'close')
    backend.open = async () => { throw new Error('port busy') }
    const factory: SerialBackendFactory = {
      id: 'web-serial',
      displayName: 'Mock',
      isAvailable: () => true,
      pickDevice: async () => backend,
      listPaired: async () => [backend],
    }

    const wrapper = mountWithFactories([factory])
    await flushPromises()

    expect(closeSpy).toHaveBeenCalled()
    expect(wrapper.find('[data-testid="connect-btn"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="disconnect-btn"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="status-msg"]').exists()).toBe(false)
  })

  it('does not claim connected if the device is not open after auto-reconnect', async () => {
    // open() resolving is not proof of a usable port; trust isOpen and tear
    // down anything that opened but isn't actually ready.
    const backend = new MockSerialBackend()
    const closeSpy = vi.spyOn(backend, 'close')
    backend.open = async () => { /* resolves, but isOpen stays false */ }
    const factory: SerialBackendFactory = {
      id: 'web-serial',
      displayName: 'Mock',
      isAvailable: () => true,
      pickDevice: async () => backend,
      listPaired: async () => [backend],
    }

    const wrapper = mountWithFactories([factory])
    await flushPromises()

    expect(wrapper.find('[data-testid="disconnect-btn"]').exists()).toBe(false)
    expect(closeSpy).toHaveBeenCalled()
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

// ---------------------------------------------------------------------------
describe('App.vue — settings drawer & appearance', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('settings drawer is closed by default and toggles open/closed', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    expect(wrapper.find('[data-testid="settings-drawer"]').attributes('open')).toBeUndefined()
    await wrapper.get('[data-testid="settings-btn"]').trigger('click')
    expect(wrapper.find('[data-testid="settings-drawer"]').attributes('open')).toBeDefined()
    await wrapper.get('[data-testid="drawer-close"]').trigger('click')
    expect(wrapper.find('[data-testid="settings-drawer"]').attributes('open')).toBeUndefined()
  })

  it('changing the theme persists it', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await wrapper.get('[data-testid="settings-btn"]').trigger('click')
    await wrapper.get('[data-testid="theme-select"]').setValue('nord')
    await nextTick()
    expect(localStorage.getItem('appearance.themeId')).toBe('nord')
  })

  it('changing the font size persists it', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await wrapper.get('[data-testid="settings-btn"]').trigger('click')
    await wrapper.get('[data-testid="fontsize-input"]').setValue('18')
    await nextTick()
    expect(localStorage.getItem('appearance.fontSize')).toBe('18')
  })

  it('turning the clear hotkey off persists empty and shows Off', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await wrapper.get('[data-testid="settings-btn"]').trigger('click')
    await wrapper.get('[data-testid="hotkey-off"]').trigger('click')
    await nextTick()
    expect(localStorage.getItem('appearance.clearHotkey')).toBe('')
    expect(wrapper.get('[data-testid="hotkey-value"]').text()).toBe('Off')
  })

  it('rebinds the clear hotkey from a captured keypress', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await wrapper.get('[data-testid="settings-btn"]').trigger('click')
    await wrapper.get('[data-testid="hotkey-rebind"]').trigger('click')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ctrlKey: true, altKey: true }))
    await nextTick()
    expect(wrapper.get('[data-testid="hotkey-value"]').text()).toBe('Ctrl+Alt+G')
    expect(localStorage.getItem('appearance.clearHotkey')).toBe('Ctrl+Alt+G')
  })

  it('changing the font persists the selected family stack', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await wrapper.get('[data-testid="settings-btn"]').trigger('click')
    const stack = `'Source Code Pro', ${SYSTEM_MONO}`
    await wrapper.get('[data-testid="font-select"]').setValue(stack)
    await nextTick()
    expect(localStorage.getItem('appearance.fontFamily')).toBe(stack)
  })
})

// ---------------------------------------------------------------------------
describe('App.vue — toolbar focus return (Phase 10A)', () => {
  beforeEach(() => {
    localStorage.clear()
    terminalFocus.mockClear()
  })

  it('clicking Clear returns focus to the terminal', async () => {
    const wrapper = mountWithFactories([new MockFactory()])
    await flushPromises()
    terminalFocus.mockClear()
    await wrapper.find('[data-testid="clear-btn"]').trigger('click')
    await flushPromises()
    expect(terminalFocus).toHaveBeenCalled()
  })

  it('clicking Download returns focus to the terminal', async () => {
    URL.createObjectURL = vi.fn().mockReturnValue('blob:test')
    URL.revokeObjectURL = vi.fn()
    const wrapper = mountWithFactories([])
    await flushPromises()
    terminalFocus.mockClear()
    await wrapper.find('[data-testid="download-btn"]').trigger('click')
    await flushPromises()
    expect(terminalFocus).toHaveBeenCalled()
  })

  it('connecting returns focus to the terminal', async () => {
    const wrapper = mountWithFactories([new MockFactory()])
    await flushPromises()
    terminalFocus.mockClear()
    await wrapper.find('[data-testid="connect-btn"]').trigger('click')
    await flushPromises()
    expect(terminalFocus).toHaveBeenCalled()
  })

  it('a cancelled connect still returns focus to the terminal', async () => {
    const factory = new MockFactory()
    factory.pickDevice = async () => {
      throw new DOMException('No port selected by the user.', 'NotFoundError')
    }
    const wrapper = mountWithFactories([factory])
    await flushPromises()
    terminalFocus.mockClear()
    await wrapper.find('[data-testid="connect-btn"]').trigger('click')
    await flushPromises()
    expect(terminalFocus).toHaveBeenCalled()
  })

  it('disconnecting returns focus to the terminal', async () => {
    const wrapper = mountWithFactories([new MockFactory()])
    await flushPromises()
    await wrapper.find('[data-testid="connect-btn"]').trigger('click')
    await flushPromises()
    terminalFocus.mockClear()
    await wrapper.find('[data-testid="disconnect-btn"]').trigger('click')
    await flushPromises()
    expect(terminalFocus).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
describe('App.vue — toolbar (Phase 10C)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('baud-rate select is in the toolbar, not the settings drawer', () => {
    const wrapper = mountWithFactories([new MockFactory()])
    expect(wrapper.find('.toolbar [data-testid="baud-select"]').exists()).toBe(true)
    expect(
      wrapper.find('[data-testid="settings-drawer"] [data-testid="baud-select"]').exists(),
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
describe('App.vue — SerialSettings popover (Phase 10D)', () => {
  beforeEach(() => {
    localStorage.clear()
    terminalFocus.mockClear()
  })

  it('renders a Serial Settings button in the toolbar', () => {
    const wrapper = mountWithFactories([new MockFactory()])
    expect(wrapper.find('.toolbar [data-testid="serial-settings-btn"]').exists()).toBe(true)
  })

  it('serial settings dialog is closed by default', () => {
    const wrapper = mountWithFactories([new MockFactory()])
    expect(wrapper.find('[data-testid="serial-settings-dialog"]').attributes('open')).toBeUndefined()
  })

  it('clicking Serial Settings button opens the dialog', async () => {
    const wrapper = mountWithFactories([new MockFactory()])
    await wrapper.find('[data-testid="serial-settings-btn"]').trigger('click')
    expect(wrapper.find('[data-testid="serial-settings-dialog"]').attributes('open')).toBeDefined()
  })

  it('clicking close in serial settings closes the dialog', async () => {
    const wrapper = mountWithFactories([new MockFactory()])
    await wrapper.find('[data-testid="serial-settings-btn"]').trigger('click')
    await wrapper.find('[data-testid="serial-settings-close"]').trigger('click')
    expect(wrapper.find('[data-testid="serial-settings-dialog"]').attributes('open')).toBeUndefined()
  })

  it('serial settings dialog contains all port-config controls', () => {
    const wrapper = mountWithFactories([new MockFactory()])
    const dialog = wrapper.find('[data-testid="serial-settings-dialog"]')
    expect(dialog.find('[data-testid="databits-select"]').exists()).toBe(true)
    expect(dialog.find('[data-testid="parity-select"]').exists()).toBe(true)
    expect(dialog.find('[data-testid="stopbits-select"]').exists()).toBe(true)
    expect(dialog.find('[data-testid="flowcontrol-select"]').exists()).toBe(true)
    expect(dialog.find('[data-testid="echo-checkbox"]').exists()).toBe(true)
    expect(dialog.find('[data-testid="reset-btn"]').exists()).toBe(true)
  })

  it('port-config controls in serial settings are enabled while connected', async () => {
    const factory = new MockFactory()
    const wrapper = mountWithFactories([factory])
    await flushPromises()
    await wrapper.find('[data-testid="connect-btn"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="databits-select"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-testid="parity-select"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-testid="stopbits-select"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-testid="flowcontrol-select"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-testid="reset-btn"]').attributes('disabled')).toBeDefined()
  })

  it('echo remains enabled in serial settings while connected', async () => {
    const factory = new MockFactory()
    const wrapper = mountWithFactories([factory])
    await flushPromises()
    await wrapper.find('[data-testid="connect-btn"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="echo-checkbox"]').attributes('disabled')).toBeUndefined()
  })

  it('closing serial settings returns focus to the terminal', async () => {
    const wrapper = mountWithFactories([new MockFactory()])
    await flushPromises()
    terminalFocus.mockClear()
    await wrapper.find('[data-testid="serial-settings-btn"]').trigger('click')
    await nextTick()
    await wrapper.find('[data-testid="serial-settings-close"]').trigger('click')
    await flushPromises()
    expect(terminalFocus).toHaveBeenCalled()
  })

  it('port-config controls are NOT in the settings drawer', () => {
    const wrapper = mountWithFactories([new MockFactory()])
    const drawer = wrapper.find('[data-testid="settings-drawer"]')
    expect(drawer.find('[data-testid="databits-select"]').exists()).toBe(false)
    expect(drawer.find('[data-testid="parity-select"]').exists()).toBe(false)
    expect(drawer.find('[data-testid="reset-btn"]').exists()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
describe('App.vue — fullscreen button (Phase 10F)', () => {
  beforeEach(() => {
    localStorage.clear()
    terminalFocus.mockClear()
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => true })
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null })
  })

  it('fullscreen button is visible when fullscreenEnabled is true', () => {
    const wrapper = mountWithFactories([])
    expect(wrapper.find('[data-testid="fullscreen-btn"]').exists()).toBe(true)
  })

  it('fullscreen button is hidden when fullscreenEnabled is false', () => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => false })
    const wrapper = mountWithFactories([])
    expect(wrapper.find('[data-testid="fullscreen-btn"]').exists()).toBe(false)
  })

  it('button title is "Enter fullscreen" when not in fullscreen', () => {
    const wrapper = mountWithFactories([])
    expect(wrapper.find('[data-testid="fullscreen-btn"]').attributes('title')).toBe('Enter fullscreen')
  })

  it('clicking fullscreen button calls requestFullscreen on the app root', async () => {
    const reqFS = vi.fn().mockResolvedValue(undefined)
    const wrapper = mountWithFactories([])
    ;(wrapper.find('.app').element as HTMLElement).requestFullscreen = reqFS
    await wrapper.find('[data-testid="fullscreen-btn"]').trigger('click')
    await flushPromises()
    expect(reqFS).toHaveBeenCalled()
  })

  it('button title changes to "Exit fullscreen" after fullscreenchange fires', async () => {
    const wrapper = mountWithFactories([])
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => document.body,
    })
    document.dispatchEvent(new Event('fullscreenchange'))
    await nextTick()
    expect(wrapper.find('[data-testid="fullscreen-btn"]').attributes('title')).toBe('Exit fullscreen')
  })

  it('clicking in fullscreen state calls document.exitFullscreen', async () => {
    const exitFS = vi.fn().mockResolvedValue(undefined)
    document.exitFullscreen = exitFS
    const wrapper = mountWithFactories([])
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => document.body,
    })
    document.dispatchEvent(new Event('fullscreenchange'))
    await nextTick()
    await wrapper.find('[data-testid="fullscreen-btn"]').trigger('click')
    await flushPromises()
    expect(exitFS).toHaveBeenCalled()
  })

  it('focus returns to terminal after clicking fullscreen', async () => {
    const reqFS = vi.fn().mockResolvedValue(undefined)
    const wrapper = mountWithFactories([])
    ;(wrapper.find('.app').element as HTMLElement).requestFullscreen = reqFS
    await wrapper.find('[data-testid="fullscreen-btn"]').trigger('click')
    await flushPromises()
    expect(terminalFocus).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
describe('App.vue — live reconfigure while connected', () => {
  beforeEach(() => {
    localStorage.clear()
    suppressAutoReconnect()
  })

  it('changing baud rate while connected calls reconfigure on the backend', async () => {
    const factory = new MockFactory()
    const wrapper = mountWithFactories([factory])
    await flushPromises()
    await wrapper.find('[data-testid="connect-btn"]').trigger('click')
    await flushPromises()

    const spy = vi.spyOn(factory.lastBackend!, 'reconfigure')
    await wrapper.find('[data-testid="baud-select"]').setValue('9600')
    await flushPromises()

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ baudRate: 9600 }))
  })

  it('changing a setting while NOT connected does not call reconfigure', async () => {
    const factory = new MockFactory()
    const wrapper = mountWithFactories([factory])
    await flushPromises()

    const mockBackend = new MockSerialBackend()
    const spy = vi.spyOn(mockBackend, 'reconfigure')
    await wrapper.find('[data-testid="baud-select"]').setValue('9600')
    await flushPromises()

    expect(spy).not.toHaveBeenCalled()
  })

  it('reconfigure failure shows a status message', async () => {
    const factory = new MockFactory()
    const wrapper = mountWithFactories([factory])
    await flushPromises()
    await wrapper.find('[data-testid="connect-btn"]').trigger('click')
    await flushPromises()

    factory.lastBackend!.reconfigure = async () => { throw new Error('port busy') }
    await wrapper.find('[data-testid="baud-select"]').setValue('9600')
    await flushPromises()

    expect(wrapper.find('[data-testid="status-msg"]').text()).toContain('Reconfigure failed')
  })
})

// ---------------------------------------------------------------------------
describe('App.vue — toolbar reflow (Phase 10G)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('Serial Settings button appears before Clear button in the toolbar', () => {
    const wrapper = mountWithFactories([new MockFactory()])
    const serialSettingsBtn = wrapper.find('[data-testid="serial-settings-btn"]').element
    const clearBtn = wrapper.find('[data-testid="clear-btn"]').element
    // DOCUMENT_POSITION_FOLLOWING (4) means clearBtn follows serialSettingsBtn
    const position = serialSettingsBtn.compareDocumentPosition(clearBtn)
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('Download button appears after Clear button in the toolbar', () => {
    const wrapper = mountWithFactories([new MockFactory()])
    const clearBtn = wrapper.find('[data-testid="clear-btn"]').element
    const downloadBtn = wrapper.find('[data-testid="download-btn"]').element
    const position = clearBtn.compareDocumentPosition(downloadBtn)
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
describe('App.vue — search (Phase 11C)', () => {
  beforeEach(() => {
    localStorage.clear()
    suppressAutoReconnect()
  })

  it('search bar is not shown by default', () => {
    const wrapper = mountWithFactories([new MockFactory()])
    expect(wrapper.find('[data-testid="search-bar"]').exists()).toBe(false)
  })

  it('Ctrl+F shows the search bar', async () => {
    const wrapper = mountWithFactories([new MockFactory()])
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true }))
    await nextTick()
    expect(wrapper.find('[data-testid="search-bar"]').exists()).toBe(true)
  })

  it('search bar close event hides the search bar', async () => {
    const wrapper = mountWithFactories([new MockFactory()])
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true }))
    await nextTick()
    expect(wrapper.find('[data-testid="search-bar"]').exists()).toBe(true)
    wrapper.findComponent({ name: 'SearchBar' }).vm.$emit('close')
    await nextTick()
    expect(wrapper.find('[data-testid="search-bar"]').exists()).toBe(false)
  })

  it('openSearch event from terminal shows the search bar', async () => {
    const wrapper = mountWithFactories([new MockFactory()])
    wrapper.findComponent({ name: 'Terminal' }).vm.$emit('openSearch')
    await nextTick()
    expect(wrapper.find('[data-testid="search-bar"]').exists()).toBe(true)
  })
})

// ---------------------------------------------------------------------------
describe('App.vue — splash (Phase 11D)', () => {
  beforeEach(() => {
    localStorage.clear()
    suppressAutoReconnect()
  })

  it('splash overlay is visible on load by default', () => {
    const wrapper = mountWithFactories([new MockFactory()])
    expect(wrapper.find('[data-testid="splash-overlay"]').exists()).toBe(true)
  })

  it('splash is hidden when Terminal emits firstActivity', async () => {
    const wrapper = mountWithFactories([new MockFactory()])
    expect(wrapper.find('[data-testid="splash-overlay"]').exists()).toBe(true)
    wrapper.findComponent({ name: 'Terminal' }).vm.$emit('firstActivity')
    await nextTick()
    expect(wrapper.find('[data-testid="splash-overlay"]').exists()).toBe(false)
  })

  it('splash is not shown when localStorage splash-dismissed is set', () => {
    localStorage.setItem('splash-dismissed', 'true')
    const wrapper = mountWithFactories([new MockFactory()])
    expect(wrapper.find('[data-testid="splash-overlay"]').exists()).toBe(false)
  })

  it('dontShowAgain from Splash hides it and persists to localStorage', async () => {
    const wrapper = mountWithFactories([new MockFactory()])
    wrapper.findComponent({ name: 'Splash' }).vm.$emit('dontShowAgain')
    await nextTick()
    expect(wrapper.find('[data-testid="splash-overlay"]').exists()).toBe(false)
    expect(localStorage.getItem('splash-dismissed')).toBe('true')
  })
})
