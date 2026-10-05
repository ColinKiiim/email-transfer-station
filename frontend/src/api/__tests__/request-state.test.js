import { describe, expect, it } from 'vitest'

import { createRequestState } from '../request-state'

describe('request state', () => {
    it('keeps shared loading active until the last request settles', () => {
        const changes = []
        const state = createRequestState((loading) => changes.push(loading))

        state.begin()
        state.begin()
        state.end()
        state.end()
        state.end()

        expect(changes).toEqual([true, true, true, false, false])
    })
})
