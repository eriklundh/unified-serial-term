import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import App from './App.vue'

vi.mock('./components/Terminal.vue', () => ({
  default: { template: '<div class="mock-terminal" />' },
}))

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
