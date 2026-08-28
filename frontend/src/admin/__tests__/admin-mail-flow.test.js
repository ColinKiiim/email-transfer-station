import { effectScope, nextTick, reactive, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
    adminQueryTokens,
    buildAdminDisplayMail,
    buildAdminMailHierarchy,
    buildAdminMailRail,
    buildAdminRendererMail,
    filterAdminRows,
    normalizeAdminMailRows,
    normalizeUnknownMailRows,
    useAdminMailFlow,
} from '../admin-mail-flow'

const scopes = []

afterEach(() => {
    scopes.splice(0).forEach((scope) => scope.stop())
})

const rawMail = (id = 7, overrides = {}) => ({
    id,
    address: 'ops@example.test',
    source: 'smtp-gateway',
    raw: `From: Sender <sender@example.test>\r\nSubject: Invoice ${id}\r\n\r\nFixture body`,
    created_at: '2026-07-15 10:00:00',
    unread: true,
    attachments: [{ filename: 'invoice.pdf' }],
    ...overrides,
})

describe('admin mail-flow model', () => {
    it('normalizes canonical and unknown mail rows without view state', () => {
        const [row] = normalizeAdminMailRows([rawMail()])
        const [unknown] = normalizeUnknownMailRows([{
            id: 9,
            original_recipient: 'missing@example.test',
            raw: 'Subject: Unknown fixture\r\n\r\nUnknown body',
        }])

        expect(row).toMatchObject({
            id: 'mail-7',
            sourceId: 7,
            sender: 'Sender <sender@example.test>',
            senderDisplay: 'Sender',
            to: 'ops@example.test',
            domain: 'example.test',
            subject: 'Invoice 7',
            unread: true,
            attachmentCount: 1,
            attachmentLabel: '1 个附件',
        })
        expect(unknown).toMatchObject({
            id: 'unknown-9',
            title: 'Unknown fixture',
            owner: 'missing@example.test',
            ownerDisplay: 'missing@example.test',
            domain: 'example.test',
            status: '未知地址',
            statusKey: 'unknown',
            statusTone: 'danger',
        })
    })

    it('uses sender aliases and localized placeholders for incomplete rows', () => {
        const [fromRow] = normalizeAdminMailRows([{
            id: 11,
            from: 'alias@example.test',
            address: 'ops@example.test',
        }])
        const [emptyRow] = normalizeAdminMailRows([{
            id: 12,
            address: 'ops@example.test',
        }])

        expect(fromRow).toMatchObject({
            sender: 'alias@example.test',
            senderDisplay: 'alias@example.test',
            subject: '(无主题)',
        })
        expect(emptyRow).toMatchObject({
            sender: '(未知发件人)',
            senderDisplay: '(未知发件人)',
            subject: '(无主题)',
        })
    })

    it('cleans HTML entities and zero-width markers in normalized row body previews', () => {
        const [row] = normalizeAdminMailRows([{
            id: 15,
            address: 'ops@example.test',
            raw: 'Subject: Entities\r\n\r\nRaw fallback',
            text: 'Hello &nbsp; &zwnj;world \u200B\uFEFF!',
        }])
        const [htmlRow] = normalizeAdminMailRows([{
            id: 16,
            address: 'ops@example.test',
            html: '<p>Welcome &amp; <b>enjoy</b> &#8204;today!</p>',
        }])

        expect(row.body).toBe('Hello world !')
        expect(htmlRow.body).toBe('Welcome & enjoy today!')
    })

    it('applies structured query, scope, and status filters', () => {
        const rows = normalizeAdminMailRows([
            rawMail(1),
            rawMail(2, {
                address: 'archive@other.test',
                sender: 'Elsewhere <else@example.test>',
                subject: 'Read notice',
                unread: false,
                is_read: true,
                attachments: [],
            }),
        ])

        expect(adminQueryTokens('from:sender "Invoice 1"')).toEqual(['from:sender', 'invoice 1'])
        expect(filterAdminRows(rows, {
            query: 'from:sender has:attachment',
            domain: 'example.test',
            address: 'all',
            status: 'unread',
        }, 'flow')).toEqual([rows[0]])
        expect(filterAdminRows(rows, {
            query: 'from:elsewhere',
            domain: 'all',
            address: 'all',
            status: 'all',
        }, 'flow')).toEqual([rows[1]])
        expect(filterAdminRows(rows, {
            query: 'is:read',
            domain: 'all',
            address: 'archive@other.test',
            status: 'all',
        }, 'flow')).toEqual([rows[1]])
    })

    it('builds queue and domain counts from normalized rows', () => {
        const mails = normalizeAdminMailRows([
            rawMail(1),
            rawMail(2, { address: 'team@example.test', attachments: [] }),
        ])
        const hierarchy = buildAdminMailHierarchy({
            mails,
            unknownMails: [{ id: 'unknown-1' }],
            domains: [{ id: 'domain-1', domain: 'example.test', mails: 99 }],
            addresses: ['all', 'ops@example.test', 'team@example.test'],
            totalCount: 12,
            unreadCount: 2,
        })

        expect(hierarchy.queues.map((row) => row.count)).toEqual([12, 2, 2, 1, 1])
        expect(hierarchy.domains[0]).toMatchObject({
            domain: 'example.test',
            mails: 2,
            addresses: [
                { address: 'ops@example.test', count: 1 },
                { address: 'team@example.test', count: 1 },
            ],
        })
    })

    it('separates parsed display data from renderer input', () => {
        const [row] = normalizeAdminMailRows([rawMail()])
        const display = buildAdminDisplayMail(row, {
            subject: 'Parsed invoice',
            source: 'Parsed sender',
            html: '<p>Parsed body</p>',
            message: '<p>Parsed body</p>',
            messageIsHtml: true,
            attachments: [{ filename: 'parsed.pdf' }],
        })

        expect(display).toMatchObject({
            subject: 'Parsed invoice',
            sender: 'Parsed sender',
            messageIsHtml: true,
            attachmentLabel: '1 个附件',
        })
        expect(buildAdminRendererMail(display, 'html')).toMatchObject({
            id: 7,
            source: 'Parsed sender',
            address: 'ops@example.test',
            text: '',
            messageIsHtml: true,
        })
        expect(buildAdminMailRail(display)).toMatchObject({
            title: '邮件详情',
            subtitle: 'Parsed invoice',
            tags: expect.arrayContaining(['HTML 已隔离渲染', '1 个附件']),
            mail: display,
        })
        expect(buildAdminMailRail(null)).toMatchObject({ empty: true, title: '选择一封邮件' })
    })

    it('caches MIME parsing and owns adjacent-selection and filter actions', async () => {
        const source = ref([
            { ...rawMail(1), raw: '' },
            { ...rawMail(2), raw: '' },
        ])
        const ui = reactive({
            view: 'flow',
            query: '',
            domain: 'all',
            address: 'all',
            status: 'all',
            flowMode: 'detail',
            detailKind: 'flow',
            mailRenderMode: 'text',
            selected: { flow: 'mail-1', exception: '' },
        })
        const parseItem = vi.fn().mockResolvedValue({
            subject: 'Parsed fixture',
            html: '<p>Parsed</p>',
            message: '<p>Parsed</p>',
            messageIsHtml: true,
            raw: rawMail(1).raw,
            attachments: [],
        })
        const loadMail = vi.fn().mockImplementation((id) => rawMail(id))
        const syncRoute = vi.fn()
        const onSelectionMissing = vi.fn()
        const scope = effectScope()
        scopes.push(scope)
        const flow = scope.run(() => useAdminMailFlow({
            getMails: () => source.value,
            getUnknownMails: () => [],
            ui,
            activeView: ref('flow'),
            parseItem,
            loadMail,
            resetListScroll: vi.fn(),
            syncRoute,
            replaceRouteQuery: vi.fn(),
            persistView: vi.fn(),
            onSelectionMissing,
            onParseError: vi.fn(),
        }))

        await nextTick()
        await Promise.resolve()
        await nextTick()
        expect(parseItem).toHaveBeenCalledTimes(1)
        expect(loadMail).toHaveBeenCalledWith(1)
        expect(flow.currentDisplayMail.value.subject).toBe('Parsed fixture')
        expect(flow.currentDisplayMail.value.raw).toContain('Fixture body')
        expect(ui.mailRenderMode).toBe('html')

        await flow.parseAdminMailDetail(flow.currentMail.value)
        expect(parseItem).toHaveBeenCalledTimes(1)
        flow.setMailAddress('ops@example.test')
        expect(syncRoute).toHaveBeenCalledWith(expect.objectContaining({
            address: 'ops@example.test',
            domain: 'example.test',
        }))

        source.value = [{ ...rawMail(2), raw: '' }]
        await nextTick()
        expect(ui.selected.flow).toBe('')
        expect(onSelectionMissing).toHaveBeenCalledTimes(1)

        ui.selected.flow = 'mail-2'
        ui.flowMode = 'detail'
        ui.detailKind = 'flow'
        flow.backToMailList()
        expect(ui.flowMode).toBe('list')
        expect(ui.selected.flow).toBe('')
        expect(ui.detailKind).toBe('')
        expect(syncRoute).toHaveBeenCalledWith({ mailId: undefined, mode: undefined })
    })

    it('handles row selection toggle, shift range, select all options, and stale pruning', async () => {
        const source = ref([
            rawMail(1, { unread: true, is_read: false }),
            rawMail(2, { unread: false, is_read: true }),
            rawMail(3, { unread: true, is_read: false }),
            rawMail(4, { unread: false, is_read: true }),
        ])
        const ui = reactive({
            view: 'flow',
            query: '',
            domain: 'all',
            address: 'all',
            status: 'all',
            flowMode: 'list',
            detailKind: '',
            mailRenderMode: 'html',
            selected: { flow: '', exception: '' },
        })
        const scope = effectScope()
        scopes.push(scope)
        const flow = scope.run(() => useAdminMailFlow({
            getMails: () => source.value,
            getUnknownMails: () => [],
            ui,
            activeView: ref('flow'),
            parseItem: vi.fn(),
            loadMail: vi.fn(),
            resetListScroll: vi.fn(),
            syncRoute: vi.fn(),
            replaceRouteQuery: vi.fn(),
            persistView: vi.fn(),
            onSelectionMissing: vi.fn(),
            onParseError: vi.fn(),
        }))

        await nextTick()

        // 1. Initial selection state
        expect(flow.selectedMailCount.value).toBe(0)
        expect(flow.isAllVisibleSelected.value).toBe(false)
        expect(flow.isSomeVisibleSelected.value).toBe(false)

        // 2. Toggle single selection
        const row1 = flow.filteredMailRows.value[0]
        flow.toggleMailSelection(row1)
        expect(flow.isMailSelected('mail-1')).toBe(true)
        expect(flow.selectedMailCount.value).toBe(1)
        expect(flow.isSomeVisibleSelected.value).toBe(true)
        expect(flow.isAllVisibleSelected.value).toBe(false)

        // 3. Shift range selection from row1 to row3
        const row3 = flow.filteredMailRows.value[2]
        flow.toggleMailSelection(row3, { shiftKey: true })
        expect(flow.isMailSelected('mail-1')).toBe(true)
        expect(flow.isMailSelected('mail-2')).toBe(true)
        expect(flow.isMailSelected('mail-3')).toBe(true)
        expect(flow.isMailSelected('mail-4')).toBe(false)
        expect(flow.selectedMailCount.value).toBe(3)

        // 4. Select All
        flow.selectAllVisibleMails('all')
        expect(flow.selectedMailCount.value).toBe(4)
        expect(flow.isAllVisibleSelected.value).toBe(true)
        expect(flow.isSomeVisibleSelected.value).toBe(false)

        // 5. Select None
        flow.selectAllVisibleMails('none')
        expect(flow.selectedMailCount.value).toBe(0)
        expect(flow.isAllVisibleSelected.value).toBe(false)

        // 6. Select Read
        flow.selectAllVisibleMails('read')
        expect(flow.selectedMailCount.value).toBe(2)
        expect(flow.isMailSelected('mail-2')).toBe(true)
        expect(flow.isMailSelected('mail-4')).toBe(true)
        expect(flow.isMailSelected('mail-1')).toBe(false)

        // 7. Select Unread
        flow.selectAllVisibleMails('unread')
        expect(flow.selectedMailCount.value).toBe(2)
        expect(flow.isMailSelected('mail-1')).toBe(true)
        expect(flow.isMailSelected('mail-3')).toBe(true)

        // 8. Stale selection pruning on filter change
        ui.status = 'unread'
        await nextTick()
        // Visible rows are mail-1 and mail-3
        expect(flow.filteredMailRows.value.map((r) => r.id)).toEqual(['mail-1', 'mail-3'])
        expect(flow.selectedMailCount.value).toBe(2)

        // Select mail-1 only, then filter out to read
        flow.clearMailSelection()
        flow.toggleMailSelection(flow.filteredMailRows.value[0]) // mail-1
        expect(flow.isMailSelected('mail-1')).toBe(true)

        ui.status = 'read'
        await nextTick()
        // Visible rows are mail-2 and mail-4; mail-1 is pruned!
        expect(flow.isMailSelected('mail-1')).toBe(false)
        expect(flow.selectedMailCount.value).toBe(0)

        // 9. Stale selection pruning on source update
        ui.status = 'all'
        await nextTick()
        flow.toggleMailSelection(flow.filteredMailRows.value[0]) // mail-1
        expect(flow.isMailSelected('mail-1')).toBe(true)

        source.value = [rawMail(2), rawMail(3)]
        await nextTick()
        expect(flow.isMailSelected('mail-1')).toBe(false)
        expect(flow.selectedMailCount.value).toBe(0)
    })
})
