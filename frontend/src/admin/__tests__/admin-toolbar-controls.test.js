/** @vitest-environment jsdom */

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminDomainDropdown from '../components/AdminDomainDropdown.vue'
import AdminRefreshButton from '../components/AdminRefreshButton.vue'

let wrapper
afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.restoreAllMocks()
})

describe('shared admin toolbar controls', () => {
    it('preserves the supplied refresh label and blocks clicks while disabled', async () => {
        const refresh = vi.fn()
        wrapper = mount(AdminRefreshButton, {
            props: { label: '刷新', disabled: true, onClick: refresh },
        })
        const button = wrapper.get('button')
        expect(button.attributes('title')).toBe('刷新')
        expect(button.attributes('aria-label')).toBe('刷新')
        await button.trigger('click')
        expect(refresh).not.toHaveBeenCalled()
        await wrapper.setProps({ disabled: false, label: 'Refresh' })
        await button.trigger('click')
        expect(refresh).toHaveBeenCalledTimes(1)
        expect(button.attributes('aria-label')).toBe('Refresh')
    })

    it('keeps parent-provided labels and counts and emits the selected domain', async () => {
        const select = vi.fn()
        wrapper = mount(AdminDomainDropdown, {
            props: {
                selectedDomain: 'all', allLabel: '全部域名', allCount: '1,234',
                domains: [{ domain: 'example.test', count: '1,200' }], onSelect: select,
            },
        })
        const trigger = wrapper.get('.domain-chip')
        expect(trigger.text()).toBe('全部域名')
        expect(wrapper.findAll('.domain-count-badge').map((badge) => badge.text())).toEqual(['1,234', '1,200'])
        await trigger.trigger('click')
        await wrapper.findAll('.domain-option')[1].trigger('click')
        expect(select).toHaveBeenLastCalledWith('example.test')
        expect(trigger.attributes('aria-expanded')).toBe('false')
        await wrapper.setProps({ selectedDomain: 'example.test', allCount: 1234, domains: [{ domain: 'example.test', count: 1200 }] })
        expect(trigger.text()).toBe('example.test')
        expect(trigger.classes()).toContain('is-active')
        expect(wrapper.findAll('.domain-count-badge').map((badge) => badge.text())).toEqual(['1234', '1200'])
        await trigger.trigger('click')
        await wrapper.findAll('.domain-option')[0].trigger('click')
        expect(select).toHaveBeenLastCalledWith('all')
    })

    it('closes on outside click or Escape and removes listeners on unmount', async () => {
        const remove = vi.spyOn(window, 'removeEventListener')
        wrapper = mount(AdminDomainDropdown, {
            attachTo: document.body,
            props: { selectedDomain: '', allLabel: 'All domains', allCount: 0 },
        })
        const trigger = wrapper.get('.domain-chip')
        expect(trigger.classes()).not.toContain('is-active')
        await trigger.trigger('click')
        await wrapper.get('.domain-dropdown-menu').trigger('click')
        expect(trigger.attributes('aria-expanded')).toBe('true')
        document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await wrapper.vm.$nextTick()
        expect(trigger.attributes('aria-expanded')).toBe('false')
        await trigger.trigger('click')
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        await wrapper.vm.$nextTick()
        expect(trigger.attributes('aria-expanded')).toBe('false')
        wrapper.unmount()
        wrapper = null
        expect(remove).toHaveBeenCalledWith('click', expect.any(Function))
        expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function))
    })
})
