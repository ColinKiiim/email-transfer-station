/** @vitest-environment jsdom */

import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AdminMailWorkspace from '../components/AdminMailWorkspace.vue'
import i18n from '../../i18n'

i18n.global.locale.value = 'zh'

const createMockMailModel = (overrides = {}) => ({
    ui: {
        flowMode: 'list',
        status: 'all',
        domain: 'all',
        address: 'all',
        mailRenderMode: 'html',
        selected: { flow: '', exception: '' },
    },
    mailGridStyle: {},
    mailHierarchy: {
        queues: [
            { id: 'all', status: 'all', label: '全部邮件', count: 2 },
            { id: 'unread', status: 'unread', label: '未读邮件', count: 1 },
        ],
        domains: [],
    },
    filteredMailRows: [
        {
            id: 'mail-1',
            sourceId: 1,
            sender: 'Alice <alice@example.test>',
            senderDisplay: 'Alice',
            subject: 'Invoice 1',
            time: '10:00',
            unread: true,
            body: 'Invoice body 1',
            attachmentCount: 0,
        },
        {
            id: 'mail-2',
            sourceId: 2,
            sender: 'Bob <bob@example.test>',
            senderDisplay: 'Bob',
            subject: 'Report 2',
            time: '11:00',
            unread: false,
            body: 'Report body 2',
            attachmentCount: 1,
        },
    ],
    filteredUnknownRows: [],
    isAllVisibleSelected: false,
    isSomeVisibleSelected: false,
    selectedMailCount: 0,
    selectedMailRows: [],
    currentRail: { empty: true, title: '选择一封邮件' },
    currentMail: null,
    currentRendererMail: null,
    hasActiveFilters: false,
    actionBusy: false,
    ...overrides,
})

const createMockMailActions = (overrides = {}) => ({
    selectAllVisibleMails: vi.fn(),
    toggleMailSelection: vi.fn(),
    isMailSelected: vi.fn((id) => false),
    isSelected: vi.fn(() => false),
    selectRow: vi.fn(),
    handleRowKey: vi.fn(),
    setMailStatus: vi.fn(),
    setMailDomain: vi.fn(),
    setMailAddress: vi.fn(),
    isMailDomainCollapsed: vi.fn(() => false),
    toggleMailDomain: vi.fn(),
    startMailColumnResize: vi.fn(),
    backToMailList: vi.fn(),
    deleteCurrentMail: vi.fn(),
    copyText: vi.fn(),
    batchMarkRead: vi.fn(),
    batchDeleteMails: vi.fn(),
    batchExportMails: vi.fn(),
    handleAction: vi.fn(),
    ...overrides,
})

