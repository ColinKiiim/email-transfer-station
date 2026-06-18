export const formatApiErrorData = (data) => {
    if (typeof data === 'string') return data
    if (!data || typeof data !== 'object') return String(data || 'error')
    return data.message
        || data.error
        || data.code
        || JSON.stringify(data)
}

export class ApiRequestError extends Error {
    constructor(status, data) {
        super(`[${status}]: ${formatApiErrorData(data)}`)
        this.name = 'ApiRequestError'
        this.status = status
        this.data = data
    }
}
