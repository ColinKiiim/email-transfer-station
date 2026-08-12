import DOMPurify from 'dompurify'

const RICH_TEXT_TAGS = [
    'a', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'h4',
    'i', 'li', 'ol', 'p', 'pre', 's', 'small', 'span', 'strong', 'sub', 'sup',
    'u', 'ul',
]
const RICH_TEXT_ATTRIBUTES = ['href', 'title']

const OAUTH_SVG_TAGS = [
    'svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'title',
]
const OAUTH_SVG_ATTRIBUTES = [
    'aria-hidden', 'cx', 'cy', 'd', 'fill', 'fill-rule', 'focusable', 'height', 'points',
    'r', 'role', 'rx', 'ry', 'stroke', 'stroke-linecap', 'stroke-linejoin', 'stroke-width',
    'viewBox', 'width', 'x', 'x1', 'x2', 'xmlns', 'y', 'y1', 'y2',
]

const MAIL_TAGS = [
    'a', 'abbr', 'address', 'article', 'aside', 'b', 'bdi', 'bdo', 'blockquote', 'br',
    'caption', 'center', 'cite', 'code', 'col', 'colgroup', 'dd', 'del', 'div', 'dl',
    'dt', 'em', 'figcaption', 'figure', 'font', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'hr', 'i', 'img', 'ins', 'kbd', 'li', 'main', 'mark', 'ol', 'p', 'picture', 'pre', 'q', 's',
    'samp', 'section', 'small', 'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td',
    'tfoot', 'th', 'thead', 'tr', 'tt', 'u', 'ul', 'var', 'source',
]
const MAIL_ATTRIBUTES = [
    'align', 'alt', 'aria-label', 'border', 'cellpadding', 'cellspacing', 'colspan',
    'data-removed-remote-media', 'data-removed-unsafe-style', 'dir', 'height', 'href',
    'lang', 'loading', 'media', 'referrerpolicy', 'rel', 'role', 'rowspan', 'sizes',
    'src', 'srcset', 'style', 'target', 'title', 'type', 'valign', 'width',
]

