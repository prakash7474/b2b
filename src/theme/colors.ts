/**
 * B2P Design System — South Indian Shop Ledger & Fermentation Matka Theme
 * 
 * Unglazed clay pots (matka) traditionally used to ferment idli/dosa batter,
 * raw fermented batter itself, and South Indian shop ledger register aesthetic.
 * Ruled rectangular panels, 1.5px ink borders, 2.5px top rules, no drop shadows.
 */

export const colors = {
  // Exact tokens from build specification
  clayTerracotta: '#A2481F',   // Primary brand / primary buttons / active nav
  batterCream: '#F3ECDD',      // App background
  inkCharcoal: '#2B241E',      // Body text, borders, ledger rules
  bananaGreen: '#4B6B3A',      // Success / Accept / Low-risk (Green) badge
  turmericGold: '#C98A1F',     // Warning / Medium-risk (Amber) badge
  rustRed: '#C1432B',          // Danger / Reject / High-risk (Red) badge
  paperWhite: '#FBF8F2',       // Card surface

  // Structural mappings
  background: '#F3ECDD',
  backgroundAlt: '#ECE4D2',
  surface: '#FBF8F2',
  surfaceElevated: '#FFFFFF',

  // Rules & Borders
  border: '#2B241E',
  borderLight: '#D9CEBD',
  borderHairline: '#E2D9CB',
  borderStrong: '#2B241E',

  // Brand / Actions
  primary: '#A2481F',
  primaryHover: '#8A3B18',

  // Typography
  textPrimary: '#2B241E',
  textSecondary: '#574C43',
  textMuted: '#7E7267',
  textInverse: '#FBF8F2',

  // Badges & Statuses
  success: '#4B6B3A',
  successBg: '#E9EFE6',
  successBorder: '#4B6B3A',

  warning: '#C98A1F',
  warningBg: '#F8F1E2',
  warningBorder: '#C98A1F',

  danger: '#C1432B',
  dangerBg: '#F9ECE9',
  dangerBorder: '#C1432B',

  // Legacy compat aliases for smooth transition
  greenDark: '#4B6B3A',
  greenPrimary: '#4B6B3A',
  greenLight: '#E9EFE6',
  greenBorder: '#4B6B3A',
  brownPrimary: '#A2481F',
  brownDark: '#2B241E',
  brownBorder: '#2B241E',
  brownLight: '#ECE4D2',
  brownMedium: '#7E7267',
  accentOat: '#F3ECDD',
  statusFresh: '#4B6B3A',
  statusFreshBg: '#E9EFE6',
  statusFreshBorder: '#4B6B3A',
  statusAttention: '#C98A1F',
  statusAttentionBg: '#F8F1E2',
  statusAttentionBorder: '#C98A1F',
  statusSpoiled: '#C1432B',
  statusSpoiledBg: '#F9ECE9',
  statusSpoiledBorder: '#C1432B',
  statusFermenting: '#C98A1F',
  statusFermentingBg: '#F8F1E2',
  statusFermentingBorder: '#C98A1F',
};

export const typography = {
  heading: 'Georgia, "Times New Roman", serif',
  body: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  mono: '"IBM Plex Mono", "SF Mono", Menlo, Monaco, Consolas, monospace',
  fontFamily: {
    heading: 'Georgia, "Times New Roman", serif',
    display: 'Georgia, "Times New Roman", serif',
    body: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    mono: '"IBM Plex Mono", "SF Mono", Menlo, Monaco, Consolas, monospace',
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  none: 0,
  sm: 2,
  md: 4,
  lg: 6,
  pill: 999,
};

// Clean ledger card rules — NO drop shadows per specification
export const ledgerCard = {
  backgroundColor: colors.paperWhite,
  borderWidth: 1.5,
  borderTopWidth: 2.5,
  borderColor: colors.inkCharcoal,
  borderRadius: radius.md,
};

export const shadows = {
  soft: {},
  card: {},
};
