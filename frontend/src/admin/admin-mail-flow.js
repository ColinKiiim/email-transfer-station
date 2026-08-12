import { computed, reactive, ref, watch } from 'vue'

import {
    adminMailCacheKey,
    compactRaw,
    compactText,
    extractHeader,
    formatAttachmentCount,
    formatDate,
    formatShortDate,
    getDomain,
    mailRenderLabel,
    normalizedAttachments,
    stripHtml,
} from './admin-formatters'
import { adminT } from './admin-i18n'
import { statusOptionsForView } from './admin-route-state'

const t = adminT('admin.mail')


export const normalizeAdminMailRows = (rows = []) => (Array.isArray(rows) ? rows : []).map((row) => {
    const subject = compactText(row.subject, extractHeader(row.raw, 'Subject') || row.message_id || `Mail #${row.id}`)
    const sender = compactText(row.sender, extractHeader(row.raw, 'From') || row.source || '-')
    const address = row.address || row.original_recipient || '-'
    const effectiveDomain = getDomain(address)
    const text = compactText(row.text)
    const html = String(row.html || row.message || '')
    const body = text || compactText(stripHtml(html), compactRaw(row.raw))
    const attachments = normalizedAttachments(row.attachments)
    const attachmentCount = Number.isFinite(Number(row.attachment_count))
        ? Number(row.attachment_count)
        : attachments.length
    const hasReadState = row.read_at !== undefined || row.is_read !== undefined || row.unread !== undefined
    const hasReadAt = typeof row.read_at === 'string' && row.read_at.length > 0
    const isRead = hasReadState
        ? row.is_read === true || row.is_read === 1 || row.is_read === '1' || hasReadAt
        : undefined
    const unread = hasReadState
        ? row.unread === true || row.unread === 1 || row.unread === '1' || !isRead
        : undefined
    return {
        id: `mail-${row.id}`,
        sourceId: row.id,
        read_at: row.read_at,
        is_read: isRead,
        unread,
        time: formatShortDate(row.created_at),
        fullTime: formatDate(row.created_at),
        created_at: row.created_at,
        sender,
        to: address,
        domain: effectiveDomain,
        originalDomain: row.original_domain || effectiveDomain,
        subject,
        size: row.raw ? `${(String(row.raw).length / 1024).toFixed(1)} KB` : '-',
        result: address === '-' ? t('unknownAddress') : t('saved'),
        // Semantic companions to `result`. Filtering, conditional rendering and
        // badge colour must key off these, never off the display string, so
        // translating the label cannot change behaviour.
        resultKey: address === '-' ? 'unknown' : 'saved',
        resultTone: address === '-' ? 'danger' : 'ok',
        isSaved: address !== '-',
        statusTokens: [
            address === '-' ? 'unknown' : 'saved',
            unread === true ? 'unread' : '',
            isRead === true ? 'read' : '',
            attachmentCount > 0 ? 'attachment' : '',
        ].filter(Boolean),
        auth: row.recipient_confidence || row.ingress_source || '-',
        ip: row.source || '-',
        risk: row.ingress_source === 'collector-unresolved'
            ? t('anomalyQueue')
            : mailRenderLabel({ html, text, parseStatus: row.parse_status }),
        body,
        text,
        html,
        message: html || text,
        raw: row.raw || '',
        attachments,
        attachmentCount,
        attachmentLabel: formatAttachmentCount(attachmentCount),
        parseStatus: row.parse_status || 'unknown',
    }
})

export const normalizeUnknownMailRows = (rows = []) => (Array.isArray(rows) ? rows : []).map((row) => ({
    id: `unknown-${row.id}`,
    level: 'P2',
    title: compactText(row.subject, extractHeader(row.raw, 'Subject') || t('unknownRecipientTitle', { id: row.id })),
    owner: row.address || row.original_recipient || t('mailFlow'),
    status: t('unknownAddress'),
    statusKey: 'unknown',
    statusTone: 'danger',
    statusTokens: ['unknown'],
    detail: compactText(row.text, compactText(stripHtml(row.html || row.message), compactRaw(row.raw))),
    domain: getDomain(row.address || row.original_recipient),
    originalDomain: row.original_domain || '',
}))

