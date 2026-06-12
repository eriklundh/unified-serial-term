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

  it('renders The Joy of Engineering silhouette as an inline SVG', () => {
    const wrapper = mount(Splash)
    const logo = wrapper.find('[data-testid="splash-logo"]')
    expect(logo.exists()).toBe(true)
    expect(logo.find('svg').exists()).toBe(true)
  })

  it('credits the author', () => {
    const wrapper = mount(Splash)
    expect(wrapper.text()).toContain('Erik Lundh')
    expect(wrapper.text()).toContain('The Joy of Engineering')
  })

  it('shows the release version and date from the build-time define', () => {
    const wrapper = mount(Splash)
    const version = wrapper.find('[data-testid="splash-version"]')
    expect(version.exists()).toBe(true)
    expect(version.text()).toBe(`v${__APP_VERSION__} · ${__APP_RELEASE_DATE__}`)
    // The injected values come from package.json / CHANGELOG.md, not literals.
    expect(__APP_VERSION__).toMatch(/^\d+\.\d+\.\d+$/)
    expect(__APP_RELEASE_DATE__).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('mentions both backends in the tagline', () => {
    const wrapper = mount(Splash)
    expect(wrapper.text()).toContain('WebUSB')
    expect(wrapper.text()).toContain('Web Serial')
  })

  it('links to the ftdi-unbind companion project and explains it', () => {
    const wrapper = mount(Splash)
    const link = wrapper.find('[data-testid="splash-ftdi-unbind-link"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toContain('ftdi-unbind')
    expect(wrapper.text()).toContain('ftdi-unbind')
    expect(wrapper.text()).toMatch(/serial driver/i)
  })
})
