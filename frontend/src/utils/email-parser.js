import PostalMime from 'postal-mime';

function humanFileSize(size) {
    const i = size === 0 ? 0 : Math.floor(Math.log(size) / Math.log(1024));
    return parseFloat((size / Math.pow(1024, i)).toFixed(2)) + ' ' + ['B', 'KB', 'MB', 'GB', 'TB'][i];
}

function applyParsedContent(item, html, text) {
    const htmlContent = html || '';
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
        applyParsedContent(item, parsedEmail.body_html, parsedEmail.text);
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
    try {
        const parsedEmail = await PostalMime.parse(item.raw);
        item.source = parsedEmail.from?.address || item.source;
        if (parsedEmail.from?.address && parsedEmail.from?.name) {
            item.source = `${parsedEmail.from.name} <${parsedEmail.from.address}>`;
        }
        item.subject = parsedEmail.subject || 'No Subject';
        applyParsedContent(item, parsedEmail.html, parsedEmail.text);
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