export const adminQueryTokens = (value) => String(value || '')
    .trim()
    .match(/(?:[^\s"]+|"[^"]*")+/g)
    ?.map((token) => token.replace(/^"|"$/g, '').toLowerCase())
    .filter(Boolean) || []

const matchesMailOperator = (row, token) => {
    const [rawKey, ...rest] = token.split(':')
    if (!rest.length) return null
    const key = rawKey.trim()
    const value = rest.join(':').trim()
    if (key === 'from') return String(row.sender || '').toLowerCase().includes(value)
    if (key === 'to') return String(row.to || row.address || '').toLowerCase().includes(value)
    if (key === 'subject') return String(row.subject || '').toLowerCase().includes(value)
    if (key === 'has' && value === 'attachment') return Number(row.attachmentCount || 0) > 0
    if (key === 'is' && value === 'unread') return row.unread === true
    if (key === 'is' && value === 'read') return row.is_read === true || row.unread === false
    if (key === 'after') return String(row.fullTime || row.time || '').slice(0, 10) >= value
    if (key === 'before') return String(row.fullTime || row.time || '').slice(0, 10) <= value
    return null
}

export const matchesAdminRow = (row, filters, view) => {
    const tokens = adminQueryTokens(filters.query)
    const text = [
        row.subject,
        row.sender,
        row.to,
        row.address,
        row.domain,
        row.originalDomain,
        row.body,
        row.text,
        row.risk,
        row.result,
        row.auth,
    ].filter(Boolean).join(' ').toLowerCase()
    const inQuery = tokens.every((token) => {
        const operatorResult = matchesMailOperator(row, token)
        return operatorResult === null ? text.includes(token) : operatorResult
    })
    const inDomain = filters.domain === 'all'
        || row.domain === filters.domain
        || row.address?.endsWith(`@${filters.domain}`)
        || row.to?.endsWith(`@${filters.domain}`)
    const inAddress = filters.address === 'all'
        || row.address === filters.address
        || row.to === filters.address
        || row.owner === filters.address
    // Semantic tokens, not display text: a translated status must not change
    // which rows a filter selects.
    const statusTokens = row.statusTokens || [
        row.is_read ? 'read' : '',
        row.unread ? 'unread' : '',
        Number(row.attachmentCount || 0) > 0 ? 'attachment' : '',
    ].filter(Boolean)
    const options = statusOptionsForView(view)
    const activeStatus = options.includes(filters.status) ? filters.status : 'all'
    const inStatus = activeStatus === 'all'
        || statusTokens.includes(activeStatus)
        // legacy/free-form statuses (the access view uses 'active' / 'success')
        || String(row.status || '').toLowerCase().includes(activeStatus.toLowerCase())
    return inQuery && inDomain && inAddress && inStatus
}

export const filterAdminRows = (rows, filters, view) => rows.filter((row) => matchesAdminRow(row, filters, view))

export const buildAdminMailHierarchy = ({
    mails,
    unknownMails,
    domains,
    addresses,
    totalCount,
    unreadCount,
}) => {
    const allCount = Number.isFinite(Number(totalCount)) ? Number(totalCount) : mails.length
    const attachmentCount = mails.filter((row) => Number(row.attachmentCount || 0) > 0).length
    const domainMailCount = (domain) => {
        const scoped = mails.filter((row) => row.domain === domain || getDomain(row.to) === domain)
        if (scoped.length > 0) return scoped.length
        const count = Number(domains.find((row) => row.domain === domain)?.mails)
        return Number.isFinite(count) ? count : 0
    }
    return {
        queues: [
            { id: 'queue-all', label: t('queueAll'), count: allCount, status: 'all' },
            { id: 'queue-unread', label: t('unread'), count: unreadCount, status: 'unread' },
            { id: 'queue-saved', label: t('saved'), count: mails.filter((row) => row.isSaved).length, status: 'saved' },
            { id: 'queue-attachment', label: t('hasAttachment'), count: attachmentCount, status: 'attachment' },
            { id: 'queue-unknown', label: t('unknownRecipient'), count: unknownMails.length, status: 'unknown' },
        ],
        domains: domains.map((domain) => ({
            ...domain,
            mails: domainMailCount(domain.domain),
            addresses: addresses
                .filter((address) => address !== 'all' && address.endsWith(`@${domain.domain}`))
                .map((address) => ({
                    address,
                    count: mails.filter((row) => row.to === address || row.address === address).length,
                })),
        })),
    }
}

export const buildAdminDisplayMail = (row, parsed) => {
    if (!row) return null
    const html = parsed?.html || (parsed?.messageIsHtml ? parsed?.message : '') || row.html || ''
    const text = parsed?.text || row.text || (!html ? row.body : '')
    const attachments = parsed?.attachments || row.attachments || []
    return {
        ...row,
        subject: parsed?.subject || row.subject,
        sender: parsed?.source || row.sender,
        html,
        text,
        message: parsed?.message || html || text || row.body || '',
        messageIsHtml: !!(parsed?.messageIsHtml || html),
        attachments,
        attachmentCount: attachments.length || row.attachmentCount,
        attachmentLabel: formatAttachmentCount(attachments.length || row.attachmentCount),
        parseFailed: !!parsed?.parseFailed || row.parseStatus === 'failed',
    }
}

export const buildAdminRendererMail = (row, renderMode) => row ? ({
    id: row.sourceId || row.id,
    subject: row.subject,
    source: row.sender,
    address: row.to,
    created_at: row.created_at || row.fullTime || row.time,
    message: row.message || row.html || row.text || row.body || '',
    messageIsHtml: !!row.messageIsHtml,
    text: renderMode === 'html' ? '' : (row.text || (!row.html ? row.body : '')),
    raw: row.raw || '',
    attachments: row.attachments || [],
    metadata: row.metadata || {},
    parseFailed: row.parseFailed || row.parseStatus === 'failed',
}) : null

export const buildAdminMailRail = (mail) => {
    if (!mail) {
        return {
            title: t('selectMail'),
            subtitle: '',
            tags: [],
            empty: true,
        }
    }
    return {
        title: t('mailDetail'),
        subtitle: mail.subject,
        tags: [
            mail.unread ? t('unread') : t('read'),
            mail.messageIsHtml ? t('htmlSandboxed') : mail.risk,
            mail.attachmentLabel,
        ].filter(Boolean),
        kv: [
            [t('fieldSender'), mail.sender],
            [t('fieldRecipient'), mail.to],
            [t('fieldReceivedAt'), mail.fullTime || mail.time],
            [t('fieldAuth'), mail.auth],
            [t('fieldSource'), mail.ip],
            [t('fieldAttachments'), mail.attachmentLabel],
            [t('fieldRender'), mail.messageIsHtml ? t('htmlSandboxed') : mail.risk, 'status'],
        ],
        body: mail.body,
        mail,
        actions: [
            { label: t('delete'), action: 'delete-current', danger: true },
        ],
    }
}

export const useAdminMailFlow = ({
    getMails,
    getUnknownMails,
    ui,
    activeView,
    parseItem,
    resetListScroll,
    syncRoute,
    replaceRouteQuery,
    persistView,
    selectMail,
    onSelectionMissing,
    onParseError,
}) => {
    const mailRows = computed(() => normalizeAdminMailRows(getMails()))
    const unknownRows = computed(() => normalizeUnknownMailRows(getUnknownMails()))
    const filterRows = (rows) => filterAdminRows(rows, ui, activeView.value)
    const filteredMailRows = computed(() => filterRows(mailRows.value))
    const filteredUnknownRows = computed(() => filterRows(unknownRows.value))
    const currentMail = computed(() => mailRows.value.find((row) => row.id === ui.selected.flow) || null)
    const currentMailIndex = computed(() => filteredMailRows.value.findIndex((row) => row.id === ui.selected.flow))
    const canGoPrevMail = computed(() => currentMailIndex.value > 0)
    const canGoNextMail = computed(() => (
        currentMailIndex.value >= 0 && currentMailIndex.value < filteredMailRows.value.length - 1
    ))
    const parsedMailCache = reactive({})
    const parsedMailPending = ref('')

    const parseAdminMailDetail = async (row) => {
        const key = adminMailCacheKey(row)
        if (!key || !row?.raw || parsedMailCache[key] || parsedMailPending.value === key) return
        parsedMailPending.value = key
        try {
            parsedMailCache[key] = await parseItem({
                id: row.sourceId || row.id,
                raw: row.raw,
                source: row.sender,
                address: row.to,
                subject: row.subject,
                created_at: row.created_at || row.fullTime || row.time,
                attachments: row.attachments || [],
                metadata: row.metadata || {},
            })
        } catch (error) {
            onParseError(error)
        } finally {
            if (parsedMailPending.value === key) parsedMailPending.value = ''
        }
    }

    const currentParsedMail = computed(() => parsedMailCache[adminMailCacheKey(currentMail.value)] || null)
    const currentDisplayMail = computed(() => buildAdminDisplayMail(currentMail.value, currentParsedMail.value))
    const currentRendererMail = computed(() => buildAdminRendererMail(currentDisplayMail.value, ui.mailRenderMode))

    const setMailStatus = (status) => {
        ui.status = status
        ui.flowMode = 'list'
        resetListScroll()
        syncRoute({ status: status === 'all' ? undefined : status, mode: undefined })
    }
    const setMailDomain = (domain) => {
        ui.domain = domain || 'all'
        ui.address = 'all'
        ui.flowMode = 'list'
        resetListScroll()
        syncRoute({ domain: ui.domain === 'all' ? undefined : ui.domain, address: undefined, mode: undefined })
    }
    const setMailAddress = (address) => {
        ui.address = address || 'all'
        ui.domain = address && address !== 'all' ? getDomain(address) || ui.domain : ui.domain
        ui.flowMode = 'list'
        resetListScroll()
        syncRoute({
            address: ui.address === 'all' ? undefined : ui.address,
            domain: ui.domain === 'all' ? undefined : ui.domain,
            mode: undefined,
        })
    }
    const updateMailSearch = () => {
        resetListScroll()
        syncRoute({ q: ui.query || undefined })
    }
    const selectAdjacentMail = (step) => {
        const index = currentMailIndex.value
        if (index < 0) return
        const next = filteredMailRows.value[index + step]
        if (next) selectMail(next.id)
    }
    const closeMailDetail = () => {
        ui.flowMode = 'list'
        ui.detailKind = ''
        ui.selected.flow = ''
        replaceRouteQuery({ mode: undefined, mailId: undefined }, ['item'])
    }
    const openMailFromAddress = (address) => {
        if (!address) return
        ui.view = 'flow'
        ui.domain = getDomain(address) || 'all'
        ui.address = address
        ui.status = 'all'
        ui.flowMode = 'list'
        persistView('flow')
        syncRoute({ address, domain: ui.domain === 'all' ? undefined : ui.domain, status: undefined, mode: undefined })
    }
    const openMailFromDomain = (domain) => {
        if (!domain) return
        ui.view = 'flow'
        ui.domain = domain
        ui.address = 'all'
        ui.status = 'all'
        ui.flowMode = 'list'
        persistView('flow')
        syncRoute({ domain, address: undefined, status: undefined, mode: undefined })
    }

    watch(mailRows, (rows) => {
        if (!rows.length) {
            ui.selected.flow = ''
            return
        }
        if (ui.selected.flow && !rows.some((row) => row.id === ui.selected.flow)) {
            ui.selected.flow = ''
            ui.detailKind = ''
            onSelectionMissing()
        }
    }, { immediate: true })
    watch(currentMail, (row) => {
        if (row) parseAdminMailDetail(row)
    }, { immediate: true })
    watch(currentParsedMail, (mail) => {
        if (mail?.messageIsHtml && ui.mailRenderMode !== 'raw') ui.mailRenderMode = 'html'
    })

    return {
        canGoNextMail,
        canGoPrevMail,
        closeMailDetail,
        currentDisplayMail,
        currentMail,
        currentParsedMail,
        currentRendererMail,
        filterRows,
        filteredMailRows,
        filteredUnknownRows,
        mailRows,
        openMailFromAddress,
        openMailFromDomain,
        parseAdminMailDetail,
        selectAdjacentMail,
        setMailAddress,
        setMailDomain,
        setMailStatus,
        unknownRows,
        updateMailSearch,
    }
}
