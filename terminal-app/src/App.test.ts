import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import App from './App.vue'
import type { BackendId, SerialBackend, SerialBackendFactory } from './backends/SerialBackend'
import { MockSerialBackend } from './backends/MockSerialBackend'
import { FACTORY_KEY } from './backends/injectionKeys'

vi.mock('./components/Terminal.vue', () => ({
  default: {
    name: 'Terminal',
    template: '<div class="mock-terminal" />',
    props: ['readable', 'writable'],
  },
}))

// ---------------------------------------------------------------------------
// MockFactory — injects a controllable factory for App tests
// ---------------------------------------------------------------------------
class MockFactory implements SerialBackendFactory {
  readonly id: BackendId = 'web-serial'
  readonly displayName = 'Mock'
  pickDeviceCalled = false
  lastBackend: MockSerialBackend | null = null

  isAvailable() {
    return true
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

function mountWithFactory(factory: MockFactory) {
  return mount(App, {
    attachTo: document.body,
    global: {
      provide: { [FACTORY_KEY as symbol]: factory },
    },
  })
}

// ---------------------------------------------------------------------------
describe('App.vue', () => {
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
})

// ---------------------------------------------------------------------------
describe('App.vue — connection flow', () => {
  it('connect button is enabled when a factory is injected', () => {
    const wrapper = mountWithFactory(new MockFactory())
    const btn = wrapper.find('[data-testid="connect-btn"]')
    expect(btn.exists()).toBe(true)
    expect(btn.attributes('disabled')).toBeUndefined()
  })

  it('clicking connect calls factory.pickDevice then backend.open', async () => {
    const factory = new MockFactory()
    const wrapper = mountWithFactory(factory)
    await wrapper.find('[data-testid="connect-btn"]').trigger('click')
    await flushPromises()
    expect(factory.pickDeviceCalled).toBe(true)
    expect(factory.lastBackend?.isOpen).toBe(true)
  })

  it('shows Disconnect button and hides Connect after connecting', async () => {
    const factory = new MockFactory()
    const wrapper = mountWithFactory(factory)
    await wrapper.find('[data-testid="connect-btn"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="connect-btn"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="disconnect-btn"]').exists()).toBe(true)
  })

  it('Terminal receives readable and writable props after connecting', async () => {
    const factory = new MockFactory()
    const wrapper = mountWithFactory(factory)
    await wrapper.find('[data-testid="connect-btn"]').trigger('click')
    await flushPromises()

    const terminal = wrapper.findComponent({ name: 'Terminal' })
    expect(terminal.props('readable')).toBe(factory.lastBackend?.readable)
    expect(terminal.props('writable')).toBe(factory.lastBackend?.writable)
  })

  it('clicking Disconnect calls backend.close', async () => {
    const factory = new MockFactory()
    const wrapper = mountWithFactory(factory)
    await wrapper.find('[data-testid="connect-btn"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="disconnect-btn"]').trigger('click')
    await flushPromises()
    expect(factory.lastBackend?.isOpen).toBe(false)
  })

  it('shows Connect button again after disconnecting', async () => {
    const factory = new MockFactory()
    const wrapper = mountWithFactory(factory)
    await wrapper.find('[data-testid="connect-btn"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="disconnect-btn"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="connect-btn"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="disconnect-btn"]').exists()).toBe(false)
  })
})
