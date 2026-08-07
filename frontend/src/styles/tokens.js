/**
 * tokens.js — mesmos valores de tokens.css, em JS.
 *
 * Recharts e cores dinâmicas (avatar por pessoa, categoria) precisam de
 * hex em JS, não só CSS var. Mantenha estes valores idênticos aos de
 * tokens.css e tailwind.config.js — não há dedupe automático entre os
 * três neste setup (Vite + Tailwind 3).
 */

export const COLOR_BG = '#f9f8f6';
export const COLOR_SURFACE = '#ffffff';
export const COLOR_SURFACE_ALT = '#fafaf8';
export const COLOR_BORDER = '#ebe8e2';
export const COLOR_BORDER_STRONG = '#d8d3cb';
export const COLOR_INK = '#1c1916';
export const COLOR_MUTED = '#6e6a63';
export const COLOR_FAINT = '#a39f98';

export const COLOR_INCOME = '#0d9488';
export const COLOR_EXPENSE = '#dc2626';
export const COLOR_BALANCE = '#2563eb';
export const COLOR_PCT = '#7c3aed';
export const COLOR_WARN = '#d97706';

export const COLOR_BRAND = '#512b8d';
export const COLOR_BRAND_DARK = '#3f216e';
export const COLOR_BRAND_LIGHT = '#e5dcf4';

export const COLOR_ACCENT = '#2dbe79';
export const COLOR_ACCENT_DARK = '#1b734a';
export const COLOR_ACCENT_LIGHT = '#daf6e9';

export const FONT_SANS = "'Outfit', system-ui, sans-serif";
export const FONT_MONO = "'JetBrains Mono', 'Cascadia Code', monospace";
