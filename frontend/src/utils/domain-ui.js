export const normalizeFilterValue = (value) => String(value || '').trim()

export const selectDefaultDomain = (domainOptions, defaultDomains) => {
    const options = Array.isArray(domainOptions) ? domainOptions : []
    const defaults = Array.isArray(defaultDomains) ? defaultDomains : []
    const preferred = defaults
        .map((domain) => options.find((item) => item.value === domain))
        .find(Boolean)
    return preferred?.value || options[0]?.value || ''
}

export const canRunManagedDomainAction = (domain) => {
    return domain?.source === 'db' && Number.isInteger(domain?.id)
}
