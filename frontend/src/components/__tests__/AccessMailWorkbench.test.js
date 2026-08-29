/** @vitest-environment jsdom */

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const message = {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
}

vi.mock('naive-ui', async (importOriginal) => {
    const original = await importOriginal()
    const { defineComponent, h } = await import('vue')
    const NPagination = defineComponent({
        name: 'NPagination',
        props: {
            page: { type: Number, default: 1 },
            pageSize: { type: Number, default: 20 },
            itemCount: { type: Number, default: 0 },
            pageSizes: { type: Array, default: () => [] },
            showSizePicker: { type: Boolean, default: false },
            size: { type: String, default: 'medium' },
        },
        emits: ['update:page', 'update:pageSize'],
        setup(props, { emit }) {
            return () => h('div', {
                class: 'n-pagination-mock',
                'data-page': props.page,
                'data-item-count': props.itemCount,
            }, [
                h('button', {
                    class: 'next-page-btn',
                    onClick: () => emit('update:page', 2),
                }, 'Next'),
            ])
        },
    })
    return {
        ...original,
        useMessage: () => message,
        NPagination,
    }
})

import AccessMailWorkbench from '../AccessMailWorkbench.vue'
import i18n from '../../i18n'

const stubs = {
    'n-select': { props: ['value', 'options'], template: '<div class="n-select-stub">{{ value }}</div>' },
    'n-input': { props: ['value'], template: '<input class="n-input-stub" :value="value" />' },
    'n-switch': { props: ['value'], template: '<input type="checkbox" class="n-switch-stub" :checked="value" />' },
    'n-button': { template: '<button v-bind="$attrs"><slot name="icon" /><slot /></button>' },
    'n-icon': { template: '<span><slot /></span>' },
    'n-popconfirm': { template: '<div><slot name="trigger" /><slot /></div>' },
    'n-checkbox': { props: ['checked'], template: '<input type="checkbox" :checked="checked" />' },
    'n-empty': { props: ['description'], template: '<div class="n-empty-stub">{{ description }}</div>' },
    'n-skeleton': { template: '<div class="n-skeleton-stub" />' },
    'n-modal': { template: '<div><slot /></div>' },
    'n-tag': { template: '<span><slot /></span>' },
    'n-space': { template: '<div><slot /></div>' },
    'n-progress': { template: '<div><slot /></div>' },
    MailContentRenderer: { props: ['mail'], template: '<div class="mail-content-renderer-stub">{{ mail?.subject }}</div>' },
    AiExtractInfo: { template: '<div />' },
}

const createSampleMail = (id, source, subject = `Subject ${id}`) => ({
    id,
    address: 'recipient@example.test',
    source,
    created_at: '2026-08-28 12:00:00',
    raw: `From: ${source}\r\nSubject: ${subject}\r\n\r\nSample body text`,
    text: 'Sample body text',
    html: '',
    message: 'Sample body text',
    messageIsHtml: false,
    attachments: [],
})

describe('AccessMailWorkbench - Friendly sender display name and RFC-5322 title', () => {
    beforeEach(() => {
        i18n.global.locale.value = 'zh'
        vi.clearAllMocks()
    })

    it('renders friendly sender display names while retaining full RFC-5322 string in title attribute', async () => {
        const mails = [
            createSampleMail(1, 'GitHub <notifications@github.com>', 'New Issue'),
            createSampleMail(2, '"Security Team" <sec@example.com>', 'Security Alert'),
            createSampleMail(3, '<noreply@example.com>', 'Automated message'),
            createSampleMail(4, 'plain@example.com', 'Plain address'),
        ]

        const fetchMailData = vi.fn().mockResolvedValue({
            results: mails,
            count: 4,
        })

        const wrapper = mount(AccessMailWorkbench, {
            props: {
                title: '收件箱',
                fetchMailData,
            },
            global: {
                plugins: [i18n],
                components: stubs,
                stubs,
            },
        })

        // Wait for onMounted fetchMailData and processItem to settle
        await vi.waitFor(() => {
            expect(wrapper.findAll('.user-mail-sender').length).toBe(4)
        })

        const senders = wrapper.findAll('.user-mail-sender')

        // 1. GitHub <notifications@github.com> -> display "GitHub", title "GitHub <notifications@github.com>"
        expect(senders[0].text()).toBe('GitHub')
        expect(senders[0].attributes('title')).toBe('GitHub <notifications@github.com>')

        // 2. "Security Team" <sec@example.com> -> display "Security Team", title 'Security Team <sec@example.com>'
        expect(senders[1].text()).toBe('Security Team')
        expect(senders[1].attributes('title')).toBe('Security Team <sec@example.com>')

        // 3. <noreply@example.com> -> display "noreply@example.com", title "noreply@example.com"
        expect(senders[2].text()).toBe('noreply@example.com')
        expect(senders[2].attributes('title')).toBe('noreply@example.com')

        // 4. plain@example.com -> display "plain@example.com", title "plain@example.com"
        expect(senders[3].text()).toBe('plain@example.com')
        expect(senders[3].attributes('title')).toBe('plain@example.com')

        wrapper.unmount()
    })
})

