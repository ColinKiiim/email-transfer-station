import { describe, expect, it, vi } from 'vitest'

import { useAdminFeedback } from '../admin-feedback'

describe('admin feedback state', () => {
    it('normalizes semantic toast state and replaces the dismissal timer', () => {
        vi.useFakeTimers()
        const feedback = useAdminFeedback({ duration: 100 })

        feedback.showToast('first', 'success')
        expect(feedback.toastState).toMatchObject({ visible: true, text: 'first', tone: 'success' })

        vi.advanceTimersByTime(50)
        feedback.showToast('failed', 'error')
        vi.advanceTimersByTime(60)
        expect(feedback.toastState).toMatchObject({ visible: true, text: 'failed', tone: 'error' })

        vi.advanceTimersByTime(40)
        expect(feedback.toastState.visible).toBe(false)
        vi.useRealTimers()
    })

    it('falls back to an informational tone and can be disposed immediately', () => {
        vi.useFakeTimers()
        const feedback = useAdminFeedback()

        feedback.showToast('', 'unknown')
        expect(feedback.toastState).toMatchObject({
            visible: true,
            text: '操作已处理',
            tone: 'info',
        })
        feedback.disposeFeedback()
        expect(feedback.toastState.visible).toBe(false)
        vi.useRealTimers()
    })
})
