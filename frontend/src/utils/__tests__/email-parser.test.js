/** @vitest-environment jsdom */

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ShadowHtmlComponent from '../../components/ShadowHtmlComponent.vue'
import { processItem, revokeMailObjectUrls } from '../email-parser'

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
