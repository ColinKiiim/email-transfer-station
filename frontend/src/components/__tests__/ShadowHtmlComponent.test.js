/** @vitest-environment jsdom */

import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import ShadowHtmlComponent from '../ShadowHtmlComponent.vue'

describe('ShadowHtmlComponent mail safety boundary', () => {
    it('sanitizes active content and strips insecure media before isolated rendering', () => {
        const wrapper = mount(ShadowHtmlComponent, {
            props: {
                htmlContent: [
                    '<script>window.compromised = true</script>',
                    '<img src="http://tracker.example/pixel" onerror="window.compromised = true">',
                    '<img src="https://tracker.example/secure-pixel">',
                    '<img src="data:image/png;base64,AA==">',
                    '<div style="background:url(http://tracker.example/bg)">body</div>',
                    '<a href="https://safe.example">safe link</a>',
                ].join(''),
            },
        })

        const shadow = wrapper.get('div').element.shadowRoot
        expect(shadow).not.toBeNull()
        expect(shadow.innerHTML).not.toContain('<script')
        expect(shadow.innerHTML).not.toContain('onerror')
        expect(shadow.innerHTML).not.toContain('src="http://')
        const remoteImage = shadow.querySelector('img[data-remote-src]')
        expect(remoteImage?.getAttribute('src')).toBeNull()
        expect(remoteImage?.getAttribute('data-remote-src')).toBe('https://tracker.example/secure-pixel')
        expect(shadow.innerHTML).not.toContain('url(http://')
        expect(shadow.innerHTML).toContain('data-removed-remote-media')
        expect(shadow.innerHTML).toContain('data-removed-unsafe-style')
        expect(shadow.innerHTML).toContain('src="data:image/png;base64,AA=="')
        expect(shadow.innerHTML).toContain('href="https://safe.example"')
        expect(shadow.innerHTML).toContain('rel="noopener noreferrer nofollow"')
        expect(shadow.innerHTML).toContain('max-width: 100%')
        wrapper.unmount()
    })

    it('restores remote images only when the current renderer opts in', async () => {
        const wrapper = mount(ShadowHtmlComponent, {
            props: {
                htmlContent: '<img alt="logo" src="https://cdn.example.test/logo.png"><script>alert(1)</script>',
            },
        })
        const shadow = wrapper.get('div').element.shadowRoot
        expect(shadow.querySelector('img')?.getAttribute('src')).toBeNull()

        await wrapper.setProps({ allowRemoteImages: true })
        const image = shadow.querySelector('img')
        expect(image?.getAttribute('src')).toBe('https://cdn.example.test/logo.png')
        expect(image?.getAttribute('referrerpolicy')).toBe('no-referrer')
        expect(image?.getAttribute('loading')).toBe('lazy')
        expect(shadow.innerHTML).not.toContain('<script')
        wrapper.unmount()
    })

    it('uses the same opt-in content in the fallback renderer', async () => {
        const attachShadow = vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(() => {
            throw new Error('unsupported')
        })
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        const wrapper = mount(ShadowHtmlComponent, {
            props: {
                allowRemoteImages: true,
                htmlContent: '<img alt="logo" src="https://cdn.example.test/logo.png" onerror="alert(1)">',
            },
        })
        await nextTick()

        const image = wrapper.get('.fallback-mail-html').element.querySelector('img')
        expect(image?.getAttribute('src')).toBe('https://cdn.example.test/logo.png')
        expect(image?.getAttribute('referrerpolicy')).toBe('no-referrer')
        expect(wrapper.html()).not.toContain('onerror')
        wrapper.unmount()
        warn.mockRestore()
        attachShadow.mockRestore()
    })

    it('uses a light paper fallback without rewriting explicit email colors', () => {
        const wrapper = mount(ShadowHtmlComponent, {
            props: {
                isDark: true,
                htmlContent: [
                    '<div style="color:#000">transparent background</div>',
                    '<div style="background-color:#fff;color:#111">explicit light mail</div>',
                    '<div style="background-color:#202124;color:#fff">explicit dark mail</div>',
                ].join(''),
            },
        })

        const shadow = wrapper.get('div').element.shadowRoot
        const styles = [...shadow.querySelectorAll('style')].map((style) => style.textContent).join('\n')
        expect(styles).toContain('background-color: #fff')
        expect(styles).toContain('color: #202124')
        expect(shadow.innerHTML).toContain('transparent background')
        expect(shadow.innerHTML).toContain('background-color: rgb(255, 255, 255)')
        expect(shadow.innerHTML).toContain('background-color: rgb(32, 33, 36)')
        expect(shadow.innerHTML).toContain('color: rgb(255, 255, 255)')
        wrapper.unmount()
    })
})