describe('AccessMailWorkbench - Pagination count retention across pages', () => {
    beforeEach(() => {
        i18n.global.locale.value = 'zh'
        vi.clearAllMocks()
    })

    it('preserves confirmed total count when navigating to page > 1 and backend returns count: 0', async () => {
        const page1Mails = Array.from({ length: 20 }, (_, i) =>
            createSampleMail(i + 1, `Sender ${i + 1} <sender${i + 1}@example.test>`),
        )
        const page2Mails = Array.from({ length: 20 }, (_, i) =>
            createSampleMail(i + 21, `Sender ${i + 21} <sender${i + 21}@example.test>`),
        )

        const fetchMailData = vi.fn().mockImplementation(async (limit, offset) => {
            if (offset === 0) {
                // Page 1: backend returns actual total count
                return { results: page1Mails, count: 45 }
            }
            // Page 2+ (offset > 0): backend optimizes and returns count: 0
            return { results: page2Mails, count: 0 }
        })

        const wrapper = mount(AccessMailWorkbench, {
            props: {
                title: '收件箱',
                fetchMailData,
            },
            global: {
                plugins: [i18n],
                components: stubs,
                stubs,
            },
        })

        // Initial load (Page 1) -> wait for count to be 45 and Page 1
        await vi.waitFor(() => {
            expect(wrapper.find('.n-pagination-mock').attributes('data-item-count')).toBe('45')
            expect(wrapper.find('.n-pagination-mock').attributes('data-page')).toBe('1')
            expect(wrapper.find('.panel-head b').text()).toContain('45')
        })

        // Navigate to Page 2
        await wrapper.find('.next-page-btn').trigger('click')

        // On Page 2, even though backend returned count: 0, count.value must retain 45!
        await vi.waitFor(() => {
            expect(fetchMailData).toHaveBeenCalledWith(20, 20)
            expect(wrapper.find('.n-pagination-mock').attributes('data-item-count')).toBe('45')
            expect(wrapper.find('.n-pagination-mock').attributes('data-page')).toBe('2')
            expect(wrapper.find('.panel-head b').text()).toContain('45')
        })

        wrapper.unmount()
    })

    it('correctly displays true 0 count on Page 1 for empty mailboxes', async () => {
        const fetchMailData = vi.fn().mockResolvedValue({
            results: [],
            count: 0,
        })

        const wrapper = mount(AccessMailWorkbench, {
            props: {
                title: '收件箱',
                fetchMailData,
            },
            global: {
                plugins: [i18n],
                components: stubs,
                stubs,
            },
        })

        await vi.waitFor(() => {
            expect(fetchMailData).toHaveBeenCalledWith(20, 0)
            expect(wrapper.find('.n-pagination-mock').attributes('data-item-count')).toBe('0')
            expect(wrapper.find('.panel-head b').text()).toContain('0')
            expect(wrapper.find('.empty-list').exists()).toBe(true)
        })

        wrapper.unmount()
    })
})

