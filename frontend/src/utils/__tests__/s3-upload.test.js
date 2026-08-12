import { describe, expect, it, vi } from 'vitest'

import { putBlobToSignedUrl } from '../s3-upload'

describe('signed S3 upload', () => {
    it('uploads the original blob and rejects non-success responses', async () => {
        const blob = new Blob(['exact attachment bytes'], { type: 'text/plain' })
        const okFetch = vi.fn(async () => ({ ok: true, status: 200 }))

        await putBlobToSignedUrl('https://s3.example.test/signed', blob, okFetch)
        expect(okFetch).toHaveBeenCalledWith('https://s3.example.test/signed', {
            method: 'PUT',
            body: blob,
        })

        await expect(putBlobToSignedUrl(
            'https://s3.example.test/signed',
            blob,
            async () => ({ ok: false, status: 403 }),
        )).rejects.toThrow('S3 upload failed (403)')
    })
})
