import PostalMime from 'postal-mime';

function humanFileSize(size) {
    const i = size === 0 ? 0 : Math.floor(Math.log(size) / Math.log(1024));
    return parseFloat((size / Math.pow(1024, i)).toFixed(2)) + ' ' + ['B', 'KB', 'MB', 'GB', 'TB'][i];
}

function isPlainTextOnly(raw) {
    const headerBlock = String(raw || '').split(/\r?\n\r?\n/, 1)[0] || '';
    const contentType = headerBlock.match(/^content-type:\s*([^;\r\n]+)/im)?.[1]?.trim().toLowerCase();
    return contentType === 'text/plain';
}

const COMMON_ENTITIES = {
    nbsp: ' ',
    zwnj: '',
    zwj: '',
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    copy: '©',
    reg: '®',
    trade: '™',
    ndash: '–',
    mdash: '—',
    bull: '•',
    hellip: '…',
    euro: '€',
    pound: '£',
    yen: '¥',
    cent: '¢',
    deg: '°',
    plusmn: '±',
    times: '×',
    divide: '÷',
    para: '¶',
    sect: '§',
    laquo: '«',
    raquo: '»',
    lsquo: "'",
    rsquo: "'",
    ldquo: '"',
    rdquo: '"',
};

function decodeHtmlEntities(str) {
    if (!str) return '';
    return str
        .replace(/&([a-zA-Z]+);/g, (match, name) => {
            const lower = name.toLowerCase();
            return Object.prototype.hasOwnProperty.call(COMMON_ENTITIES, lower)
                ? COMMON_ENTITIES[lower]
                : match;
        })
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
            try {
                const code = parseInt(hex, 16);
                if (code === 0x200c || code === 0x200d) return '';
                if (code === 0xa0) return ' ';
                return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
            } catch {
                return '';
            }
        })
        .replace(/&#(\d+);/g, (_, dec) => {
            try {
                const code = parseInt(dec, 10);
                if (code === 8204 || code === 8205) return '';
                if (code === 160) return ' ';
                if (code === 39) return "'";
                return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
            } catch {
                return '';
            }
        });
}

function stripZeroWidthAndControlChars(str) {
    if (!str) return '';
    return str
        .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, '')
        .replace(/\u00A0/g, ' ')
        // eslint-disable-next-line no-control-regex -- intentional C0/DEL control character sanitization for preview text
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ');
}

export function stripHtmlForPreview(value, maxLength = 180) {
    if (!value) return '';
    const withoutScriptsAndStyles = String(value)
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ');
    const withoutTags = withoutScriptsAndStyles.replace(/<[^>]*>/g, ' ');
    const decoded = decodeHtmlEntities(withoutTags);
    const cleaned = stripZeroWidthAndControlChars(decoded);
    const normalized = cleaned.replace(/\s+/g, ' ').trim();
    return typeof maxLength === 'number' && maxLength > 0
        ? normalized.slice(0, maxLength)
        : normalized;
}

export function formatSenderDisplay(value) {
    if (!value) return '';
    const text = String(value).trim();
    if (!text) return '';

    // RFC-5322 "Display Name" <address> or Display Name <address>
    const match = text.match(/^(.+?)\s*<([^>]+)>$/);
    if (match) {
        let name = match[1].trim();
        if ((name.startsWith('"') && name.endsWith('"')) || (name.startsWith("'") && name.endsWith("'"))) {
            name = name.slice(1, -1).trim();
        }
        if (name) {
            return name;
        }
        const addr = match[2].trim();
        if (addr) return addr;
    }

    // Bare angle bracket form: <address>
    const angleMatch = text.match(/^<([^>]+)>$/);
    if (angleMatch) {
        const addr = angleMatch[1].trim();
        if (addr) return addr;
    }

    return text;
}

function applyParsedContent(item, html, text, forcePlainText = false) {
    const htmlContent = forcePlainText ? '' : (html || '');
    const textContent = text || '';
    item.html = htmlContent;
    item.text = textContent;
    item.message = htmlContent || textContent || '';
    item.messageIsHtml = htmlContent.length > 0;
    item.parseFailed = false;
}

function applyParseFailure(item) {
    item.html = '';
    item.text = '';
    item.message = '';
    item.messageIsHtml = false;
    item.parseFailed = true;
}

export function revokeObjectUrl(url) {
    if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url);
}

export function revokeMailObjectUrls(mails) {
    for (const mail of Array.isArray(mails) ? mails : [mails]) {
        for (const attachment of mail?.attachments || []) revokeObjectUrl(attachment?.url);
    }
}

export async function processItem(item) {
    // Try to parse the email using mail-parser-wasm
    item.originalSource = item.source;
    item.messageIsHtml = false;
    item.parseFailed = false;
    try {
        const { parse_message } = await import('mail-parser-wasm');
        const parsedEmail = parse_message(item.raw);
        item.source = parsedEmail.sender || item.source;
        item.subject = parsedEmail.subject || '';
        applyParsedContent(item, parsedEmail.body_html, parsedEmail.text, isPlainTextOnly(item.raw));
        item.attachments = parsedEmail.attachments?.map((a_item) => {
            const blob = new Blob(
                [a_item.content],
                { type: a_item.content_type || 'application/octet-stream' }
            );
            const blob_url = URL.createObjectURL(blob);
            if (a_item.content_id && a_item.content_id.length > 0) {
                item.message = item.message.replace(`cid:${a_item.content_id}`, blob_url);
            }
            return {
                id: a_item.content_id || Math.random().toString(36).substring(2, 15),
                filename: a_item.filename || a_item.content_id || "",
                size: humanFileSize(a_item.content?.length || 0),
                url: blob_url,
                blob: blob
            }
        }) || [];
    } catch (error) {
        console.log('Error parsing email with mail-parser-wasm');
        console.error(error);
    }
    if (item.subject && item.subject.length > 0 && item.message && item.message.length > 0) {
        return item;
    }
    // Fallback to PostalMime
    revokeMailObjectUrls(item);
    try {
        const parsedEmail = await PostalMime.parse(item.raw);
        item.source = parsedEmail.from?.address || item.source;
        if (parsedEmail.from?.address && parsedEmail.from?.name) {
            item.source = `${parsedEmail.from.name} <${parsedEmail.from.address}>`;
        }
        item.subject = parsedEmail.subject || 'No Subject';
        applyParsedContent(item, parsedEmail.html, parsedEmail.text, isPlainTextOnly(item.raw));
        item.attachments = parsedEmail.attachments?.map((a_item) => {
            const blob = new Blob(
                [a_item.content],
                { type: a_item.mimeType || 'application/octet-stream' }
            );
            const blob_url = URL.createObjectURL(blob)
            if (a_item.contentId && a_item.contentId.length > 0) {
                item.message = item.message.replace(`cid:${a_item.contentId}`, blob_url);
            }
            return {
                id: a_item.contentId || Math.random().toString(36).substring(2, 15),
                filename: a_item.filename || a_item.contentId || "",
                size: humanFileSize(a_item.content?.length || 0),
                url: blob_url,
                blob: blob
            }
        }) || [];
        if (!item.message && item.attachments.length === 0) {
            applyParseFailure(item);
        }
    } catch (error) {
        console.log('Error parsing email with PostalMime');
        console.error(error);
        item.subject = 'No Subject';
        applyParseFailure(item);
    }
    return item;
}

export function getDownloadEmlUrl(raw) {
    return URL.createObjectURL(
        new Blob([raw], { type: 'text/plain' }
        ))
}