describe('AccessMailWorkbench - Responsive narrow screen CSS rules', () => {
    it('contains valid flex wrapping and directional rules for narrow screens in styles', () => {
        const vueFilePath = path.resolve(__dirname, '../AccessMailWorkbench.vue')
        const content = fs.readFileSync(vueFilePath, 'utf-8')

        // Must define @media (max-width: 720px)
        expect(content).toContain('@media (max-width: 720px)')

        // .panel-head in media query must use flex-wrap: wrap instead of invalid grid-template-columns
        expect(content).toMatch(/\.panel-head\s*\{[^}]*flex-wrap:\s*wrap/)

        // .panel-head .n-pagination must allow wrapping for size picker and buttons
        expect(content).toMatch(/\.panel-head\s*:deep\(\.n-pagination\)\s*\{[^}]*flex-wrap:\s*wrap/)

        // .mail-command-surface in media query must use flex-direction: column
        expect(content).toMatch(/\.mail-command-surface\s*\{[^}]*flex-direction:\s*column/)

        // Must NOT apply grid-template-columns to .panel-head or .mail-command-surface
        expect(content).not.toMatch(/\.mail-command-surface[^}]*grid-template-columns:\s*1fr/)
        expect(content).not.toMatch(/\.panel-head[^}]*grid-template-columns:\s*1fr/)
    })
})

