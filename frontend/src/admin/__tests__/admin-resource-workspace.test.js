/** @vitest-environment jsdom */

import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AdminResourceWorkspace from '../components/AdminResourceWorkspace.vue'
import i18n from '../../i18n'

i18n.global.locale.value = 'zh'

const createMockModel = (overrides = {}) => ({
    activeView: 'identity',
    activePanels: [
        {
            id: 'addresses',
            kind: 'identity',
            title: '地址管理',
            columns: [
                { labelKey: 'address', type: 'entity', main: 'address', sub: 'note', tags: 'tags' },
                { labelKey: 'ownership', key: 'owner' },
                { labelKey: 'actions', key: 'actions', type: 'addressActions' },
            ],
            rows: [
                {
                    id: 'addr-1',
                    sourceId: 1,
                    address: 'user@example.test',
                    owner: 'user:1',
                    mails: 5,
                },
                {
                    id: 'addr-2',
                    sourceId: 2,
                    address: 'empty@example.test',
                    owner: 'user:2',
                    mails: 0,
                },
            ],
        },
    ],
    ui: { domain: 'all' },
    addressRows: [
        { id: 'addr-1', sourceId: 1, address: 'user@example.test', mails: 5 },
        { id: 'addr-2', sourceId: 2, address: 'empty@example.test', mails: 0 },
    ],
    actionBusy: false,
    ...overrides,
})
const createMockActions = () => ({
    openMailFromAddress: vi.fn(),
    copyText: vi.fn(),
    handleAddressRowAction: vi.fn(),
    handleDomainRowAction: vi.fn(),
    openSharePackage: vi.fn(),
    selectRow: vi.fn(),
    isSelected: vi.fn(() => false),
    handleRowKey: vi.fn(),
    openActionModal: vi.fn(),
    setFilterDomain: vi.fn(),
    handleAction: vi.fn(),
    setView: vi.fn(),
})

