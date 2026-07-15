export const queryValue = (value, fallback = '') => {
    const text = Array.isArray(value) ? value[0] : value
    return text == null || text === '' ? fallback : String(text)
}

export const clampNumber = (value, min, max) => Math.min(max, Math.max(min, value))

export const getDomain = (value) => {
    const text = String(value || '')
    const at = text.lastIndexOf('@')
    return at >= 0 ? text.slice(at + 1).toLowerCase() : ''
}

export const modeLabel = (mode) => {
    const labels = {
        cloudflare_email: 'Cloudflare Email Routing',
        improvmx_forward: 'ImprovMX free forwarding',
        external_webhook: 'External webhook',
        manual: 'Manual',
    }
    return labels[mode] || mode || '-'
}

export const setupLabel = (status) => {
    const labels = {
        active: '已验证',
        pending_verification: '需验证',
        draft: '草稿',
        error: '失败',
        disabled: '停用',
    }
    return labels[status] || status || '需复核'
}

export const statusClass = (value) => {
    const text = String(value || '')
    if (/失败|撤销|异常|删除|危险|阻止|未知地址|停用|关闭|denied|failed|revoked/i.test(text)) return 'danger'
    if (/待|需|观察|警告|复核|灰度|规划|巡检|设计|pending|draft|expired|skipped/i.test(text)) return 'warn'
    if (/可用|启用|活跃|成功|已保存|已验证|正常|通过|默认|active|success|ok/i.test(text)) return 'ok'
    return 'neutral'
}

export const cellText = (row, key) => row?.[key] == null || row?.[key] === '' ? '-' : row[key]

export const formatNumber = (value) => Number(value || 0).toLocaleString('zh-CN')
export const formatBadgeCount = (value) => Number(value || 0) > 99 ? '99+' : formatNumber(value)

export const formatDate = (value) => {
    if (!value) return '-'
    return String(value).replace('T', ' ').replace(/\.\d+Z?$/, '').replace(/Z$/, '')
}

export const formatShortDate = (value) => {
    const full = formatDate(value)
    if (full === '-') return full
    const match = full.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2})(?::\d{2})?/)
    if (match) return `${match[2]}-${match[3]} ${match[4]}`
    return full
}

export const extractHeader = (raw, name) => {
    if (!raw) return ''
    const match = String(raw).match(new RegExp(`^${name}:\\s*(.+)$`, 'im'))
    return match?.[1]?.trim() || ''
}

export const stripHtml = (html) => String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")

export const compactText = (value, fallback = '') => {
    const text = String(value || '')
        .replace(/\r/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim()
    return text || fallback
}

export const compactRaw = (raw) => {
    const text = String(raw || '')
        .replace(/\r/g, '')
        .split('\n\n')
        .slice(1)
        .join('\n\n')
        .replace(/\s+/g, ' ')
        .trim()
    return text ? text.slice(0, 240) : '邮件正文会在详情页通过安全渲染策略呈现。'
}

export const normalizedAttachments = (value) => {
    if (Array.isArray(value)) return value
    if (Number.isFinite(Number(value)) && Number(value) > 0) {
        return Array.from({ length: Number(value) }, (_, index) => ({
            filename: `attachment-${index + 1}`,
            size: 0,
        }))
    }
    return []
}

export const formatAttachmentCount = (value) => {
    const count = Number(value || 0)
    return count > 0 ? `${count} 个附件` : '无附件'
}

export const mailRenderLabel = (row) => {
    if (row?.html) return 'HTML 已隔离渲染'
    if (row?.text) return '纯文本'
    if (row?.parseStatus === 'parsed') return '已解析'
    return '仅原始邮件'
}

export const adminMailCacheKey = (row) => row?.sourceId ? String(row.sourceId) : row?.id || ''

export const formatAddressCredential = (address, jwt, password = '', origin = '') => [
    `地址: ${address}`,
    jwt ? `JWT: ${jwt}` : '',
    jwt ? `登录链接: ${origin}/?jwt=${encodeURIComponent(jwt)}` : '',
    password ? `地址密码: ${password}` : '',
].filter(Boolean).join('\n')

export const toD1DateTime = (value) => {
    const normalized = String(value || '').trim().replace('T', ' ')
    if (!normalized) return null
    return normalized.length === 16 ? `${normalized}:00` : normalized
}
