import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BackendSelector from './BackendSelector.vue'
import type { BackendId, SerialBackendFactory } from '../backends/SerialBackend'

function makeFactory(id: BackendId, name: string, available: boolean): SerialBackendFactory {
  return {
    id,
    displayName: name,
    isAvailable: () => available,
    async pickDevice(): Promise<never> {
      throw new Error('not needed')
    },
    async listPaired() {
      return []
    },
  }
}

describe('BackendSelector.vue', () => {
  it('renders a select with all available backends as options', () => {
    const ws = makeFactory('web-serial', 'Web Serial', true)
    const usb = makeFactory('webusb-ftdi', 'WebUSB (FTDI)', true)
    const wrapper = mount(BackendSelector, {
      props: { factories: [ws, usb], modelValue: 'web-serial', disabled: false },
    })
    const options = wrapper.findAll('option')
    expect(options).toHaveLength(2)
    expect(options[0]!.text()).toBe('Web Serial')
    expect(options[1]!.text()).toBe('WebUSB (FTDI)')
  })

  it('filters out unavailable backends', () => {
    const ws = makeFactory('web-serial', 'Web Serial', true)
    const usb = makeFactory('webusb-ftdi', 'WebUSB (FTDI)', false)
    const wrapper = mount(BackendSelector, {
      props: { factories: [ws, usb], modelValue: 'web-serial', disabled: false },
    })
    const options = wrapper.findAll('option')
    expect(options).toHaveLength(1)
    expect(options[0]!.text()).toBe('Web Serial')
  })

  it('shows an error message and no select when no backends are available', () => {
    const usb = makeFactory('webusb-ftdi', 'WebUSB (FTDI)', false)
    const wrapper = mount(BackendSelector, {
      props: { factories: [usb], modelValue: null, disabled: false },
    })
    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.find('[data-testid="no-backend-msg"]').exists()).toBe(true)
  })

  it('disables the select when disabled prop is true', () => {
    const ws = makeFactory('web-serial', 'Web Serial', true)
    const wrapper = mount(BackendSelector, {
      props: { factories: [ws], modelValue: 'web-serial', disabled: true },
    })
    expect(wrapper.find('select').attributes('disabled')).toBeDefined()
  })

  it('emits update:modelValue when the selection changes', async () => {
    const ws = makeFactory('web-serial', 'Web Serial', true)
    const usb = makeFactory('webusb-ftdi', 'WebUSB (FTDI)', true)
    const wrapper = mount(BackendSelector, {
      props: { factories: [ws, usb], modelValue: 'web-serial', disabled: false },
    })
    await wrapper.find('select').setValue('webusb-ftdi')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['webusb-ftdi'])
  })

  it('reflects the modelValue as the selected option', () => {
    const ws = makeFactory('web-serial', 'Web Serial', true)
    const usb = makeFactory('webusb-ftdi', 'WebUSB (FTDI)', true)
    const wrapper = mount(BackendSelector, {
      props: { factories: [ws, usb], modelValue: 'webusb-ftdi', disabled: false },
    })
    const select = wrapper.find('select').element as HTMLSelectElement
    expect(select.value).toBe('webusb-ftdi')
  })
})
