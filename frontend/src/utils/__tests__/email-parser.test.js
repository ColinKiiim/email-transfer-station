/** @vitest-environment jsdom */

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ShadowHtmlComponent from '../../components/ShadowHtmlComponent.vue'
import { processItem, revokeMailObjectUrls, stripHtmlForPreview } from '../email-parser'

const badgeMail = `MIME-Version: 1.0\r
From: sender@example.test\r
Subject: Badge mail\r
Content-Type: multipart/related; boundary="badge-boundary"\r
\r
--badge-boundary\r
Content-Type: text/html; charset=utf-8\r
\r
<html><body>
<img alt="Get it on Google Play" src="http://cdn.mcauto-images-production.sendgrid.net/google-play.png">
<img alt="Download on the App Store" src="http://cdn.mcauto-images-production.sendgrid.net/app-store.png">
<img alt="MIME-owned logo" src="cid:mail-logo">
<img alt="unsafe HTTP" src="http://tracker.example/pixel.png">
<img alt="credentialed CDN URL" src="http://user@cdn.mcauto-images-production.sendgrid.net/pixel.png">
<img alt="non-default CDN port" src="http://cdn.mcauto-images-production.sendgrid.net:8080/pixel.png">
<img alt="unsafe SVG" src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=">
</body></html>\r
--badge-boundary\r
Content-Type: image/png\r
Content-ID: <mail-logo>\r
Content-Disposition: inline\r
Content-Transfer-Encoding: base64\r
\r
iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZK1sAAAAASUVORK5CYII=\r
--badge-boundary--\r
`

describe('mail parser inline media', () => {
    afterEach(() => {
        delete URL.createObjectURL
        delete URL.revokeObjectURL
        vi.restoreAllMocks()
    })

    it('upgrades the exact legacy badge CDN while keeping inline and unsafe media boundaries', async () => {
        let objectUrl = 0
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn(() => `blob:https://mail.example/${++objectUrl}`),
        })

        const mail = await processItem({ raw: badgeMail, source: '', id: 'badge-mail' })
        const wrapper = mount(ShadowHtmlComponent, { props: { htmlContent: mail.message } })
        const shadow = wrapper.get('div').element.shadowRoot
        const badges = [
            shadow.querySelector('img[alt="Get it on Google Play"]'),
            shadow.querySelector('img[alt="Download on the App Store"]'),
        ]

        expect(badges.map((image) => image?.getAttribute('src'))).toEqual([
            'https://cdn.mcauto-images-production.sendgrid.net/google-play.png',
            'https://cdn.mcauto-images-production.sendgrid.net/app-store.png',
        ])
        expect(badges.every((image) => !image?.hasAttribute('data-removed-remote-media'))).toBe(true)
        expect(shadow.querySelector('img[alt="MIME-owned logo"]')?.getAttribute('src'))
            .toBe('blob:https://mail.example/1')
        for (const alt of ['unsafe HTTP', 'credentialed CDN URL', 'non-default CDN port', 'unsafe SVG']) {
            const image = shadow.querySelector(`img[alt="${alt}"]`)
            expect(image?.getAttribute('src')).toBeNull()
            expect(image?.getAttribute('data-removed-remote-media')).toBe('src')
        }
        wrapper.unmount()
    })

    it('releases attachment Blob URLs when parsed mail is replaced', () => {
        const revokeObjectURL = vi.fn()
        Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })

        revokeMailObjectUrls([
            { attachments: [{ url: 'blob:https://mail.example/1' }, { url: 'https://cdn.example/image.png' }] },
            { attachments: [{ url: 'blob:https://mail.example/2' }] },
        ])

        expect(revokeObjectURL.mock.calls.map(([url]) => url)).toEqual([
            'blob:https://mail.example/1',
            'blob:https://mail.example/2',
        ])
    })
})

describe('stripHtmlForPreview', () => {
    it('decodes common HTML entities and strips zero-width/control formatting characters', () => {
        const raw = '<div style="display:none">&nbsp;&zwnj;&nbsp;&zwnj;&zwj;</div>' +
            '<p>Hello &amp; welcome to &ldquo;ETS&rdquo; &#128512;! &lt;email&gt; &quot;quote&quot; &#39;apostrophe&#39;.</p>'
        const preview = stripHtmlForPreview(raw)
        expect(preview).toBe('Hello & welcome to "ETS" 😀! <email> "quote" \'apostrophe\'.')
    })

    it('removes zero-width spaces and non-breaking spaces safely', () => {
        const raw = 'Special\u200BOffer\u200C: \uFEFF50%\u00A0Off\u200DToday'
        const preview = stripHtmlForPreview(raw)
        expect(preview).toBe('SpecialOffer: 50% OffToday')
    })

    it('strips script, style, and comments without leaking style rules into preview', () => {
        const raw = '<!-- Header comment --><style>body { background: red; }</style><script>alert(1)</script><p>Clean body text</p>'
        const preview = stripHtmlForPreview(raw)
        expect(preview).toBe('Clean body text')
    })

    it('bounds preview length and handles empty or falsy inputs', () => {
        expect(stripHtmlForPreview(null)).toBe('')
        expect(stripHtmlForPreview(undefined)).toBe('')
        expect(stripHtmlForPreview('')).toBe('')
        const longText = 'A'.repeat(300)
        expect(stripHtmlForPreview(longText, 50)).toBe('A'.repeat(50))
        expect(stripHtmlForPreview(longText).length).toBe(180)
    })

    it('preserves full message body in processItem while previewing cleanly', async () => {
        const mailRaw = `MIME-Version: 1.0\r
From: test@example.test\r
Subject: Entity test\r
Content-Type: text/html; charset=utf-8\r
\r
<html><body><div style="display:none">&nbsp;&zwnj;&nbsp;&zwnj;</div><p>Actual message body &amp; content</p></body></html>`
        const item = await processItem({ raw: mailRaw, source: '', id: 'entity-test' })
        // Full message body in item remains intact
        expect(item.message).toContain('&nbsp;&zwnj;')
        expect(item.message).toContain('&amp;')
        // Preview generated from it is cleaned and decoded
        const preview = stripHtmlForPreview(item.text || item.message || '', 180)
        expect(preview).toBe('Actual message body & content')
    })
})