describe('AccessMailWorkbench - Batch mark read/unread operations', () => {
    beforeEach(() => {
        i18n.global.locale.value = 'zh'
        vi.clearAllMocks()
    })

    it('batch marks selected mails as read, updating local state and invoking updateMailReadState', async () => {
        const mails = [
            { ...createSampleMail(1, 'sender1@example.test', 'Mail 1'), unread: true, is_read: false },
            { ...createSampleMail(2, 'sender2@example.test', 'Mail 2'), unread: true, is_read: false },
            { ...createSampleMail(3, 'sender3@example.test', 'Mail 3'), unread: true, is_read: false },
        ]

        const fetchMailData = vi.fn().mockResolvedValue({ results: mails, count: 3 })
        const updateMailReadState = vi.fn().mockImplementation(async (id, read) => ({
            id,
            read_at: read ? '2026-08-29T12:00:00.000Z' : null,
        }))

        const wrapper = mount(AccessMailWorkbench, {
            props: {
                title: '收件箱',
                fetchMailData,
                updateMailReadState,
            },
            global: {
                plugins: [i18n],
                components: stubs,
                stubs,
            },
        })

        await vi.waitFor(() => {
            expect(wrapper.findAll('.mail-row').length).toBe(3)
        })

        // Enter multiAction mode
        const multiActionBtn = wrapper.findAll('button').find((b) => b.text().includes('多选'))
        expect(multiActionBtn).toBeDefined()
        await multiActionBtn.trigger('click')

        // Select mail 1 and mail 3
        const checkboxes = wrapper.findAll('.mail-row-checkbox')
        expect(checkboxes.length).toBe(3)
        await checkboxes[0].trigger('click')
        await checkboxes[2].trigger('click')

        // Click "标记已读"
        const markReadBtn = wrapper.findAll('button').find((b) => b.text().includes('标记已读'))
        expect(markReadBtn).toBeDefined()
        await markReadBtn.trigger('click')

        await vi.waitFor(() => {
            expect(updateMailReadState).toHaveBeenCalledWith(1, true)
            expect(updateMailReadState).toHaveBeenCalledWith(3, true)
            expect(updateMailReadState).not.toHaveBeenCalledWith(2, true)
        })

        // Verify unread classes updated
        const rows = wrapper.findAll('.mail-row')
        expect(rows[0].classes()).not.toContain('is-unread')
        expect(rows[1].classes()).toContain('is-unread')
        expect(rows[2].classes()).not.toContain('is-unread')
        expect(message.success).toHaveBeenCalledWith('成功')

        wrapper.unmount()
    })

    it('batch marks selected mails as unread, setting read_at to null and updating local state', async () => {
        const mails = [
            { ...createSampleMail(1, 'sender1@example.test', 'Mail 1'), unread: false, is_read: true, read_at: '2026-08-28T12:00:00.000Z' },
            { ...createSampleMail(2, 'sender2@example.test', 'Mail 2'), unread: false, is_read: true, read_at: '2026-08-28T12:00:00.000Z' },
        ]

        const fetchMailData = vi.fn().mockResolvedValue({ results: mails, count: 2 })
        const updateMailReadState = vi.fn().mockImplementation(async (id, read) => ({
            id,
            read_at: read ? '2026-08-29T12:00:00.000Z' : null,
        }))

        const wrapper = mount(AccessMailWorkbench, {
            props: {
                title: '收件箱',
                fetchMailData,
                updateMailReadState,
            },
            global: {
                plugins: [i18n],
                components: stubs,
                stubs,
            },
        })

        await vi.waitFor(() => {
            expect(wrapper.findAll('.mail-row').length).toBe(2)
        })

        // Enter multiAction mode and select all
        const multiActionBtn = wrapper.findAll('button').find((b) => b.text().includes('多选'))
        await multiActionBtn.trigger('click')

        const selectAllBtn = wrapper.findAll('button').find((b) => b.text().includes('全选'))
        await selectAllBtn.trigger('click')

        // Click "标记未读"
        const markUnreadBtn = wrapper.findAll('button').find((b) => b.text().includes('标记未读'))
        await markUnreadBtn.trigger('click')

        await vi.waitFor(() => {
            expect(updateMailReadState).toHaveBeenCalledWith(1, false)
            expect(updateMailReadState).toHaveBeenCalledWith(2, false)
        })

        const rows = wrapper.findAll('.mail-row')
        expect(rows[0].classes()).toContain('is-unread')
        expect(rows[1].classes()).toContain('is-unread')
        expect(message.success).toHaveBeenCalledWith('成功')

        wrapper.unmount()
    })

    it('handles partial failure gracefully without discarding successful updates and shows feedback', async () => {
        const mails = [
            { ...createSampleMail(1, 'sender1@example.test', 'Mail 1'), unread: true, is_read: false },
            { ...createSampleMail(2, 'sender2@example.test', 'Mail 2'), unread: true, is_read: false },
        ]

        const fetchMailData = vi.fn().mockResolvedValue({ results: mails, count: 2 })
        const updateMailReadState = vi.fn().mockImplementation(async (id) => {
            if (id === 2) throw new Error('Network error')
            return { id, read_at: '2026-08-29T12:00:00.000Z' }
        })

        const wrapper = mount(AccessMailWorkbench, {
            props: {
                title: '收件箱',
                fetchMailData,
                updateMailReadState,
            },
            global: {
                plugins: [i18n],
                components: stubs,
                stubs,
            },
        })

        await vi.waitFor(() => {
            expect(wrapper.findAll('.mail-row').length).toBe(2)
        })

        const multiActionBtn = wrapper.findAll('button').find((b) => b.text().includes('多选'))
        await multiActionBtn.trigger('click')

        const selectAllBtn = wrapper.findAll('button').find((b) => b.text().includes('全选'))
        await selectAllBtn.trigger('click')

        const markReadBtn = wrapper.findAll('button').find((b) => b.text().includes('标记已读'))
        await markReadBtn.trigger('click')

        await vi.waitFor(() => {
            expect(updateMailReadState).toHaveBeenCalledWith(1, true)
            expect(updateMailReadState).toHaveBeenCalledWith(2, true)
            expect(message.warning).toHaveBeenCalledWith('无法更新已读状态')
        })

        // Mail 1 must retain its successfully updated read state
        const rows = wrapper.findAll('.mail-row')
        expect(rows[0].classes()).not.toContain('is-unread')
        // Mail 2 remains unread due to failure
        expect(rows[1].classes()).toContain('is-unread')

        wrapper.unmount()
    })

    it('does not alter local unread/read_at state and triggers warning when updateMailReadState returns { success: false }', async () => {
        const mails = [
            { ...createSampleMail(1, 'sender1@example.test', 'Mail 1'), unread: true, is_read: false, read_at: null },
            { ...createSampleMail(2, 'sender2@example.test', 'Mail 2'), unread: false, is_read: true, read_at: '2026-08-28T12:00:00.000Z' },
        ]

        const fetchMailData = vi.fn().mockResolvedValue({ results: mails, count: 2 })
        const updateMailReadState = vi.fn().mockResolvedValue({ success: false })

        const wrapper = mount(AccessMailWorkbench, {
            props: {
                title: '收件箱',
                fetchMailData,
                updateMailReadState,
            },
            global: {
                plugins: [i18n],
                components: stubs,
                stubs,
            },
        })

        await vi.waitFor(() => {
            expect(wrapper.findAll('.mail-row').length).toBe(2)
        })

        const rows = wrapper.findAll('.mail-row')

        // Single quick action failure
        const row0ActionBtn = rows[0].find('.user-mail-action-btn')
        await row0ActionBtn.trigger('click')

        await vi.waitFor(() => {
            expect(updateMailReadState).toHaveBeenCalledWith(1, true)
            expect(message.warning).toHaveBeenCalledWith('无法更新已读状态')
        })

        // Mail 1 local state must remain unchanged
        expect(rows[0].classes()).toContain('is-unread')

        // Batch operation failure
        const multiActionBtn = wrapper.findAll('button').find((b) => b.text().includes('多选'))
        await multiActionBtn.trigger('click')

        const checkboxes = wrapper.findAll('.mail-row-checkbox')
        await checkboxes[0].trigger('click')
        await checkboxes[1].trigger('click')

        const markUnreadBtn = wrapper.findAll('button').find((b) => b.text().includes('标记未读'))
        await markUnreadBtn.trigger('click')

        await vi.waitFor(() => {
            expect(updateMailReadState).toHaveBeenCalledWith(2, false)
            expect(message.warning).toHaveBeenCalledWith('无法更新已读状态')
        })

        // Mail 2 local state must remain unchanged
        expect(rows[1].classes()).not.toContain('is-unread')

        wrapper.unmount()
    })
})

