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

    it('paginates normalized rows, clamps pages on data updates, and resets on filter changes', async () => {
        const generateMails = (count) => Array.from({ length: count }, (_, i) => rawMail(i + 1, {
            subject: `Mail ${i + 1}`,
            unread: i % 2 === 0,
            is_read: i % 2 !== 0,
        }))
        const source = ref(generateMails(60)) // 60 mails -> 3 pages of 25 (25, 25, 10)
        const ui = reactive({
            view: 'flow',
            query: '',
            domain: 'all',
            address: 'all',
            status: 'all',
            flowMode: 'list',
            detailKind: '',
            selected: { flow: '', exception: '' },
        })
        const syncRoute = vi.fn()
        const resetListScroll = vi.fn()
        const scope = effectScope()
        scopes.push(scope)
        const flow = scope.run(() => useAdminMailFlow({
            getMails: () => source.value,
            getUnknownMails: () => [],
            ui,
            activeView: ref('flow'),
            parseItem: vi.fn(),
            loadMail: vi.fn(),
            resetListScroll,
            syncRoute,
            replaceRouteQuery: vi.fn(),
            persistView: vi.fn(),
            onSelectionMissing: vi.fn(),
            onParseError: vi.fn(),
        }))

        await nextTick()

        // Page 1: 25 items
        expect(flow.mailPage.value).toBe(1)
        expect(flow.mailPageSize.value).toBe(25)
        expect(flow.totalMailPages.value).toBe(3)
        expect(flow.canPrevMailPage.value).toBe(false)
        expect(flow.canNextMailPage.value).toBe(true)
        expect(flow.visibleMailRows.value.length).toBe(25)
        expect(flow.visibleMailRows.value[0].id).toBe('mail-1')
        expect(flow.visibleMailRows.value[24].id).toBe('mail-25')

        // Navigate to Page 2
        flow.nextMailPage()
        expect(flow.mailPage.value).toBe(2)
        expect(flow.canPrevMailPage.value).toBe(true)
        expect(flow.canNextMailPage.value).toBe(true)
        expect(flow.visibleMailRows.value.length).toBe(25)
        expect(flow.visibleMailRows.value[0].id).toBe('mail-26')
        expect(flow.visibleMailRows.value[24].id).toBe('mail-50')
        expect(resetListScroll).toHaveBeenCalled()

        // Navigate to Page 3
        flow.nextMailPage()
        expect(flow.mailPage.value).toBe(3)
        expect(flow.canPrevMailPage.value).toBe(true)
        expect(flow.canNextMailPage.value).toBe(false) // last page boundary!
        expect(flow.visibleMailRows.value.length).toBe(10)
        expect(flow.visibleMailRows.value[0].id).toBe('mail-51')
        expect(flow.visibleMailRows.value[9].id).toBe('mail-60')

        // Cannot go past last page
        flow.nextMailPage()
        expect(flow.mailPage.value).toBe(3)

        // Navigate back to Page 2
        flow.prevMailPage()
        expect(flow.mailPage.value).toBe(2)

        // Filter change (status) resets page to 1
        ui.status = 'unread'
        await nextTick()
        expect(flow.mailPage.value).toBe(1)
        // 30 unread mails -> 2 pages of 25 (25, 5)
        expect(flow.totalMailPages.value).toBe(2)
        expect(flow.visibleMailRows.value.length).toBe(25)

        // Navigate to Page 2 of unread
        flow.nextMailPage()
        expect(flow.mailPage.value).toBe(2)

        // Search query change resets page to 1
        ui.query = 'Mail 1'
        await nextTick()
        expect(flow.mailPage.value).toBe(1)

        // Reset query and status
        ui.query = ''
        ui.status = 'all'
        await nextTick()
        expect(flow.mailPage.value).toBe(1)

        // Go to page 3, then data shrinks -> page is clamped
        flow.setMailPage(3)
        expect(flow.mailPage.value).toBe(3)
        source.value = generateMails(20) // Only 20 items -> 1 page
        await nextTick()
        expect(flow.totalMailPages.value).toBe(1)
        expect(flow.mailPage.value).toBe(1) // clamped to maxPages!
    })

    it('scopes Select All and Shift selection to current visible page across pagination', async () => {
        const generateMails = (count) => Array.from({ length: count }, (_, i) => rawMail(i + 1, {
            subject: `Mail ${i + 1}`,
            unread: i < 30, // 1-30 unread, 31-50 read
            is_read: i >= 30,
        }))
        const source = ref(generateMails(50)) // 2 pages of 25
        const ui = reactive({
            view: 'flow',
            query: '',
            domain: 'all',
            address: 'all',
            status: 'all',
            flowMode: 'list',
            detailKind: '',
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

        // 1. On Page 1, select all visible
        expect(flow.mailPage.value).toBe(1)
        flow.selectAllVisibleMails('all')
        expect(flow.selectedVisibleCount.value).toBe(25)
        expect(flow.selectedMailCount.value).toBe(25)
        expect(flow.isAllVisibleSelected.value).toBe(true)
        expect(flow.isSomeVisibleSelected.value).toBe(false)
        expect(flow.isMailSelected('mail-1')).toBe(true)
        expect(flow.isMailSelected('mail-25')).toBe(true)
        expect(flow.isMailSelected('mail-26')).toBe(false)

        // 2. Navigate to Page 2: visible selection indicators reflect Page 2 only
        flow.nextMailPage()
        expect(flow.mailPage.value).toBe(2)
        expect(flow.selectedVisibleCount.value).toBe(0)
        expect(flow.isAllVisibleSelected.value).toBe(false)
        expect(flow.isSomeVisibleSelected.value).toBe(false)
        // Total selected count is still 25 from Page 1
        expect(flow.selectedMailCount.value).toBe(25)

        // 3. Select unread on Page 2 (mails 26-30 are unread, 31-50 are read)
        flow.selectAllVisibleMails('unread')
        expect(flow.selectedVisibleCount.value).toBe(5)
        expect(flow.isSomeVisibleSelected.value).toBe(true)
        expect(flow.isAllVisibleSelected.value).toBe(false)
        // Total selected is now 25 (from page 1) + 5 (from page 2) = 30
        expect(flow.selectedMailCount.value).toBe(30)
        expect(flow.isMailSelected('mail-26')).toBe(true)
        expect(flow.isMailSelected('mail-30')).toBe(true)
        expect(flow.isMailSelected('mail-31')).toBe(false)

        // 4. Shift range selection on Page 2
        // Select row 31, then shift-select row 33 -> selects rows 31, 32, 33 on page 2
        const row31 = flow.visibleMailRows.value[5] // mail-31
        const row33 = flow.visibleMailRows.value[7] // mail-33
        flow.toggleMailSelection(row31)
        flow.toggleMailSelection(row33, { shiftKey: true })
        expect(flow.isMailSelected('mail-31')).toBe(true)
        expect(flow.isMailSelected('mail-32')).toBe(true)
        expect(flow.isMailSelected('mail-33')).toBe(true)

        // 5. Select None on Page 2 removes Page 2 selections, Page 1 remains intact
        flow.selectAllVisibleMails('none')
        expect(flow.selectedVisibleCount.value).toBe(0)
        expect(flow.isAllVisibleSelected.value).toBe(false)
        expect(flow.selectedMailCount.value).toBe(25) // Page 1 mails still selected!

        // Navigate back to Page 1
        flow.prevMailPage()
        expect(flow.selectedVisibleCount.value).toBe(25)
        expect(flow.isAllVisibleSelected.value).toBe(true)
    })

    it('toggles list / split view mode and synchronizes route', () => {
        const ui = reactive({
            view: 'flow',
            query: '',
            domain: 'all',
            address: 'all',
            status: 'all',
            flowMode: 'list',
            detailKind: '',
            selected: { flow: '', exception: '' },
        })
        const syncRoute = vi.fn()
        const scope = effectScope()
        scopes.push(scope)
        const flow = scope.run(() => useAdminMailFlow({
            getMails: () => [],
            getUnknownMails: () => [],
            ui,
            activeView: ref('flow'),
            parseItem: vi.fn(),
            loadMail: vi.fn(),
            resetListScroll: vi.fn(),
            syncRoute,
            replaceRouteQuery: vi.fn(),
            persistView: vi.fn(),
            onSelectionMissing: vi.fn(),
            onParseError: vi.fn(),
        }))

        expect(ui.flowMode).toBe('list')

        // Toggle to detail / split view
        flow.toggleMailViewMode()
        expect(ui.flowMode).toBe('detail')
        expect(syncRoute).toHaveBeenCalledWith({ mode: 'detail' })

        // Toggle back to list view
        flow.toggleMailViewMode()
        expect(ui.flowMode).toBe('list')
        expect(syncRoute).toHaveBeenCalledWith({ mode: undefined })
    })

    it('tracks isDetailParsing during async parsing, switches cleanly, and isolates renderer from preview snippets', async () => {
        let resolveParse1
        const parsePromise1 = new Promise((resolve) => {
            resolveParse1 = resolve
        })
        let resolveParse2
        const parsePromise2 = new Promise((resolve) => {
            resolveParse2 = resolve
        })

        const parseItem = vi.fn().mockImplementation((item) => {
            if (item.id === 1) return parsePromise1
            if (item.id === 2) return parsePromise2
            return Promise.resolve({ subject: item.subject, html: '', message: '', raw: '' })
        })

        const source = ref([
            { ...rawMail(1), raw: 'From: a@b.c\r\nSubject: Mail 1\r\n\r\nPreviewSnippetOne' },
            { ...rawMail(2), raw: 'From: a@b.c\r\nSubject: Mail 2\r\n\r\nPreviewSnippetTwo' },
        ])
        const ui = reactive({
            view: 'flow',
            query: '',
            domain: 'all',
            address: 'all',
            status: 'all',
            flowMode: 'detail',
            detailKind: 'flow',
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
            parseItem,
            loadMail: vi.fn(),
            resetListScroll: vi.fn(),
            syncRoute: vi.fn(),
            replaceRouteQuery: vi.fn(),
            persistView: vi.fn(),
            onSelectionMissing: vi.fn(),
            onParseError: vi.fn(),
        }))

        // Initially no mail is selected
        expect(flow.isDetailParsing.value).toBe(false)
        expect(flow.currentRendererMail.value).toBeNull()

        // 1. Select Mail 1: parsing becomes pending
        ui.selected.flow = 'mail-1'
        await nextTick()
        expect(flow.isDetailParsing.value).toBe(true)

        // List row maintains its snippet preview
        expect(flow.currentMail.value.body).toContain('PreviewSnippetOne')

        // But renderer mail input MUST NOT contain the list preview snippet or fallback to row.body
        const pendingRendererMail = flow.currentRendererMail.value
        expect(pendingRendererMail).not.toBeNull()
        expect(pendingRendererMail.message).toBe('')
        expect(pendingRendererMail.text).toBe('')
        expect(pendingRendererMail.messageIsHtml).toBe(false)
        expect(pendingRendererMail.message).not.toContain('PreviewSnippetOne')
        expect(pendingRendererMail.text).not.toContain('PreviewSnippetOne')

        // 2. Switch to Mail 2 while Mail 1 is still pending
        ui.selected.flow = 'mail-2'
        await nextTick()

        // isDetailParsing for currentMail (mail-2) becomes true once mail-2's parse is triggered
        expect(flow.currentMail.value.id).toBe('mail-2')
        expect(flow.isDetailParsing.value).toBe(true)
        expect(flow.currentRendererMail.value.message).not.toContain('PreviewSnippetTwo')

        // 3. Resolve Mail 1 in background (should not flip mail-2's pending state)
        resolveParse1({
            subject: 'Mail 1',
            html: '<p>Resolved Body 1</p>',
            message: '<p>Resolved Body 1</p>',
            messageIsHtml: true,
            raw: '...',
            attachments: [],
        })
        await nextTick()
        await Promise.resolve()
        await nextTick()
        // Mail 2 is still pending
        expect(flow.isDetailParsing.value).toBe(true)

        // 4. Resolve Mail 2
        resolveParse2({
            subject: 'Mail 2',
            html: '<p>Resolved Body 2</p>',
            message: '<p>Resolved Body 2</p>',
            messageIsHtml: true,
            raw: '...',
            attachments: [],
        })
        await nextTick()
        await Promise.resolve()
        await nextTick()

        // Now mail-2 is complete and isDetailParsing is false
        expect(flow.isDetailParsing.value).toBe(false)
        expect(flow.currentRendererMail.value.message).toBe('<p>Resolved Body 2</p>')
        expect(flow.currentRendererMail.value.messageIsHtml).toBe(true)

        // Switch back to Mail 1 (already cached): isDetailParsing remains false immediately
        ui.selected.flow = 'mail-1'
        await nextTick()
        expect(flow.isDetailParsing.value).toBe(false)
        expect(flow.currentRendererMail.value.message).toBe('<p>Resolved Body 1</p>')
    })

    it('schedules prefetch with ~120ms delay, cancels on leave, and deduplicates against cache and in-flight parse', async () => {
        vi.useFakeTimers()
        try {
            const source = ref([
                { ...rawMail(1), raw: 'From: a@b.c\r\nSubject: Mail 1\r\n\r\nBody 1' },
                { ...rawMail(2), raw: 'From: a@b.c\r\nSubject: Mail 2\r\n\r\nBody 2' },
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
            const parseItem = vi.fn().mockResolvedValue({
                subject: 'Parsed',
                html: '<p>Parsed</p>',
                message: '<p>Parsed</p>',
                messageIsHtml: true,
                raw: '...',
                attachments: [],
            })
            const scope = effectScope()
            scopes.push(scope)
            const flow = scope.run(() => useAdminMailFlow({
                getMails: () => source.value,
                getUnknownMails: () => [],
                ui,
                activeView: ref('flow'),
                parseItem,
                loadMail: vi.fn(),
                resetListScroll: vi.fn(),
                syncRoute: vi.fn(),
                replaceRouteQuery: vi.fn(),
                persistView: vi.fn(),
                onSelectionMissing: vi.fn(),
                onParseError: vi.fn(),
            }))

            const row1 = flow.mailRows.value[0]
            const row2 = flow.mailRows.value[1]

            // 1. Hover row 1 -> schedule prefetch
            flow.schedulePrefetchMail(row1)
            expect(parseItem).not.toHaveBeenCalled()

            // 2. Advance 100ms (not yet 120ms) -> still not called
            vi.advanceTimersByTime(100)
            expect(parseItem).not.toHaveBeenCalled()

            // 3. Mouse leaves row 1 before 120ms -> cancel prefetch
            flow.cancelPrefetchMail(row1)
            vi.advanceTimersByTime(50)
            expect(parseItem).not.toHaveBeenCalled()

            // 4. Hover row 2 -> wait 120ms -> triggered
            flow.schedulePrefetchMail(row2)
            vi.advanceTimersByTime(120)
            await Promise.resolve()
            expect(parseItem).toHaveBeenCalledTimes(1)

            // 5. Subsequent hover on row 2 (already cached) does not re-fetch
            flow.schedulePrefetchMail(row2)
            vi.advanceTimersByTime(200)
            await Promise.resolve()
            expect(parseItem).toHaveBeenCalledTimes(1)
        } finally {
            vi.useRealTimers()
        }
    })

    it('handles missing raw and parse failures gracefully without remaining in a stuck pending state', async () => {
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
            mailRenderMode: 'html',
            selected: { flow: '', exception: '' },
        })
        const parseError = new Error('WASM engine failure')
        const onParseError = vi.fn()
        const loadMail = vi.fn().mockImplementation(async (id) => {
            if (id === 1) return { raw: '' }
            throw parseError
        })
        const scope = effectScope()
        scopes.push(scope)
        const flow = scope.run(() => useAdminMailFlow({
            getMails: () => source.value,
            getUnknownMails: () => [],
            ui,
            activeView: ref('flow'),
            parseItem: vi.fn(),
            loadMail,
            resetListScroll: vi.fn(),
            syncRoute: vi.fn(),
            replaceRouteQuery: vi.fn(),
            persistView: vi.fn(),
            onSelectionMissing: vi.fn(),
            onParseError,
        }))

        // Select mail 1: loadMail returns empty raw
        ui.selected.flow = 'mail-1'
        await nextTick()
        await Promise.resolve()
        await nextTick()

        expect(flow.isDetailParsing.value).toBe(false)
        expect(flow.currentDisplayMail.value.parseFailed).toBe(true)
        expect(flow.currentRendererMail.value.message).toBe('')

        // Select mail 2: loadMail throws error
        ui.selected.flow = 'mail-2'
        await nextTick()
        await Promise.resolve()
        await nextTick()

        expect(flow.isDetailParsing.value).toBe(false)
        expect(flow.currentDisplayMail.value.parseFailed).toBe(true)
        expect(onParseError).toHaveBeenCalledWith(parseError)
    })
})