describe('AdminResourceWorkspace address row actions', () => {
    beforeEach(() => {
        document.body.innerHTML = ''
    })

    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('renders 2 main actions (view mail, copy) and a more menu trigger button for each address row', () => {
        const model = createMockModel()
        const actions = createMockActions()
        const wrapper = mount(AdminResourceWorkspace, {
            props: { model, actions },
            global: { plugins: [i18n] },
        })

        const addressActionContainers = wrapper.findAll('.address-actions')
        expect(addressActionContainers).toHaveLength(2)

        const firstRow = addressActionContainers[0]
        const mainButtons = firstRow.findAll(':scope > button.btn-action')
        expect(mainButtons).toHaveLength(2)
        expect(mainButtons[0].text()).toBe('查看收件')
        expect(mainButtons[1].text()).toBe('复制')

        const moreTrigger = firstRow.get('.btn-action-more')
        expect(moreTrigger.text()).toContain('更多')
        expect(moreTrigger.attributes('aria-haspopup')).toBe('menu')
        expect(moreTrigger.attributes('aria-expanded')).toBe('false')

        const menu = firstRow.get('.action-dropdown-menu')
        expect(menu.attributes('role')).toBe('menu')
        expect(menu.isVisible()).toBe(false)
        wrapper.unmount()
    })

    it('toggles the more menu open and closed upon clicking the trigger', async () => {
        const model = createMockModel()
        const actions = createMockActions()
        const wrapper = mount(AdminResourceWorkspace, {
            props: { model, actions },
            global: { plugins: [i18n] },
            attachTo: document.body,
        })

        const firstRow = wrapper.findAll('.address-actions')[0]
        const moreTrigger = firstRow.get('.btn-action-more')
        const menu = firstRow.get('.action-dropdown-menu')

        expect(moreTrigger.attributes('aria-expanded')).toBe('false')
        expect(menu.isVisible()).toBe(false)

        await moreTrigger.trigger('click')
        expect(moreTrigger.attributes('aria-expanded')).toBe('true')
        expect(menu.isVisible()).toBe(true)

        const menuItems = menu.findAll('.action-menu-item')
        expect(menuItems).toHaveLength(5)
        expect(menuItems[0].text()).toBe('凭证')
        expect(menuItems[1].text()).toBe('轮换')
        expect(menuItems[2].text()).toBe('分享')
        expect(menuItems[3].text()).toBe('清空')
        expect(menuItems[4].text()).toBe('删除')
        expect(menuItems[4].classes()).toContain('danger')

        await moreTrigger.trigger('click')
        expect(moreTrigger.attributes('aria-expanded')).toBe('false')
        expect(menu.isVisible()).toBe(false)
        wrapper.unmount()
    })

    it('dispatches main actions without opening the menu', async () => {
        const model = createMockModel()
        const actions = createMockActions()
        const wrapper = mount(AdminResourceWorkspace, {
            props: { model, actions },
            global: { plugins: [i18n] },
        })

        const firstRow = wrapper.findAll('.address-actions')[0]
        const mainButtons = firstRow.findAll(':scope > button.btn-action')

        await mainButtons[0].trigger('click')
        expect(actions.openMailFromAddress).toHaveBeenCalledWith('user@example.test')

        await mainButtons[1].trigger('click')
        expect(actions.copyText).toHaveBeenCalledWith('user@example.test')
        wrapper.unmount()
    })

    it('dispatches collapsed actions from the more menu and closes the menu', async () => {
        const model = createMockModel()
        const actions = createMockActions()
        const wrapper = mount(AdminResourceWorkspace, {
            props: { model, actions },
            global: { plugins: [i18n] },
            attachTo: document.body,
        })

        const row = model.activePanels[0].rows[0]
        const firstRow = wrapper.findAll('.address-actions')[0]
        const moreTrigger = firstRow.get('.btn-action-more')
        const menu = firstRow.get('.action-dropdown-menu')
        const menuItems = menu.findAll('.action-menu-item')

        // 1. show-credential
        await moreTrigger.trigger('click')
        await menuItems[0].trigger('click')
        expect(actions.handleAddressRowAction).toHaveBeenCalledWith(row, 'show-credential')
        expect(moreTrigger.attributes('aria-expanded')).toBe('false')

        // 2. rotate
        await moreTrigger.trigger('click')
        await menuItems[1].trigger('click')
        expect(actions.handleAddressRowAction).toHaveBeenCalledWith(row, 'rotate')
        expect(moreTrigger.attributes('aria-expanded')).toBe('false')

        // 3. share
        await moreTrigger.trigger('click')
        await menuItems[2].trigger('click')
        expect(actions.openSharePackage).toHaveBeenCalledWith(row)
        expect(moreTrigger.attributes('aria-expanded')).toBe('false')

        // 4. clear-inbox
        await moreTrigger.trigger('click')
        await menuItems[3].trigger('click')
        expect(actions.handleAddressRowAction).toHaveBeenCalledWith(row, 'clear-inbox')
        expect(moreTrigger.attributes('aria-expanded')).toBe('false')

        // 5. delete-address
        await moreTrigger.trigger('click')
        await menuItems[4].trigger('click')
        expect(actions.handleAddressRowAction).toHaveBeenCalledWith(row, 'delete-address')
        expect(moreTrigger.attributes('aria-expanded')).toBe('false')

        wrapper.unmount()
    })

    it('respects disabled state on clear-inbox when mails count is 0', async () => {
        const model = createMockModel()
        const actions = createMockActions()
        const wrapper = mount(AdminResourceWorkspace, {
            props: { model, actions },
            global: { plugins: [i18n] },
            attachTo: document.body,
        })

        const secondRow = wrapper.findAll('.address-actions')[1]
        const moreTrigger = secondRow.get('.btn-action-more')
        await moreTrigger.trigger('click')

        const menuItems = secondRow.findAll('.action-menu-item')
        const clearBtn = menuItems[3]
        expect(clearBtn.attributes('disabled')).toBeDefined()
        wrapper.unmount()
    })

    it('closes the menu on Escape key and outside click', async () => {
        const model = createMockModel()
        const actions = createMockActions()
        const wrapper = mount(AdminResourceWorkspace, {
            props: { model, actions },
            global: { plugins: [i18n] },
            attachTo: document.body,
        })

        const firstRow = wrapper.findAll('.address-actions')[0]
        const moreTrigger = firstRow.get('.btn-action-more')

        // Open menu
        await moreTrigger.trigger('click')
        expect(moreTrigger.attributes('aria-expanded')).toBe('true')

        // Press Escape
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        await nextTick()
        expect(moreTrigger.attributes('aria-expanded')).toBe('false')

        // Open menu again
        await moreTrigger.trigger('click')
        expect(moreTrigger.attributes('aria-expanded')).toBe('true')

        // Click outside on document body
        document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await nextTick()
        expect(moreTrigger.attributes('aria-expanded')).toBe('false')

        wrapper.unmount()
    })
})