describe('AccessMailWorkbench - Shift continuous selection', () => {
    beforeEach(() => {
        i18n.global.locale.value = 'zh'
        vi.clearAllMocks()
    })

    it('performs range selection across items when Shift key is pressed in multiAction mode', async () => {
        const mails = [
            createSampleMail(1, 's1@example.test', 'Mail 1'),
            createSampleMail(2, 's2@example.test', 'Mail 2'),
            createSampleMail(3, 's3@example.test', 'Mail 3'),
            createSampleMail(4, 's4@example.test', 'Mail 4'),
        ]

        const fetchMailData = vi.fn().mockResolvedValue({ results: mails, count: 4 })

        const wrapper = mount(AccessMailWorkbench, {
            props: {
                title: '收件箱',
                fetchMailData,
            },
            global: {
                plugins: [i18n],
                components: stubs,
                stubs,
            },
        })

        await vi.waitFor(() => {
            expect(wrapper.findAll('.mail-row').length).toBe(4)
        })

        // Enter multiAction mode
        const multiActionBtn = wrapper.findAll('button').find((b) => b.text().includes('多选'))
        await multiActionBtn.trigger('click')

        // Click row 0 (Mail 1) without shift
        const selectCells = wrapper.findAll('.mail-row-select-cell')
        await selectCells[0].trigger('click', { shiftKey: false })

        let checkboxes = wrapper.findAll('.mail-row-checkbox')
        expect(checkboxes[0].element.checked).toBe(true)
        expect(checkboxes[1].element.checked).toBe(false)
        expect(checkboxes[2].element.checked).toBe(false)
        expect(checkboxes[3].element.checked).toBe(false)

        // Shift-click row 2 (Mail 3) -> should select rows 0, 1, 2
        await selectCells[2].trigger('click', { shiftKey: true })

        checkboxes = wrapper.findAll('.mail-row-checkbox')
        expect(checkboxes[0].element.checked).toBe(true)
        expect(checkboxes[1].element.checked).toBe(true)
        expect(checkboxes[2].element.checked).toBe(true)
        expect(checkboxes[3].element.checked).toBe(false)

        wrapper.unmount()
    })

    it('safely clears selection anchor on cancel multiAction and refresh', async () => {
        const mails = [
            createSampleMail(1, 's1@example.test', 'Mail 1'),
            createSampleMail(2, 's2@example.test', 'Mail 2'),
            createSampleMail(3, 's3@example.test', 'Mail 3'),
        ]

        const fetchMailData = vi.fn().mockResolvedValue({ results: mails, count: 3 })

        const wrapper = mount(AccessMailWorkbench, {
            props: {
                title: '收件箱',
                fetchMailData,
            },
            global: {
                plugins: [i18n],
                components: stubs,
                stubs,
            },
        })

        await vi.waitFor(() => {
            expect(wrapper.findAll('.mail-row').length).toBe(3)
        })

        // Enter multiAction mode
        const multiActionBtn = wrapper.findAll('button').find((b) => b.text().includes('多选'))
        await multiActionBtn.trigger('click')

        // Select row 0
        const selectCells = wrapper.findAll('.mail-row-select-cell')
        await selectCells[0].trigger('click')

        // Cancel multiAction
        const cancelBtn = wrapper.findAll('button').find((b) => b.text().includes('取消多选'))
        await cancelBtn.trigger('click')

        // Re-enter multiAction
        const reEnterBtn = wrapper.findAll('button').find((b) => b.text().includes('多选'))
        await reEnterBtn.trigger('click')

        // Shift-click row 2 -> since anchor was cleared, only row 2 should be toggled
        const newSelectCells = wrapper.findAll('.mail-row-select-cell')
        await newSelectCells[2].trigger('click', { shiftKey: true })

        const checkboxes = wrapper.findAll('.mail-row-checkbox')
        expect(checkboxes[0].element.checked).toBe(false)
        expect(checkboxes[1].element.checked).toBe(false)
        expect(checkboxes[2].element.checked).toBe(true)

        wrapper.unmount()
    })

    it('performs range selection when pressing Space or Enter with Shift on checkboxes', async () => {
        const mails = [
            createSampleMail(1, 's1@example.test', 'Mail 1'),
            createSampleMail(2, 's2@example.test', 'Mail 2'),
            createSampleMail(3, 's3@example.test', 'Mail 3'),
            createSampleMail(4, 's4@example.test', 'Mail 4'),
        ]

        const fetchMailData = vi.fn().mockResolvedValue({ results: mails, count: 4 })

        const wrapper = mount(AccessMailWorkbench, {
            props: {
                title: '收件箱',
                fetchMailData,
            },
            global: {
                plugins: [i18n],
                components: stubs,
                stubs,
            },
        })

        await vi.waitFor(() => {
            expect(wrapper.findAll('.mail-row').length).toBe(4)
        })

        // Enter multiAction mode
        const multiActionBtn = wrapper.findAll('button').find((b) => b.text().includes('多选'))
        await multiActionBtn.trigger('click')

        const checkboxes = wrapper.findAll('.mail-row-checkbox')

        // 1. Press Space on row 0 checkbox without shift -> select row 0
        await checkboxes[0].trigger('keydown', { key: ' ', shiftKey: false })
        expect(checkboxes[0].element.checked).toBe(true)
        expect(checkboxes[1].element.checked).toBe(false)
        expect(checkboxes[2].element.checked).toBe(false)
        expect(checkboxes[3].element.checked).toBe(false)

        // 2. Press Enter on row 2 checkbox with shiftKey: true -> select range rows 0, 1, 2
        await checkboxes[2].trigger('keydown', { key: 'Enter', shiftKey: true })
        expect(checkboxes[0].element.checked).toBe(true)
        expect(checkboxes[1].element.checked).toBe(true)
        expect(checkboxes[2].element.checked).toBe(true)
        expect(checkboxes[3].element.checked).toBe(false)

        // 3. Press Space on row 1 checkbox with shiftKey: true -> range 2 to 1 (both should be set to false)
        await checkboxes[1].trigger('keydown', { key: ' ', shiftKey: true })
        expect(checkboxes[0].element.checked).toBe(true)
        expect(checkboxes[1].element.checked).toBe(false)
        expect(checkboxes[2].element.checked).toBe(false)
        expect(checkboxes[3].element.checked).toBe(false)

        wrapper.unmount()
    })
})

