/** @vitest-environment jsdom */

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

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
        expect(shadow.innerHTML).not.toContain('src="https://')
        expect(shadow.innerHTML).not.toContain('url(http://')
        expect(shadow.innerHTML).toContain('data-removed-remote-media')
        expect(shadow.innerHTML).toContain('data-removed-unsafe-style')
        expect(shadow.innerHTML).toContain('src="data:image/png;base64,AA=="')
        expect(shadow.innerHTML).toContain('href="https://safe.example"')
        expect(shadow.innerHTML).toContain('rel="noopener noreferrer nofollow"')
        expect(shadow.innerHTML).toContain('max-width: 100%')
        wrapper.unmount()
    })
})
