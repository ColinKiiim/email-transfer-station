/** Parse raw mail once and retain the result on the request context. */
export const parseMail = async (parsedEmailContext: ParsedEmailContext): Promise<{
    sender: string,
    subject: string,
    text: string,
    html: string,
    headers?: Record<string, string>[],
    attachments?: ParsedEmailAttachment[],
} | undefined> => {
    if (!parsedEmailContext?.rawEmail) return undefined
    if (parsedEmailContext.parsedEmail) return parsedEmailContext.parsedEmail

    try {
        const { default: PostalMime } = await import('postal-mime')
        const parsedEmail = await PostalMime.parse(parsedEmailContext.rawEmail)
        parsedEmailContext.parsedEmail = {
            sender: parsedEmail.from ? `${parsedEmail.from.name} <${parsedEmail.from.address}>` : '',
            subject: parsedEmail.subject || '',
            text: parsedEmail.text || '',
            html: parsedEmail.html || '',
            headers: parsedEmail.headers || [],
            attachments: (parsedEmail.attachments || []).map((att) => ({
                filename: att.filename || 'attachment',
                mimeType: att.mimeType || 'application/octet-stream',
                content: typeof att.content === 'string'
                    ? new TextEncoder().encode(att.content)
                    : Uint8Array.from(new Uint8Array(att.content)),
                disposition: att.disposition || 'attachment',
            })),
        }
        return parsedEmailContext.parsedEmail
    } catch (error) {
        console.error('Failed to parse email', error)
        return undefined
    }
}

