/*
 * Naive UI theme overrides.
 *
 * The custom shells (admin console, access workspace) are painted from
 * src/styles/tokens.css, while Naive UI paints itself from its own theme
 * object. Without this bridge the two disagree: Naive's stock primary is a
 * green that clashes with the product's blue chrome, and its dark theme swaps
 * text to white while a hardcoded light shell stays white behind it.
 *
 * The values below mirror tokens.css. They are literals rather than
 * `var(--ets-*)` because Naive derives hover/pressed/disabled states by
 * computing on these colours, and it cannot compute on a CSS variable.
 */

const LIGHT = {
    bg: '#f5f5f7',
    brand: '#007aff',
    brandHover: '#0068d9',
    brandPressed: '#0059ba',
    brandSuppl: '#0068d9',
    success: '#248a3d',
    warning: '#b25000',
    error: '#d70015',
    info: '#007aff',
    text: '#1d1d1f',
    textMuted: '#6e6e73',
    border: '#e3e3e8',
    surface: '#ffffff',
    surfaceAlt: '#f9f9fb',
    hover: '#f0f0f3',
}

const DARK = {
    bg: '#161618',
    brand: '#0a84ff',
    brandHover: '#409cff',
    brandPressed: '#0071e3',
    brandSuppl: '#409cff',
    success: '#30d158',
    warning: '#ff9f0a',
    error: '#ff453a',
    info: '#0a84ff',
    text: '#f5f5f7',
    textMuted: '#a1a1a6',
    border: '#333336',
    surface: '#1c1c1e',
    surfaceAlt: '#232325',
    hover: '#2a2a2d',
}

const build = (p) => ({
    common: {
        bodyColor: p.bg,
        primaryColor: p.brand,
        primaryColorHover: p.brandHover,
        primaryColorPressed: p.brandPressed,
        primaryColorSuppl: p.brandSuppl,
        infoColor: p.info,
        infoColorHover: p.brandHover,
        infoColorPressed: p.brandPressed,
        infoColorSuppl: p.brandSuppl,
        successColor: p.success,
        successColorHover: p.success,
        successColorPressed: p.success,
        successColorSuppl: p.success,
        warningColor: p.warning,
        warningColorHover: p.warning,
        warningColorPressed: p.warning,
        warningColorSuppl: p.warning,
        errorColor: p.error,
        errorColorHover: p.error,
        errorColorPressed: p.error,
        errorColorSuppl: p.error,
        textColorBase: p.text,
        textColor1: p.text,
        textColor2: p.text,
        textColor3: p.textMuted,
        borderColor: p.border,
        dividerColor: p.border,
        cardColor: p.surface,
        modalColor: p.surface,
        popoverColor: p.surface,
        tableColor: p.surface,
        inputColor: p.surface,
        actionColor: p.surfaceAlt,
        hoverColor: p.hover,
        borderRadius: '8px',
        borderRadiusSmall: '6px',
        fontFamily: 'var(--ets-font-ui)',
        fontFamilyMono: 'var(--ets-font-mono)',
        fontSize: 'var(--text-body)',
        fontSizeMedium: 'var(--text-body)',
        fontSizeSmall: 'var(--text-callout)',
        heightSmall: 'var(--ets-control-sm)',
        heightMedium: 'var(--ets-control)',
        heightLarge: 'var(--ets-control-lg)',
    },
    Button: {
        textColorPrimary: '#ffffff',
        textColorHoverPrimary: '#ffffff',
        textColorPressedPrimary: '#ffffff',
        textColorFocusPrimary: '#ffffff',
    },
})

export const naiveLightOverrides = build(LIGHT)
export const naiveDarkOverrides = build(DARK)
