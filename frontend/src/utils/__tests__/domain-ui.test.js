import { describe, expect, it } from 'vitest'

import {
    canRunManagedDomainAction,
    normalizeFilterValue,
    selectDefaultDomain,
} from '../domain-ui'
import { formatApiErrorData } from '../api-error'

describe('domain admin UI helpers', () => {
    it('normalizes clearable null values without throwing', () => {
        expect(normalizeFilterValue(null)).toBe('')
        expect(normalizeFilterValue('  user@example.com  ')).toBe('user@example.com')
    })

    it('selects a configured default domain before the first option', () => {
        const options = [
            { label: 'Alpha', value: 'alpha.example' },
            { label: 'Primary', value: 'primary.example' },
        ]
        expect(selectDefaultDomain(options, ['primary.example'])).toBe('primary.example')
        expect(selectDefaultDomain(options, [])).toBe('alpha.example')
    })

    it('requires a persisted D1 id for managed-domain actions', () => {
        expect(canRunManagedDomainAction({ source: 'env' })).toBe(false)
        expect(canRunManagedDomainAction({ source: 'db', id: 7 })).toBe(true)
    })

    it('formats structured API failures as useful text', () => {
        expect(formatApiErrorData({ error: 'domain_config_conflict' })).toBe('domain_config_conflict')
        expect(formatApiErrorData({ message: 'Readable failure' })).toBe('Readable failure')
    })
})