const ALLOWED_URI = /^(?:(?:https?|mailto|tel|blob):|data:image\/|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
const SAFE_LINK = /^(?:https?:\/\/|mailto:|tel:)/i
const SAFE_EMBEDDED_MEDIA = /^(?:blob:https?:\/\/|data:image\/(?:avif|bmp|gif|jpe?g|png|webp);base64,)/i
const HTTPS_UPGRADE_IMAGE_HOSTS = new Set(['cdn.mcauto-images-production.sendgrid.net'])
const CSS_FETCH_OR_EXECUTION = /(?:url\s*\(|@import|expression\s*\(|-moz-binding)/i
const SAFE_SVG_PAINT = /^(?:none|currentcolor|transparent|#[0-9a-f]{3,8}|(?:rgb|hsl)a?\(\s*[-+0-9.% ,/]+\)|[a-z]+)$/i
const SAFE_STYLE_PROPERTIES = new Set([
    'background-color', 'border', 'border-bottom', 'border-bottom-color',
    'border-bottom-style', 'border-bottom-width', 'border-collapse', 'border-color',
    'border-left', 'border-left-color', 'border-left-style', 'border-left-width',
    'border-radius', 'border-right', 'border-right-color', 'border-right-style',
    'border-right-width', 'border-spacing', 'border-style', 'border-top',
    'border-top-color', 'border-top-style', 'border-top-width', 'border-width',
    'box-sizing', 'clear', 'color', 'display', 'float', 'font', 'font-family',
    'font-size', 'font-style', 'font-variant', 'font-weight', 'height', 'letter-spacing',
    'line-height', 'list-style-type', 'margin', 'margin-bottom', 'margin-left',
    'margin-right', 'margin-top', 'max-height', 'max-width', 'min-height', 'min-width',
    'object-fit', 'overflow', 'overflow-wrap', 'overflow-x', 'overflow-y', 'padding',
    'padding-bottom', 'padding-left', 'padding-right', 'padding-top', 'table-layout',
    'text-align', 'text-decoration', 'text-indent', 'text-transform', 'vertical-align',
    'white-space', 'width', 'word-break', 'word-spacing',
])

const toTemplate = (html) => {
    if (typeof document === 'undefined') return null
    const template = document.createElement('template')
    template.innerHTML = html
    return template
}

const normalizeRemoteImageUrl = (value) => {
    try {
        const url = new URL(String(value || '').trim())
        if (url.protocol === 'http:' && HTTPS_UPGRADE_IMAGE_HOSTS.has(url.hostname)
            && !url.username && !url.password && (!url.port || url.port === '80')) {
            url.protocol = 'https:'
            url.port = ''
        }
        return url.protocol === 'https:' ? url.href : ''
    } catch {
        return ''
    }
}

const normalizeRemoteImageSrcset = (value) => String(value || '')
    .split(',')
    .map((candidate) => {
        const [source, descriptor, ...rest] = candidate.trim().split(/\s+/)
        const normalized = normalizeRemoteImageUrl(source)
        if (!normalized || rest.length || (descriptor && !/^(?:\d+(?:\.\d+)?x|\d+w)$/.test(descriptor))) return ''
        return descriptor ? `${normalized} ${descriptor}` : normalized
    })
    .filter(Boolean)
    .join(', ')

const hardenLinks = (template) => {
    template.content.querySelectorAll('a').forEach((link) => {
        const href = link.getAttribute('href')?.trim() || ''
        if (!SAFE_LINK.test(href)) {
            link.removeAttribute('href')
            link.removeAttribute('target')
            link.removeAttribute('rel')
            link.removeAttribute('referrerpolicy')
            return
        }
        link.setAttribute('target', '_blank')
        link.setAttribute('rel', 'noopener noreferrer nofollow')
        link.setAttribute('referrerpolicy', 'no-referrer')
    })
}

const serializeWithHardenedLinks = (html) => {
    const template = toTemplate(html)
    if (!template) return ''
    hardenLinks(template)
    return template.innerHTML
}

const sanitizeInlineStyle = (element) => {
    const rawStyle = element.getAttribute('style') || ''
    const parsed = document.createElement('span')
    const safe = document.createElement('span')
    parsed.setAttribute('style', rawStyle)
    let removed = parsed.style.length === 0 && rawStyle.trim().length > 0

    for (const property of Array.from(parsed.style)) {
        const value = parsed.style.getPropertyValue(property)
        if (!SAFE_STYLE_PROPERTIES.has(property) || CSS_FETCH_OR_EXECUTION.test(value)) {
            removed = true
            continue
        }
        safe.style.setProperty(property, value)
    }

    const safeStyle = safe.getAttribute('style')
    if (safeStyle) element.setAttribute('style', safeStyle)
    else element.removeAttribute('style')
    if (removed) element.setAttribute('data-removed-unsafe-style', 'style')
}

export const sanitizeRichText = (value) => serializeWithHardenedLinks(DOMPurify.sanitize(
    String(value || ''),
    {
        ALLOWED_TAGS: RICH_TEXT_TAGS,
        ALLOWED_ATTR: RICH_TEXT_ATTRIBUTES,
        ALLOWED_URI_REGEXP: ALLOWED_URI,
        ALLOW_ARIA_ATTR: false,
        ALLOW_DATA_ATTR: false,
    },
))

export const sanitizeOAuthIcon = (value) => {
    const sanitized = DOMPurify.sanitize(String(value || ''), {
        ALLOWED_TAGS: OAUTH_SVG_TAGS,
        ALLOWED_ATTR: OAUTH_SVG_ATTRIBUTES,
        ALLOW_ARIA_ATTR: false,
        ALLOW_DATA_ATTR: false,
    })
    const template = toTemplate(sanitized)
    if (!template) return ''
    template.content.querySelectorAll('[fill], [stroke]').forEach((element) => {
        for (const attribute of ['fill', 'stroke']) {
            if (!SAFE_SVG_PAINT.test(element.getAttribute(attribute) || '')) {
                element.removeAttribute(attribute)
            }
        }
    })
    return template.innerHTML
}

export const sanitizeMailHtml = (value) => {
    const sanitized = DOMPurify.sanitize(String(value || ''), {
        ALLOWED_TAGS: MAIL_TAGS,
        ALLOWED_ATTR: MAIL_ATTRIBUTES,
        ALLOWED_URI_REGEXP: ALLOWED_URI,
        ALLOW_ARIA_ATTR: false,
        ALLOW_DATA_ATTR: false,
    })
    const template = toTemplate(sanitized)
    if (!template) return ''

    template.content.querySelectorAll('img').forEach((image) => {
        let hasRemoteSource = false
        const source = image.getAttribute('src')?.trim() || ''
        if (source && !SAFE_EMBEDDED_MEDIA.test(source)) {
            const normalized = normalizeRemoteImageUrl(source)
            if (normalized) {
                image.setAttribute('src', normalized)
                hasRemoteSource = true
            } else {
                image.removeAttribute('src')
                image.setAttribute('data-removed-remote-media', 'src')
            }
        }
        if (image.hasAttribute('srcset')) {
            const srcset = normalizeRemoteImageSrcset(image.getAttribute('srcset'))
            if (srcset) {
                image.setAttribute('srcset', srcset)
                hasRemoteSource = true
            } else {
                image.removeAttribute('srcset')
                image.setAttribute('data-removed-remote-media', 'srcset')
            }
        }
        if (hasRemoteSource) {
            image.setAttribute('referrerpolicy', 'no-referrer')
            image.setAttribute('loading', 'lazy')
        }
    })
    template.content.querySelectorAll('source').forEach((source) => {
        const picture = source.closest('picture')
        if (!picture) {
            source.remove()
            return
        }
        const srcset = normalizeRemoteImageSrcset(source.getAttribute('srcset'))
        source.removeAttribute('src')
        if (srcset) source.setAttribute('srcset', srcset)
        else {
            source.removeAttribute('srcset')
            source.setAttribute('data-removed-remote-media', 'srcset')
        }
        const image = picture.querySelector('img')
        if (srcset && image) {
            image.setAttribute('referrerpolicy', 'no-referrer')
            image.setAttribute('loading', 'lazy')
        }
    })
    template.content.querySelectorAll('[style]').forEach((element) => {
        sanitizeInlineStyle(element)
    })
    hardenLinks(template)
    return template.innerHTML
}