const createMockDomainModel = (overrides = {}) => ({
    activeView: 'routing',
    activePanels: [
        {
            id: 'domains',
            kind: 'routing',
            title: '域名管理',
            columns: [
                { labelKey: 'domain', type: 'entity', main: 'label', sub: 'domain' },
                { labelKey: 'actions', key: 'actions', type: 'domainActions' },
            ],
            rows: [
                {
                    id: 'domain-1',
                    sourceId: 1,
                    domain: 'cf.example.test',
                    label: 'cf.example.test',
                    receiveMode: 'cloudflare_email',
                    verificationAddress: 'v1@cf.example.test',
                    isEnabled: true,
                },
                {
                    id: 'domain-2',
                    sourceId: 2,
                    domain: 'custom.example.test',
                    label: 'custom.example.test',
                    receiveMode: 'custom_inbound',
                    verificationAddress: null,
                    isEnabled: false,
                },
            ],
        },
    ],
    ui: { domain: 'all' },
    domainRows: [
        { id: 'domain-1', domain: 'cf.example.test' },
        { id: 'domain-2', domain: 'custom.example.test' },
    ],
    addressRows: [],
    routingActivationRows: [],
    actionBusy: false,
    ...overrides,
})

describe('AdminResourceWorkspace domain row actions', () => {
    beforeEach(() => {
        document.body.innerHTML = ''
    })

    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('renders a more menu trigger button for each domain row', () => {
        const model = createMockDomainModel()
        const actions = createMockActions()
        const wrapper = mount(AdminResourceWorkspace, {
            props: { model, actions },
            global: { plugins: [i18n] },
        })

        const domainActionContainers = wrapper.findAll('.domain-actions')
        expect(domainActionContainers).toHaveLength(2)

        const firstRow = domainActionContainers[0]
        const moreTrigger = firstRow.get('.btn-action-more')
        expect(moreTrigger.text()).toContain('更多')
        expect(moreTrigger.attributes('aria-haspopup')).toBe('menu')
        expect(moreTrigger.attributes('aria-expanded')).toBe('false')

        const menu = firstRow.get('.action-dropdown-menu')
        expect(menu.attributes('role')).toBe('menu')
        expect(menu.isVisible()).toBe(false)
        wrapper.unmount()
    })

    it('toggles the domain more menu open and closed upon clicking the trigger', async () => {
        const model = createMockDomainModel()
        const actions = createMockActions()
        const wrapper = mount(AdminResourceWorkspace, {
            props: { model, actions },
            global: { plugins: [i18n] },
            attachTo: document.body,
        })

        const firstRow = wrapper.findAll('.domain-actions')[0]
        const moreTrigger = firstRow.get('.btn-action-more')
        const menu = firstRow.get('.action-dropdown-menu')

        expect(moreTrigger.attributes('aria-expanded')).toBe('false')
        expect(menu.isVisible()).toBe(false)

        await moreTrigger.trigger('click')
        expect(moreTrigger.attributes('aria-expanded')).toBe('true')
        expect(menu.isVisible()).toBe(true)

        // Cloudflare mode + enabled row -> 5 items
        const menuItems = menu.findAll('.action-menu-item')
        expect(menuItems).toHaveLength(5)
        expect(menuItems[0].text()).toBe('自动配置')
        expect(menuItems[1].text()).toBe('开始验证')
        expect(menuItems[2].text()).toBe('检查验证')
        expect(menuItems[3].text()).toBe('检查路由')
        expect(menuItems[4].text()).toBe('停用')
        expect(menuItems[4].classes()).toContain('danger')

        await moreTrigger.trigger('click')
        expect(moreTrigger.attributes('aria-expanded')).toBe('false')
        expect(menu.isVisible()).toBe(false)
        wrapper.unmount()
    })

    it('conditionally excludes cloudflare setup and disable buttons when conditions are not met', async () => {
        const model = createMockDomainModel()
        const actions = createMockActions()
        const wrapper = mount(AdminResourceWorkspace, {
            props: { model, actions },
            global: { plugins: [i18n] },
            attachTo: document.body,
        })

        const secondRow = wrapper.findAll('.domain-actions')[1]
        const moreTrigger = secondRow.get('.btn-action-more')
        await moreTrigger.trigger('click')

        const menuItems = secondRow.findAll('.action-menu-item')
        // Custom mode (no autoSetup) and disabled (no disable button) -> 3 items
        expect(menuItems).toHaveLength(3)
        expect(menuItems[0].text()).toBe('开始验证')
        expect(menuItems[1].text()).toBe('检查验证')
        expect(menuItems[2].text()).toBe('检查路由')
        wrapper.unmount()
    })

    it('dispatches collapsed domain actions from the more menu and closes the menu', async () => {
        const model = createMockDomainModel()
        const actions = createMockActions()
        const wrapper = mount(AdminResourceWorkspace, {
            props: { model, actions },
            global: { plugins: [i18n] },
            attachTo: document.body,
        })

        const row = model.activePanels[0].rows[0]
        const firstRow = wrapper.findAll('.domain-actions')[0]
        const moreTrigger = firstRow.get('.btn-action-more')
        const menu = firstRow.get('.action-dropdown-menu')
        const menuItems = menu.findAll('.action-menu-item')

        // 1. cloudflare-setup
        await moreTrigger.trigger('click')
        await menuItems[0].trigger('click')
        expect(actions.handleDomainRowAction).toHaveBeenCalledWith(row, 'cloudflare-setup')
        expect(moreTrigger.attributes('aria-expanded')).toBe('false')

        // 2. verify-start
        await moreTrigger.trigger('click')
        await menuItems[1].trigger('click')
        expect(actions.handleDomainRowAction).toHaveBeenCalledWith(row, 'verify-start')
        expect(moreTrigger.attributes('aria-expanded')).toBe('false')

        // 3. verify-check
        await moreTrigger.trigger('click')
        await menuItems[2].trigger('click')
        expect(actions.handleDomainRowAction).toHaveBeenCalledWith(row, 'verify-check')
        expect(moreTrigger.attributes('aria-expanded')).toBe('false')

        // 4. verify
        await moreTrigger.trigger('click')
        await menuItems[3].trigger('click')
        expect(actions.handleDomainRowAction).toHaveBeenCalledWith(row, 'verify')
        expect(moreTrigger.attributes('aria-expanded')).toBe('false')

        // 5. domain-disable
        await moreTrigger.trigger('click')
        await menuItems[4].trigger('click')
        expect(actions.handleDomainRowAction).toHaveBeenCalledWith(row, 'domain-disable')
        expect(moreTrigger.attributes('aria-expanded')).toBe('false')

        wrapper.unmount()
    })

    it('respects disabled state on check-verify when verificationAddress is not set', async () => {
        const model = createMockDomainModel()
        const actions = createMockActions()
        const wrapper = mount(AdminResourceWorkspace, {
            props: { model, actions },
            global: { plugins: [i18n] },
            attachTo: document.body,
        })

        const secondRow = wrapper.findAll('.domain-actions')[1]
        const moreTrigger = secondRow.get('.btn-action-more')
        await moreTrigger.trigger('click')

        const menuItems = secondRow.findAll('.action-menu-item')
        const checkVerifyBtn = menuItems[1]
        expect(checkVerifyBtn.attributes('disabled')).toBeDefined()
        wrapper.unmount()
    })

    it('closes the domain menu on Escape key and outside click', async () => {
        const model = createMockDomainModel()
        const actions = createMockActions()
        const wrapper = mount(AdminResourceWorkspace, {
            props: { model, actions },
            global: { plugins: [i18n] },
            attachTo: document.body,
        })

        const firstRow = wrapper.findAll('.domain-actions')[0]
        const moreTrigger = firstRow.get('.btn-action-more')

        // Open menu
        await moreTrigger.trigger('click')
        expect(moreTrigger.attributes('aria-expanded')).toBe('true')

        // Press Escape
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        await nextTick()
        expect(moreTrigger.attributes('aria-expanded')).toBe('false')

        // Open menu again
        await moreTrigger.trigger('click')
        expect(moreTrigger.attributes('aria-expanded')).toBe('true')

        // Click outside on document body
        document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await nextTick()
        expect(moreTrigger.attributes('aria-expanded')).toBe('false')

        wrapper.unmount()
    })

    it('coordinates menu state so opening one dropdown closes any other dropdown', async () => {
        const model = {
            activeView: 'routing',
            activePanels: [
                {
                    id: 'addresses',
                    kind: 'identity',
                    title: '地址',
                    columns: [
                        { labelKey: 'address', type: 'entity', main: 'address' },
                        { labelKey: 'actions', key: 'actions', type: 'addressActions' },
                    ],
                    rows: [{ id: 'addr-1', sourceId: 1, address: 'u@test.local', mails: 1 }],
                },
                {
                    id: 'domains',
                    kind: 'routing',
                    title: '域名',
                    columns: [
                        { labelKey: 'domain', type: 'entity', main: 'domain' },
                        { labelKey: 'actions', key: 'actions', type: 'domainActions' },
                    ],
                    rows: [{ id: 'domain-1', sourceId: 1, domain: 'test.local', receiveMode: 'cloudflare_email', isEnabled: true }],
                },
            ],
            ui: { domain: 'all' },
            addressRows: [{ id: 'addr-1', address: 'u@test.local' }],
            domainRows: [{ id: 'domain-1', domain: 'test.local' }],
            actionBusy: false,
        }
        const actions = createMockActions()
        const wrapper = mount(AdminResourceWorkspace, {
            props: { model, actions },
            global: { plugins: [i18n] },
            attachTo: document.body,
        })

        const addressMoreTrigger = wrapper.find('.address-actions .btn-action-more')
        const domainMoreTrigger = wrapper.find('.domain-actions .btn-action-more')

        // Open address menu
        await addressMoreTrigger.trigger('click')
        expect(addressMoreTrigger.attributes('aria-expanded')).toBe('true')
        expect(domainMoreTrigger.attributes('aria-expanded')).toBe('false')

        // Open domain menu -> address menu should close
        await domainMoreTrigger.trigger('click')
        expect(addressMoreTrigger.attributes('aria-expanded')).toBe('false')
        expect(domainMoreTrigger.attributes('aria-expanded')).toBe('true')

        // Open address menu again -> domain menu should close
        await addressMoreTrigger.trigger('click')
        expect(addressMoreTrigger.attributes('aria-expanded')).toBe('true')
        expect(domainMoreTrigger.attributes('aria-expanded')).toBe('false')

        wrapper.unmount()
    })
})