describe('AdminMailWorkspace selection controls and accessible DOM structure', () => {
    beforeEach(() => {
        document.body.innerHTML = ''
    })

    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('renders a valid, non-nested DOM structure for the select-all trigger and arrow button', () => {
        const model = createMockMailModel()
        const actions = createMockMailActions()
        const wrapper = mount(AdminMailWorkspace, {
            props: { model, actions },
            global: { plugins: [i18n] },
        })

        const selectAllWrapper = wrapper.get('.mail-select-all-wrapper')
        const trigger = selectAllWrapper.get('.mail-select-all-trigger')
        const arrowBtn = selectAllWrapper.get('.mail-select-all-arrow')

        // 1. .mail-select-all-trigger is a label (non-button container for the checkbox)
        expect(trigger.element.tagName.toLowerCase()).toBe('label')

        // 2. The checkbox input is inside the label
        const checkbox = trigger.get('input[type="checkbox"].header-checkbox')
        expect(checkbox.attributes('aria-label')).toBe('全部')
        expect(checkbox.attributes('tabindex')).toBe('0')

        // 3. The trigger does NOT contain any button elements (no invalid interactive nesting)
        expect(trigger.find('button').exists()).toBe(false)

        // 4. The arrow button is a sibling of the trigger, not nested inside it
        expect(arrowBtn.element.tagName.toLowerCase()).toBe('button')
        expect(arrowBtn.attributes('aria-label')).toBe('选择选项')
        expect(trigger.element.contains(arrowBtn.element)).toBe(false)

        // 5. Verify globally across the component that no button contains interactive elements
        const allButtons = wrapper.findAll('button')
        expect(allButtons.length).toBeGreaterThan(0)
        allButtons.forEach((btn) => {
            expect(btn.find('input, button, a, label').exists()).toBe(false)
        })

        wrapper.unmount()
    })

    it('reflects unchecked, indeterminate, and checked states with accessible aria attributes', async () => {
        // Unchecked state
        let model = createMockMailModel({
            isAllVisibleSelected: false,
            isSomeVisibleSelected: false,
            selectedMailCount: 0,
        })
        const actions = createMockMailActions()
        let wrapper = mount(AdminMailWorkspace, {
            props: { model, actions },
            global: { plugins: [i18n] },
        })

        let checkbox = wrapper.get('.mail-select-all-trigger input[type="checkbox"]')
        expect(checkbox.element.checked).toBe(false)
        expect(checkbox.element.indeterminate).toBe(false)
        expect(checkbox.attributes('aria-checked')).toBe('false')
        wrapper.unmount()

        // Indeterminate (partial) state
        model = createMockMailModel({
            isAllVisibleSelected: false,
            isSomeVisibleSelected: true,
            selectedMailCount: 1,
        })
        wrapper = mount(AdminMailWorkspace, {
            props: { model, actions },
            global: { plugins: [i18n] },
        })
        checkbox = wrapper.get('.mail-select-all-trigger input[type="checkbox"]')
        expect(checkbox.element.checked).toBe(false)
        expect(checkbox.element.indeterminate).toBe(true)
        expect(checkbox.attributes('aria-checked')).toBe('mixed')
        expect(wrapper.get('.mail-select-all-trigger').classes()).toContain('is-active')
        wrapper.unmount()

        // Checked (all selected) state
        model = createMockMailModel({
            isAllVisibleSelected: true,
            isSomeVisibleSelected: false,
            selectedMailCount: 2,
        })
        wrapper = mount(AdminMailWorkspace, {
            props: { model, actions },
            global: { plugins: [i18n] },
        })
        checkbox = wrapper.get('.mail-select-all-trigger input[type="checkbox"]')
        expect(checkbox.element.checked).toBe(true)
        expect(checkbox.element.indeterminate).toBe(false)
        expect(checkbox.attributes('aria-checked')).toBe('true')
        expect(wrapper.get('.mail-select-all-trigger').classes()).toContain('is-active')
        wrapper.unmount()
    })

    it('dispatches select-all toggle on click and keyboard (Space/Enter) interactions', async () => {
        const model = createMockMailModel({
            isAllVisibleSelected: false,
            isSomeVisibleSelected: false,
        })
        const actions = createMockMailActions()
        const wrapper = mount(AdminMailWorkspace, {
            props: { model, actions },
            global: { plugins: [i18n] },
            attachTo: document.body,
        })

        const trigger = wrapper.get('.mail-select-all-trigger')
        const checkbox = trigger.get('input[type="checkbox"]')

        // 1. Click trigger -> calls selectAllVisibleMails('all') when unselected
        await trigger.trigger('click')
        expect(actions.selectAllVisibleMails).toHaveBeenCalledWith('all')

        // 2. Space key on checkbox -> calls selectAllVisibleMails('all')
        await checkbox.trigger('keydown.space')
        expect(actions.selectAllVisibleMails).toHaveBeenCalledWith('all')

        // 3. Enter key on checkbox -> calls selectAllVisibleMails('all')
        await checkbox.trigger('keydown.enter')
        expect(actions.selectAllVisibleMails).toHaveBeenCalledWith('all')

        wrapper.unmount()

        // When partially or fully selected -> calls selectAllVisibleMails('none')
        const activeModel = createMockMailModel({
            isAllVisibleSelected: true,
            isSomeVisibleSelected: false,
            selectedMailCount: 2,
        })
        const activeWrapper = mount(AdminMailWorkspace, {
            props: { model: activeModel, actions },
            global: { plugins: [i18n] },
        })
        await activeWrapper.get('.mail-select-all-trigger').trigger('click')
        expect(actions.selectAllVisibleMails).toHaveBeenCalledWith('none')
        activeWrapper.unmount()
    })

    it('toggles selection options menu and dispatches mode selections', async () => {
        const model = createMockMailModel()
        const actions = createMockMailActions()
        const wrapper = mount(AdminMailWorkspace, {
            props: { model, actions },
            global: { plugins: [i18n] },
            attachTo: document.body,
        })

        const arrowBtn = wrapper.get('.mail-select-all-arrow')
        const menu = wrapper.get('.mail-select-menu')

        expect(arrowBtn.attributes('aria-expanded')).toBe('false')
        expect(menu.isVisible()).toBe(false)

        // Open menu
        await arrowBtn.trigger('click')
        expect(arrowBtn.attributes('aria-expanded')).toBe('true')
        expect(menu.isVisible()).toBe(true)

        const options = menu.findAll('.select-option')
        expect(options).toHaveLength(4)
        expect(options[0].text()).toBe('全部')
        expect(options[1].text()).toBe('无')
        expect(options[2].text()).toBe('已读')
        expect(options[3].text()).toBe('未读')

        // Click 'read'
        await options[2].trigger('click')
        expect(actions.selectAllVisibleMails).toHaveBeenCalledWith('read')
        expect(menu.isVisible()).toBe(false)

        wrapper.unmount()
    })

    it('preserves mail list row checkbox and keyboard selection without regression', async () => {
        const model = createMockMailModel()
        const actions = createMockMailActions({
            isMailSelected: (id) => id === 'mail-1',
        })
        const wrapper = mount(AdminMailWorkspace, {
            props: { model, actions },
            global: { plugins: [i18n] },
        })

        const rows = wrapper.findAll('.mail-row:not(.exception)')
        expect(rows).toHaveLength(2)

        const firstRowCheckboxCell = rows[0].get('.mail-select-cell')
        const firstCheckbox = firstRowCheckboxCell.get('input[type="checkbox"]')
        expect(firstCheckbox.element.checked).toBe(true)

        // Click row checkbox cell
        await firstRowCheckboxCell.trigger('click')
        expect(actions.toggleMailSelection).toHaveBeenCalledWith(
            model.filteredMailRows[0],
            expect.objectContaining({ shiftKey: false })
        )

        // Keydown Space on row checkbox
        await firstCheckbox.trigger('keydown.space')
        expect(actions.toggleMailSelection).toHaveBeenCalledWith(
            model.filteredMailRows[0],
            expect.objectContaining({ shiftKey: false })
        )

        wrapper.unmount()
    })
})
