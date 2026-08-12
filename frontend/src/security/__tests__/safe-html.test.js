/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest'

import { sanitizeMailHtml, sanitizeOAuthIcon, sanitizeRichText } from '../safe-html'

describe('source-specific HTML safety contracts', () => {
    it('sanitizes operator-authored rich text', () => {
        const output = sanitizeRichText([
            '<h2 style="color:red" onclick="alert(1)">Notice</h2>',
            '<strong>maintenance</strong>',
            '<img src="https://tracker.example/pixel">',
            '<script>alert(2)</script>',
            '<a href="jav&#x61;script:alert(3)">bad</a>',
            '<a href="https://safe.example/path" target="_self">safe</a>',
        ].join(''))

        expect(output).toContain('<h2>Notice</h2>')
        expect(output).toContain('<strong>maintenance</strong>')
        expect(output).not.toMatch(/script|onclick|<img|style=|javascript:/i)
        expect(output).toContain('<a>bad</a>')
        expect(output).toContain('href="https://safe.example/path"')
        expect(output).toContain('target="_blank"')
        expect(output).toContain('rel="noopener noreferrer nofollow"')
        expect(output).toContain('referrerpolicy="no-referrer"')
    })

    it('keeps only static OAuth SVG geometry', () => {
        const output = sanitizeOAuthIcon([
            '<div>html</div>',
            '<svg viewBox="0 0 24 24" onload="alert(1)">',
            '<path d="M0 0h24v24z" fill="url(https://tracker.example/paint)" style="display:block" />',
            '<foreignObject><img src=x onerror="alert(2)"></foreignObject>',
            '<animate attributeName="x" from="0" to="10" />',
            '<a href="https://tracker.example"><circle cx="12" cy="12" r="4" /></a>',
            '</svg>',
        ].join(''))

        expect(output).toContain('<svg viewBox="0 0 24 24">')
        expect(output).toContain('<path d="M0 0h24v24z"></path>')
        expect(output).toContain('<circle cx="12" cy="12" r="4"></circle>')
        expect(output).not.toMatch(/<div|onload|style=|url\(|foreignObject|<img|<animate|<a|href=/i)
    })

    it('loads only normalized HTTPS mail images while blocking active content', () => {
        const output = sanitizeMailHtml([
            '<style>@import "https://tracker.example/style";</style>',
            '<script>alert(1)</script><form action="/api/delete"><button>go</button></form>',
            '<iframe src="https://tracker.example/frame"></iframe>',
            '<svg><g onload="alert(2)"></g></svg><math><mtext>math</mtext></math>',
            '<img alt="http" src="http://tracker.example/a">',
            '<img alt="https" src="https://tracker.example/b">',
            '<picture><source srcset="https://cdn.example.test/google-play.png 1x, https://cdn.example.test/google-play@2x.png 2x"><img alt="google-play" src="https://cdn.example.test/google-play.png"></picture>',
            '<img alt="app-store" srcset="https://cdn.example.test/app-store.png 1x, https://cdn.example.test/app-store@2x.png 2x">',
            '<img alt="mixed-srcset" srcset="http://tracker.example/bad.png 1x, https://cdn.example.test/safe.png 2x, /relative.png 3x, javascript:alert(1) 4x, data:image/svg+xml;base64,PHN2Zz4= 5x">',
            '<source srcset="https://tracker.example/orphan.png 1x">',
            '<img alt="relative" src="/tracking/pixel">',
            '<img alt="protocol-relative" src="//tracker.example/pixel">',
            '<img alt="svg-data" src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=">',
            '<img alt="bad-blob" src="blob:javascript:alert(3)">',
            '<img alt="data" src="data:image/png;base64,AA==">',
            '<img alt="blob" src="blob:https://app.example/id">',
            '<p style="color:red">safe style</p>',
            '<p style="background:url(https://tracker.example/bg)">unsafe style</p>',
            String.raw`<p style="background:\75rl(https://tracker.example/escaped)">escaped style</p>`,
            '<a href="javascript:alert(2)">bad link</a>',
            '<a href="https://safe.example">safe link</a>',
        ].join(''))

        expect(output).not.toMatch(/<style|<script|<form|<button|<iframe|<svg|<math|javascript:/i)
        const template = document.createElement('template')
        template.innerHTML = output
        for (const alt of ['http', 'relative', 'protocol-relative', 'svg-data', 'bad-blob']) {
            const image = template.content.querySelector(`img[alt="${alt}"]`)
            expect(image?.getAttribute('src')).toBeNull()
            expect(image?.getAttribute('data-removed-remote-media')).toBe('src')
        }
        const httpsImage = template.content.querySelector('img[alt="https"]')
        expect(httpsImage?.getAttribute('src')).toBe('https://tracker.example/b')
        expect(httpsImage?.getAttribute('referrerpolicy')).toBe('no-referrer')
        expect(httpsImage?.getAttribute('loading')).toBe('lazy')
        expect(template.content.querySelector('picture source')?.getAttribute('srcset')).toBe(
            'https://cdn.example.test/google-play.png 1x, https://cdn.example.test/google-play@2x.png 2x',
        )
        expect(template.content.querySelector('img[alt="app-store"]')?.getAttribute('srcset')).toBe(
            'https://cdn.example.test/app-store.png 1x, https://cdn.example.test/app-store@2x.png 2x',
        )
        expect(template.content.querySelector('img[alt="mixed-srcset"]')?.getAttribute('srcset'))
            .toBe('https://cdn.example.test/safe.png 2x')
        expect(output).not.toContain('orphan.png')
        expect(output).not.toContain('data-remote-src')
        expect(output).toContain('src="data:image/png;base64,AA=="')
        expect(output).toContain('src="blob:https://app.example/id"')
        expect(output).toContain('<p style="color: red;">safe style</p>')
        expect(output.match(/data-removed-unsafe-style="style"/g)).toHaveLength(2)
        expect(output).toContain('<a>bad link</a>')
        expect(output).toContain('href="https://safe.example"')
        expect(output).toContain('rel="noopener noreferrer nofollow"')
        expect(sanitizeMailHtml(output)).toBe(output)
    })

})