describe('AccessMailWorkbench - Row quick actions and isolation', () => {
    beforeEach(() => {
        i18n.global.locale.value = 'zh'
        vi.clearAllMocks()
    })

    it('renders state-sensitive quick action buttons and isolates them from row selection and detail opening', async () => {
        const mails = [
            { ...createSampleMail(1, 'unread@example.test', 'Unread Mail'), unread: true, is_read: false },
            { ...createSampleMail(2, 'read@example.test', 'Read Mail'), unread: false, is_read: true },
        ]

        const fetchMailData = vi.fn().mockResolvedValue({ results: mails, count: 2 })
        const updateMailReadState = vi.fn().mockResolvedValue({ id: 1, read_at: '2026-08-29T12:00:00.000Z' })

        const wrapper = mount(AccessMailWorkbench, {
            props: {
                title: '收件箱',
                fetchMailData,
                updateMailReadState,
            },
            global: {
                plugins: [i18n],
                components: stubs,
                stubs,
            },
        })

        await vi.waitFor(() => {
            expect(wrapper.findAll('.mail-row').length).toBe(2)
        })

        const rows = wrapper.findAll('.mail-row')

        // Row 0 (unread): quick action button is "标记已读"
        const row0ActionBtn = rows[0].find('.user-mail-action-btn')
        expect(row0ActionBtn.exists()).toBe(true)
        expect(row0ActionBtn.attributes('aria-label')).toBe('标记已读')
        expect(row0ActionBtn.attributes('title')).toBe('标记已读')

        // Row 1 (read): quick action button is "标记未读"
        const row1ActionBtn = rows[1].find('.user-mail-action-btn')
        expect(row1ActionBtn.exists()).toBe(true)
        expect(row1ActionBtn.attributes('aria-label')).toBe('标记未读')
        expect(row1ActionBtn.attributes('title')).toBe('标记未读')

        // Clicking Row 0's quick action button marks it as read without opening detail on it if another is open
        await row0ActionBtn.trigger('click')

        await vi.waitFor(() => {
            expect(updateMailReadState).toHaveBeenCalledWith(1, true)
        })

        wrapper.unmount()
    })

    it('does not render delete controls or invoke deleteMail when enableUserDeleteEmail is false (TokenInbox contract)', async () => {
        const mails = [
            createSampleMail(1, 'user@example.test', 'Subject 1'),
        ]

        const fetchMailData = vi.fn().mockResolvedValue({ results: mails, count: 1 })
        const deleteMail = vi.fn()

        const wrapper = mount(AccessMailWorkbench, {
            props: {
                title: '共享收件箱',
                fetchMailData,
                deleteMail,
                enableUserDeleteEmail: false,
            },
            global: {
                plugins: [i18n],
                components: stubs,
                stubs,
            },
        })

        await vi.waitFor(() => {
            expect(wrapper.findAll('.mail-row').length).toBe(1)
        })

        // There should be no delete buttons in rows
        const dangerActionBtns = wrapper.findAll('.user-mail-action-btn.is-danger')
        expect(dangerActionBtns.length).toBe(0)

        // Enter multiAction mode -> there should be no delete button in multiAction bar
        const multiActionBtn = wrapper.findAll('button').find((b) => b.text().includes('多选'))
        if (multiActionBtn) {
            await multiActionBtn.trigger('click')
            const deleteButtons = wrapper.findAll('button').filter((b) => b.text().includes('删除'))
            expect(deleteButtons.length).toBe(0)
        }

        expect(deleteMail).not.toHaveBeenCalled()
        wrapper.unmount()
    })
})

