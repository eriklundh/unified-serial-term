import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ConnectionSelect from './ConnectionSelect.vue'
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

const ws = () => makeFactory('web-serial', 'Web Serial', true)
const usb = () => makeFactory('webusb-ftdi', 'WebUSB (FTDI)', true)

function mountSelect(props: Partial<InstanceType<typeof ConnectionSelect>['$props']> = {}) {
  return mount(ConnectionSelect, {
    props: {
      factories: [ws(), usb()],
      paired: [],
      modelValue: 'web-serial',
      disabled: false,
      ...props,
    },
  })
}

describe('ConnectionSelect.vue', () => {
  it('is labelled "Serial connect:"', () => {
    const wrapper = mountSelect()
    expect(wrapper.find('label').text()).toBe('Serial connect:')
  })

  it('lists a Request action per available backend (value = backend id)', () => {
    const wrapper = mountSelect()
    const values = wrapper.findAll('option').map((o) => o.element.value)
    expect(values).toContain('web-serial')
    expect(values).toContain('webusb-ftdi')
  })

  it('filters out unavailable backends', () => {
    const wrapper = mountSelect({
      factories: [ws(), makeFactory('webusb-ftdi', 'WebUSB (FTDI)', false)],
    })
    const values = wrapper.findAll('option').map((o) => o.element.value)
    expect(values).toContain('web-serial')
    expect(values).not.toContain('webusb-ftdi')
  })

  it('lists paired devices from both backends with their labels', () => {
    const wrapper = mountSelect({
      paired: [
        { key: 'web-serial#0', label: 'FTDI FT-X' },
        { key: 'webusb-ftdi#0', label: 'FTDI FT232R' },
      ],
    })
    const options = wrapper.findAll('option')
    const byValue = new Map(options.map((o) => [o.element.value, o.text()]))
    expect(byValue.get('paired:web-serial#0')).toBe('FTDI FT-X')
    expect(byValue.get('paired:webusb-ftdi#0')).toBe('FTDI FT232R')
  })

  it('emits update:modelValue with the backend id for a Request entry', async () => {
    const wrapper = mountSelect()
    await wrapper.find('select').setValue('webusb-ftdi')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['webusb-ftdi'])
  })

  it('emits update:modelValue with paired:<key> for a paired entry', async () => {
    const wrapper = mountSelect({
      paired: [{ key: 'web-serial#0', label: 'FTDI FT-X' }],
    })
    await wrapper.find('select').setValue('paired:web-serial#0')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['paired:web-serial#0'])
  })

  it('emits refresh when the select gains focus (so paired list is fresh)', async () => {
    const wrapper = mountSelect()
    await wrapper.find('select').trigger('focus')
    expect(wrapper.emitted('refresh')).toBeTruthy()
  })

  it('reflects modelValue as the selected option', () => {
    const wrapper = mountSelect({ modelValue: 'webusb-ftdi' })
    const select = wrapper.find('select').element as HTMLSelectElement
    expect(select.value).toBe('webusb-ftdi')
  })

  it('disables the select when disabled prop is true', () => {
    const wrapper = mountSelect({ disabled: true })
    expect(wrapper.find('select').attributes('disabled')).toBeDefined()
  })

  it('shows the use-Chromium message and no select when no backends are available', () => {
    const wrapper = mountSelect({
      factories: [makeFactory('webusb-ftdi', 'WebUSB (FTDI)', false)],
      modelValue: '',
    })
    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.find('[data-testid="no-backend-msg"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="no-backend-msg"]').text()).toMatch(/chromium/i)
  })
})
