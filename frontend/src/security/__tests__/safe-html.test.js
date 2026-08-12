/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest'

import { restoreRemoteMailImages, sanitizeMailHtml, sanitizeOAuthIcon, sanitizeRichText } from '../safe-html'

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

    it('blocks active mail content and automatic remote fetches', () => {
        const output = sanitizeMailHtml([
            '<style>@import "https://tracker.example/style";</style>',
            '<script>alert(1)</script><form action="/api/delete"><button>go</button></form>',
            '<iframe src="https://tracker.example/frame"></iframe>',
            '<svg><g onload="alert(2)"></g></svg><math><mtext>math</mtext></math>',
            '<img alt="http" src="http://tracker.example/a">',
            '<img alt="https" src="https://tracker.example/b">',
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
        for (const alt of ['http', 'https', 'relative', 'protocol-relative', 'svg-data', 'bad-blob']) {
            const image = template.content.querySelector(`img[alt="${alt}"]`)
            expect(image?.getAttribute('src')).toBeNull()
            expect(image?.getAttribute('data-removed-remote-media')).toBe('src')
        }
        expect(template.content.querySelector('img[alt="https"]')?.getAttribute('data-remote-src'))
            .toBe('https://tracker.example/b')
        for (const alt of ['http', 'relative', 'protocol-relative', 'svg-data', 'bad-blob']) {
            expect(template.content.querySelector(`img[alt="${alt}"]`)?.getAttribute('data-remote-src')).toBeNull()
        }
        expect(output).toContain('src="data:image/png;base64,AA=="')
        expect(output).toContain('src="blob:https://app.example/id"')
        expect(output).toContain('<p style="color: red;">safe style</p>')
        expect(output.match(/data-removed-unsafe-style="style"/g)).toHaveLength(2)
        expect(output).toContain('<a>bad link</a>')
        expect(output).toContain('href="https://safe.example"')
        expect(output).toContain('rel="noopener noreferrer nofollow"')
        expect(sanitizeMailHtml(output)).toBe(output)
    })

    it('restores only inert HTTPS image sources after explicit opt-in', () => {
        const blocked = sanitizeMailHtml([
            '<img alt="safe" src="https://cdn.example.test/logo.png">',
            '<img alt="http" src="http://cdn.example.test/logo.png">',
            '<img alt="relative" src="/logo.png">',
            '<img alt="spoofed" data-remote-src="javascript:alert(1)">',
            '<img alt="data" src="data:image/png;base64,AA==">',
            '<script>alert(1)</script>',
        ].join(''))
        const restored = restoreRemoteMailImages(blocked)
        const template = document.createElement('template')
        template.innerHTML = restored

        const safe = template.content.querySelector('img[alt="safe"]')
        expect(safe?.getAttribute('src')).toBe('https://cdn.example.test/logo.png')
        expect(safe?.getAttribute('referrerpolicy')).toBe('no-referrer')
        expect(safe?.getAttribute('loading')).toBe('lazy')
        for (const alt of ['http', 'relative', 'spoofed']) {
            expect(template.content.querySelector(`img[alt="${alt}"]`)?.getAttribute('src')).toBeNull()
        }
        expect(template.content.querySelector('img[alt="data"]')?.getAttribute('src')).toBe('data:image/png;base64,AA==')
        expect(restored).not.toMatch(/<script|javascript:/i)
        expect(restoreRemoteMailImages(restored)).toBe(restored)
    })
})