describe('AccessMailWorkbench - Semantic DOM and Accessibility', () => {
    beforeEach(() => {
        i18n.global.locale.value = 'zh'
        vi.clearAllMocks()
    })

    it('has valid list/listitem ARIA roles, accessible names on inputs, and no illegal nested buttons', async () => {
        const mails = [
            createSampleMail(1, 'sender@example.test', 'Important Notice'),
        ]

        const fetchMailData = vi.fn().mockResolvedValue({ results: mails, count: 1 })

        const wrapper = mount(AccessMailWorkbench, {
            props: {
                title: '收件箱',
                fetchMailData,
            },
            global: {
                plugins: [i18n],
                components: stubs,
                stubs,
            },
        })

        await vi.waitFor(() => {
            expect(wrapper.findAll('.mail-row').length).toBe(1)
        })

        // List container role
        const mailList = wrapper.find('.mail-list')
        expect(mailList.attributes('role')).toBe('list')

        // Row listitem role and tabindex
        const mailRow = wrapper.find('.mail-row')
        expect(mailRow.attributes('role')).toBe('listitem')
        expect(mailRow.attributes('tabindex')).toBe('0')
        // Row is a <div>, not a <button>
        expect(mailRow.element.tagName.toLowerCase()).toBe('div')

        // Row actions toolbar
        const toolbar = wrapper.find('.user-mail-row-actions')
        expect(toolbar.attributes('role')).toBe('toolbar')
        expect(toolbar.attributes('aria-label')).toBe('快捷操作')

        // Enter multiAction mode to test checkbox accessible name
        const multiActionBtn = wrapper.findAll('button').find((b) => b.text().includes('多选'))
        await multiActionBtn.trigger('click')

        const checkbox = wrapper.find('.mail-row-checkbox')
        expect(checkbox.attributes('aria-label')).toBe('选择 Important Notice')

        wrapper.unmount()
    })
})
