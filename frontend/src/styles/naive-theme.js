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
    brand: '#0f6cbd',
    brandHover: '#115ea3',
    brandPressed: '#0c4a80',
    brandSuppl: '#115ea3',
    success: '#107c41',
    warning: '#a15c07',
    error: '#c4314b',
    info: '#0f6cbd',
    text: '#1b1b1f',
    textMuted: '#5f6368',
    border: '#e1e4e9',
    surface: '#ffffff',
    surfaceAlt: '#f7f9fc',
    hover: '#f1f3f4',
}

const DARK = {
    brand: '#479ef5',
    brandHover: '#62abf5',
    brandPressed: '#2886de',
    brandSuppl: '#62abf5',
    success: '#5cc08a',
    warning: '#e2a03f',
    error: '#f1707b',
    info: '#479ef5',
    text: '#e8eaed',
    textMuted: '#a2a9b0',
    border: '#33363b',
    surface: '#202226',
    surfaceAlt: '#26282d',
    hover: '#2a2d33',
}

const build = (p) => ({
    common: {
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
        borderRadius: '6px',
        borderRadiusSmall: '4px',
        fontFamily: 'var(--ets-font-ui)',
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
