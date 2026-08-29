/** @vitest-environment jsdom */

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { h } from 'vue'

import AccessShell from '../AccessShell.vue'

const stubs = {
  ProductBrand: { template: '<div class="product-brand-stub" />' },
  AppUtilityMenu: { template: '<div class="app-utility-menu-stub" />' },
}

describe('AccessShell', () => {
  it('renders without has-rail class when railItems is empty', () => {
    const wrapper = mount(AccessShell, {
      props: {
        title: 'Token Inbox',
        railItems: [],
      },
      slots: {
        default: () => h('div', { class: 'access-mail-workbench' }, 'Workbench content'),
      },
      global: { stubs },
    })

    expect(wrapper.classes()).not.toContain('has-rail')
    expect(wrapper.find('aside.access-sidebar').exists()).toBe(false)
    expect(wrapper.find('.access-view .access-mail-workbench').exists()).toBe(true)
    expect(wrapper.find('.access-view .access-mail-workbench').text()).toBe('Workbench content')
    wrapper.unmount()
  })

  it('renders with has-rail class and sidebar navigation when railItems are provided', () => {
    const wrapper = mount(AccessShell, {
      props: {
        title: 'User Portal',
        railItems: [
          { id: 'mailbox', label: '收件箱', icon: 'mailbox', badge: '5' },
          { id: 'settings', label: '设置', icon: 'account' },
        ],
        activeId: 'mailbox',
      },
      slots: {
        default: () => h('div', { class: 'workbench-pane' }, 'User Workbench'),
      },
      global: { stubs },
    })

    expect(wrapper.classes()).toContain('has-rail')
    expect(wrapper.find('aside.access-sidebar').exists()).toBe(true)
    const railItems = wrapper.findAll('.rail-item')
    expect(railItems.length).toBe(2)
    expect(railItems[0].classes()).toContain('is-active')
    expect(railItems[0].text()).toContain('收件箱')
    expect(railItems[0].text()).toContain('5')
    wrapper.unmount()
  })

  it('emits select event when a rail item is clicked', async () => {
    const wrapper = mount(AccessShell, {
      props: {
        title: 'User Portal',
        railItems: [
          { id: 'mailbox', label: '收件箱', icon: 'mailbox' },
          { id: 'settings', label: '设置', icon: 'account' },
        ],
        activeId: 'mailbox',
      },
      global: { stubs },
    })

    const railItems = wrapper.findAll('.rail-item')
    await railItems[1].trigger('click')
    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')[0]).toEqual(['settings'])
    wrapper.unmount()
  })
})
