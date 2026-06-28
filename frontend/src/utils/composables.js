import { useBreakpoint, useMemo } from 'vooks'

export function useIsMobile() {
    const breakpointRef = useBreakpoint()
    return useMemo(() => {
        return ['xs', 's', 'm'].includes(breakpointRef.value)
    })
}