describe('AdminResourceWorkspace delivery empty states and ops action hint (Task 6.5)', () => {
    beforeEach(() => {
        document.body.innerHTML = ''
        i18n.global.locale.value = 'zh'
    })

    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('renders Naive UI graphical empty state with outbound channel anchor guide link for empty sender and sendbox panels when no active filters', async () => {
        const model = {
            activeView: 'delivery',
            hasActiveFilters: false,
            activePanels: [
                {
                    id: 'channels',
                    kind: 'delivery',
                    title: '出站与通知通道',
                    columns: [{ labelKey: 'channel', type: 'entity', main: 'channel' }],
                    rows: [{ id: 'ch-1', channel: 'Telegram Bot' }],
                },
                {
                    id: 'sender',
                    kind: 'delivery',
                    title: '地址级发送',
                    columns: [{ labelKey: 'address', key: 'address' }],
                    rows: [],
                },
                {
                    id: 'sendbox',
                    kind: 'delivery',
                    title: '发送箱',
                    columns: [{ labelKey: 'subject', key: 'subject' }],
                    rows: [],
                },
            ],
            ui: { domain: 'all' },
            actionBusy: false,
        }
        const actions = createMockActions()
        const wrapper = mount(AdminResourceWorkspace, {
            props: { model, actions },
            global: { plugins: [i18n] },
            attachTo: document.body,
        })

        // Check stable anchor id on channels panel
        const channelsPanel = wrapper.find('#delivery-channels')
        expect(channelsPanel.exists()).toBe(true)
        expect(channelsPanel.classes()).toContain('panel-channels')

        // Check sender empty state
        const senderPanel = wrapper.find('.panel-sender')
        const senderEmptyState = senderPanel.find('.delivery-empty-state')
        expect(senderEmptyState.exists()).toBe(true)
        expect(senderEmptyState.find('.n-empty').exists()).toBe(true)
        expect(senderEmptyState.text()).toContain('暂无地址级发送记录，可通过发信通道配置出站权限')

        const senderGuideLink = senderEmptyState.find('a.empty-guide-link')
        expect(senderGuideLink.exists()).toBe(true)
        expect(senderGuideLink.attributes('href')).toBe('#delivery-channels')
        expect(senderGuideLink.text()).toContain('配置发信通道')

        // Check sendbox empty state
        const sendboxPanel = wrapper.find('.panel-sendbox')
        const sendboxEmptyState = sendboxPanel.find('.delivery-empty-state')
        expect(sendboxEmptyState.exists()).toBe(true)
        expect(sendboxEmptyState.find('.n-empty').exists()).toBe(true)
        expect(sendboxEmptyState.text()).toContain('暂无外发邮件记录，通过发信通道发送的邮件将显示在此处')

        const sendboxGuideLink = sendboxEmptyState.find('a.empty-guide-link')
        expect(sendboxGuideLink.exists()).toBe(true)
        expect(sendboxGuideLink.attributes('href')).toBe('#delivery-channels')
        expect(sendboxGuideLink.text()).toContain('配置发信通道')

        // Test English locale
        i18n.global.locale.value = 'en'
        await nextTick()

        expect(senderEmptyState.text()).toContain('No address-level sending permissions configured')
        expect(senderGuideLink.text()).toContain('Configure outbound channels')
        expect(sendboxEmptyState.text()).toContain('No outbound messages in the sendbox yet')

        // Test clicking guide link triggers smooth scroll to channels element
        const scrollIntoViewMock = vi.fn()
        channelsPanel.element.scrollIntoView = scrollIntoViewMock
        await senderGuideLink.trigger('click')
        expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })

        wrapper.unmount()
    })

    it('prioritizes clear filters action over channel configuration guide when active filters exist', async () => {
        const model = {
            activeView: 'delivery',
            hasActiveFilters: true,
            activePanels: [
                {
                    id: 'sender',
                    kind: 'delivery',
                    title: '地址级发送',
                    columns: [{ labelKey: 'address', key: 'address' }],
                    rows: [],
                },
                {
                    id: 'sendbox',
                    kind: 'delivery',
                    title: '发送箱',
                    columns: [{ labelKey: 'subject', key: 'subject' }],
                    rows: [],
                },
            ],
            ui: { domain: 'all' },
            actionBusy: false,
        }
        const actions = createMockActions()
        const wrapper = mount(AdminResourceWorkspace, {
            props: { model, actions },
            global: { plugins: [i18n] },
        })

        // Standard empty state with clear filters button
        const senderEmptyState = wrapper.find('.panel-sender .empty-state')
        expect(senderEmptyState.exists()).toBe(true)
        expect(wrapper.find('.panel-sender .delivery-empty-state').exists()).toBe(false)

        const clearBtn = senderEmptyState.find('button.btn')
        expect(clearBtn.exists()).toBe(true)
        expect(clearBtn.text()).toBe('清除筛选')

        await clearBtn.trigger('click')
        expect(actions.handleAction).toHaveBeenCalledWith('reset-filters')

        wrapper.unmount()
    })

    it('maintains standard AdminEmptyState for ordinary panels without delivery sender/sendbox guide', () => {
        const model = {
            activeView: 'delivery',
            hasActiveFilters: false,
            activePanels: [
                {
                    id: 'channels',
                    kind: 'delivery',
                    title: '出站通道',
                    columns: [{ labelKey: 'channel', key: 'channel' }],
                    rows: [],
                },
            ],
            ui: { domain: 'all' },
            actionBusy: false,
        }
        const actions = createMockActions()
        const wrapper = mount(AdminResourceWorkspace, {
            props: { model, actions },
            global: { plugins: [i18n] },
        })

        expect(wrapper.find('.panel-channels .empty-state').exists()).toBe(true)
        expect(wrapper.find('.panel-channels .delivery-empty-state').exists()).toBe(false)
        wrapper.unmount()
    })

    it('renders ops table action column as non-interactive maintenance hint text', () => {
        const model = {
            activeView: 'ops',
            hasActiveFilters: false,
            activePanels: [
                {
                    id: 'ops',
                    kind: 'ops',
                    title: '运行维护',
                    columns: [
                        { labelKey: 'item', type: 'entity', main: 'name', sub: 'detail' },
                        { labelKey: 'status', key: 'status', type: 'status' },
                        { labelKey: 'action', key: 'action' },
                    ],
                    rows: [
                        {
                            id: 'worker',
                            name: 'Worker 运行配置',
                            detail: 'API: /api/admin/*',
                            status: '可用',
                            action: '打开配置',
                        },
                        {
                            id: 'database',
                            name: 'D1 数据库',
                            detail: 'current 9 / code 9',
                            status: '可用',
                            action: '检查迁移',
                        },
                    ],
                },
            ],
            ui: { domain: 'all' },
            actionBusy: false,
        }
        const actions = createMockActions()
        const wrapper = mount(AdminResourceWorkspace, {
            props: { model, actions },
            global: { plugins: [i18n] },
        })

        const actionHints = wrapper.findAll('.ops-action-hint')
        expect(actionHints).toHaveLength(2)
        expect(actionHints[0].text()).toBe('打开配置')
        expect(actionHints[1].text()).toBe('检查迁移')

        // Ensure no clickable buttons or handlers were added to the action column
        expect(actionHints[0].element.tagName.toLowerCase()).toBe('span')
        expect(wrapper.find('.panel-ops tbody button').exists()).toBe(false)

        wrapper.unmount()
    })
})
