import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Splash from './Splash.vue'

describe('Splash.vue', () => {
  it('renders the project name', () => {
    const wrapper = mount(Splash)
    expect(wrapper.text()).toContain('Unified Serial Console')
  })

  it('has the splash-overlay testid', () => {
    const wrapper = mount(Splash)
    expect(wrapper.find('[data-testid="splash-overlay"]').exists()).toBe(true)
  })

  it('renders a "Don\'t show again" checkbox', () => {
    const wrapper = mount(Splash)
    expect(wrapper.find('[data-testid="dont-show-again"]').exists()).toBe(true)
  })

  it('emits dontShowAgain when the checkbox is checked', async () => {
    const wrapper = mount(Splash)
    await wrapper.find('[data-testid="dont-show-again"]').setValue(true)
    expect(wrapper.emitted('dontShowAgain')).toBeTruthy()
  })
})
