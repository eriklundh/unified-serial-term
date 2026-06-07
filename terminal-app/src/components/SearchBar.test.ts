import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import SearchBar from './SearchBar.vue'

describe('SearchBar.vue', () => {
  it('renders a search input and next/prev/close buttons', () => {
    const wrapper = mount(SearchBar, { attachTo: document.body })
    expect(wrapper.find('[data-testid="search-input"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="search-next"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="search-prev"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="search-close"]').exists()).toBe(true)
  })

  it('emits findNext with the current term when Next button is clicked', async () => {
    const wrapper = mount(SearchBar, { attachTo: document.body })
    const input = wrapper.find<HTMLInputElement>('[data-testid="search-input"]')
    await input.setValue('hello')
    await wrapper.find('[data-testid="search-next"]').trigger('click')
    expect(wrapper.emitted('findNext')).toEqual([['hello']])
  })

  it('emits findPrev with the current term when Prev button is clicked', async () => {
    const wrapper = mount(SearchBar, { attachTo: document.body })
    const input = wrapper.find<HTMLInputElement>('[data-testid="search-input"]')
    await input.setValue('world')
    await wrapper.find('[data-testid="search-prev"]').trigger('click')
    expect(wrapper.emitted('findPrev')).toEqual([['world']])
  })

  it('emits close when close button is clicked', async () => {
    const wrapper = mount(SearchBar, { attachTo: document.body })
    await wrapper.find('[data-testid="search-close"]').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('emits findNext when Enter is pressed in the input', async () => {
    const wrapper = mount(SearchBar, { attachTo: document.body })
    const input = wrapper.find<HTMLInputElement>('[data-testid="search-input"]')
    await input.setValue('test')
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('findNext')).toEqual([['test']])
  })

  it('emits close when Escape is pressed in the input', async () => {
    const wrapper = mount(SearchBar, { attachTo: document.body })
    const input = wrapper.find('[data-testid="search-input"]')
    await input.trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('focuses the input on mount', async () => {
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus')
    mount(SearchBar, { attachTo: document.body })
    expect(focusSpy).toHaveBeenCalled()
    focusSpy.mockRestore()
  })
})
