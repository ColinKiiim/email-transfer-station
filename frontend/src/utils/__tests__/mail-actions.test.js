/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest'

import { buildForwardModel, buildReplyModel } from '../mail-actions'

describe('reply and forward mail HTML boundary', () => {
    const maliciousMail = {
        source: 'Attacker <attacker@example.test>',
        subject: 'unsafe content',
        message: [
            '<p>kept body</p>',
            '<script>alert(1)</script>',
            '<img src="https://tracker.example/pixel" onerror="alert(2)">',
            '<a href="javascript:alert(3)">bad</a>',
            '<a href="https://safe.example">safe</a>',
        ].join(''),
    }

    it('copies only sanitized received HTML into a reply', () => {
        const reply = buildReplyModel(maliciousMail, 'Reply')

        expect(reply.toName).toBe('Attacker')
        expect(reply.toMail).toBe('attacker@example.test')
        expect(reply.content).toContain('<p>kept body</p>')
        expect(reply.content).toContain('data-removed-remote-media="src"')
        expect(reply.content).toContain('rel="noopener noreferrer nofollow"')
        expect(reply.content).not.toMatch(/<script|onerror|javascript:|\ssrc="https:\/\//i)
    })

    it('copies only sanitized received HTML into a forward', () => {
        const forward = buildForwardModel(maliciousMail, 'Forward')

        expect(forward.contentType).toBe('html')
        expect(forward.content).toContain('<p>kept body</p>')
        expect(forward.content).not.toMatch(/<script|onerror|javascript:|\ssrc="https:\/\//i)
    })

    it('HTML-escapes received plain text before rich composition', () => {
        const reply = buildReplyModel({
            source: 'sender@example.test',
            subject: 'plain',
            text: '<img src=x onerror=alert(1)> & text',
        }, 'Reply')

        expect(reply.content).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; text')
        expect(reply.content).not.toContain('<img')
    })
})
