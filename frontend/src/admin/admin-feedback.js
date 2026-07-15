import { reactive } from 'vue'

const TOAST_TONES = new Set(['info', 'success', 'warning', 'error'])

export const useAdminFeedback = ({ duration = 1800 } = {}) => {
    const toastState = reactive({
        visible: false,
        text: '',
        tone: 'info',
    })
    let toastTimer = 0

    const dismissToast = () => {
        toastState.visible = false
        if (toastTimer) globalThis.clearTimeout(toastTimer)
        toastTimer = 0
    }

    const showToast = (text, tone = 'info') => {
        toastState.text = String(text || '操作已处理')
        toastState.tone = TOAST_TONES.has(tone) ? tone : 'info'
        toastState.visible = true
        if (toastTimer) globalThis.clearTimeout(toastTimer)
        toastTimer = globalThis.setTimeout(dismissToast, duration)
    }

    return {
        dismissToast,
        disposeFeedback: dismissToast,
        showToast,
        toastState,
    }
}
