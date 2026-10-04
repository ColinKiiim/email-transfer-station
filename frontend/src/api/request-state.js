export const createRequestState = (onChange) => {
    let pending = 0
    const update = () => onChange(pending > 0)
    return {
        begin() {
            pending += 1
            update()
        },
        end() {
            pending = Math.max(0, pending - 1)
            update()
        },
    }
}
