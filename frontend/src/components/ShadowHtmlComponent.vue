<template>
    <div v-if="useFallback" class="fallback-mail-html" v-html="safeHtml"></div>
    <div v-else ref="shadowHost"></div>
</template>

<script setup>
import DOMPurify from 'dompurify';
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps({
    htmlContent: {
        type: String,
        required: true,
    },
    isDark: {
        type: Boolean,
        default: false,
    },
});

const shadowHost = ref(null);
let shadowRoot = null;
const useFallback = ref(false);

const removeInsecureMedia = (html) => {
    if (typeof document === 'undefined') return html;
    const template = document.createElement('template');
    template.innerHTML = html;
    template.content.querySelectorAll('[src], [srcset], [poster], [style]').forEach((element) => {
        for (const attr of ['src', 'poster']) {
            const value = element.getAttribute(attr);
            if (value && /^http:\/\//i.test(value.trim())) {
                element.removeAttribute(attr);
                element.setAttribute('data-removed-insecure-media', attr);
            }
        }
        const srcset = element.getAttribute('srcset');
        if (srcset && /(^|,\s*)http:\/\//i.test(srcset)) {
            element.removeAttribute('srcset');
            element.setAttribute('data-removed-insecure-media', 'srcset');
        }
        const style = element.getAttribute('style');
        if (style && /url\(\s*['"]?http:\/\//i.test(style)) {
            element.removeAttribute('style');
            element.setAttribute('data-removed-insecure-media', 'style');
        }
    });
    return template.innerHTML;
};

const safeHtml = computed(() => removeInsecureMedia(DOMPurify.sanitize(String(props.htmlContent || ''), {
    ADD_ATTR: ['target', 'rel'],
})));

const mailRenderGuardStyle = `<style>
    :host {
        display: block;
        min-width: 0;
        max-width: 100%;
        overflow-wrap: break-word;
    }
    *, *::before, *::after {
        box-sizing: border-box;
    }
    img {
        max-width: 100% !important;
        height: auto !important;
        object-fit: contain !important;
    }
    table {
        max-width: 100% !important;
    }
    pre, code {
        white-space: pre-wrap;
        overflow-wrap: break-word;
    }
    a {
        max-width: 100%;
        overflow-wrap: break-word;
        word-break: normal;
    }
</style>`;

/**
 * Renders content into Shadow DOM with fallback to v-html
 */
const renderShadowDom = () => {
    if (!shadowHost.value && !useFallback.value) return;

    try {
        // Don't attempt to use Shadow DOM if already in fallback mode
        if (useFallback.value) return;

        // Initialize Shadow DOM if not already created
        if (!shadowRoot && shadowHost.value) {
            try {
                shadowRoot = shadowHost.value.attachShadow({ mode: 'open' });
            } catch (error) {
                console.warn('Shadow DOM not supported, falling back to v-html:', error);
                useFallback.value = true;
                return;
            }
        }

        // Update content if Shadow DOM exists
        if (shadowRoot) {
            const darkModeStyle = props.isDark
                ? `<style>
                    :host { color: #e0e0e0; }
                    a { color: #A8C7FA; }
                   </style>`
                : '';
            shadowRoot.innerHTML = safeHtml.value + mailRenderGuardStyle + darkModeStyle;
        }
    } catch (error) {
        console.error('Failed to render Shadow DOM, falling back to v-html:', error);
        useFallback.value = true;
    }
};

// Initial render when component is mounted
onMounted(() => {
    // Check if Shadow DOM is supported in this browser
    if (typeof Element.prototype.attachShadow !== 'function') {
        console.warn('Shadow DOM is not supported in this browser, using v-html fallback');
        useFallback.value = true;
        return;
    }

    renderShadowDom();
});

// Clean up resources when component is unmounted
onBeforeUnmount(() => {
    if (shadowRoot) {
        shadowRoot.innerHTML = '';
    }
    shadowRoot = null;
});

// Update Shadow DOM when htmlContent or dark mode changes
watch(() => [safeHtml.value, props.isDark], () => {
    renderShadowDom();
}, { flush: 'post' });
</script>

<style scoped>
.fallback-mail-html {
    min-width: 0;
    max-width: 100%;
    overflow-wrap: break-word;
}

.fallback-mail-html :deep(*),
.fallback-mail-html :deep(*::before),
.fallback-mail-html :deep(*::after) {
    box-sizing: border-box;
}

.fallback-mail-html :deep(img) {
    max-width: 100% !important;
    height: auto !important;
    object-fit: contain !important;
}

.fallback-mail-html :deep(table) {
    max-width: 100% !important;
}

.fallback-mail-html :deep(pre),
.fallback-mail-html :deep(code) {
    white-space: pre-wrap;
    overflow-wrap: break-word;
}

.fallback-mail-html :deep(a) {
    max-width: 100%;
    overflow-wrap: break-word;
    word-break: normal;
}
</style>
