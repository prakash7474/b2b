// ════════════════════════════════════════════════════════════════════════════
// 📌 B2P DESIGN SYSTEM — THEME & COLOR PALETTE (src/theme/colors.ts)
// ════════════════════════════════════════════════════════════════════════════
// 💡 WHAT THIS FILE DOES (EXPLAIN THIS TO THE INSTRUCTOR):
//    This is the design token file for the entire application.
//    It establishes the "South Indian Shop Ledger & Fermentation Matka" theme:
//
//    Color Palette & Meaning:
//    1. `clayTerracotta` (#A2481F): The warm reddish-brown of unglazed clay pots (matka)
//       used traditionally to ferment idli & dosa batter. Used for primary buttons & active tabs.
//    2. `batterCream` (#F3ECDD): The creamy natural ivory hue of stone-ground fermented batter.
//       Used as the app background.
//    3. `inkCharcoal` (#2B241E): The dark carbon ink of shopkeeper ledgers (Katha books).
//       Used for borders, titles, and text.
//    4. `bananaGreen` (#4B6B3A): Fresh banana leaf green for success, delivery confirmation, & low risk.
//    5. `turmericGold` (#C98A1F): Warm turmeric amber for pending items, in-transit, & medium risk warnings.
//    6. `rustRed` (#C1432B): Deep terracotta red for danger alerts, stockouts, & high spoilage risk.
//    7. `paperWhite` (#FBF8F2): Crisp ledger paper surface for cards and table rows.
//
// 👉 HOW TO CHANGE APP BRAND COLORS:
//    - Change `clayTerracotta` to change primary buttons and tabs.
//    - Change `batterCream` to change the overall background color.
// ════════════════════════════════════════════════════════════════════════════

export const colors = {
  // ── Core Brand Identity Tokens ────────────────────────────────────────────
  clayTerracotta: '#A2481F',   // Primary brand / primary buttons / active nav
  batterCream:    '#F3ECDD',   // App background
  inkCharcoal:    '#2B241E',   // Body text, borders, ledger rules
  bananaGreen:    '#4B6B3A',   // Success / Accept / Low-risk (Green) badge
  turmericGold:   '#C98A1F',   // Warning / Medium-risk (Amber) badge
  rustRed:        '#C1432B',   // Danger / Reject / High-risk (Red) badge
  paperWhite:     '#FBF8F2',   // Card surface

  // ── Structural Theme Mappings ─────────────────────────────────────────────
  background:     '#F3ECDD',
  backgroundAlt:  '#ECE4D2',
  surface:        '#FBF8F2',
  surfaceElevated: '#FFFFFF',

  // ── Rules & Ledger Borders ────────────────────────────────────────────────
  border:         '#2B241E',
  borderLight:    '#D9CEBD',
  borderHairline: '#E2D9CB',
  borderStrong:   '#2B241E',

  // ── Brand / Action States ─────────────────────────────────────────────────
  primary:        '#A2481F',
  primaryHover:   '#8A3B18',

  // ── Typography Colors ─────────────────────────────────────────────────────
  textPrimary:    '#2B241E',
  textSecondary:  '#574C43',
  textMuted:      '#7E7267',
  textInverse:    '#FBF8F2',

  // ── Status Badges & Alerts ────────────────────────────────────────────────
  success:        '#4B6B3A',
  successBg:      '#E9EFE6',
  successBorder:  '#4B6B3A',

  warning:        '#C98A1F',
  warningBg:      '#F8F1E2',
  warningBorder:  '#C98A1F',

  danger:         '#C1432B',
  dangerBg:       '#F9ECE9',
  dangerBorder:   '#C1432B',

  // ── Backward Compatibility Aliases ────────────────────────────────────────
  greenDark:             '#4B6B3A',
  greenPrimary:          '#4B6B3A',
  greenLight:            '#E9EFE6',
  greenBorder:           '#4B6B3A',
  brownPrimary:          '#A2481F',
  brownDark:             '#2B241E',
  brownBorder:           '#2B241E',
  brownLight:            '#ECE4D2',
  brownMedium:           '#7E7267',
  accentOat:             '#F3ECDD',
  statusFresh:           '#4B6B3A',
  statusFreshBg:         '#E9EFE6',
  statusFreshBorder:     '#4B6B3A',
  statusAttention:       '#C98A1F',
  statusAttentionBg:     '#F8F1E2',
  statusAttentionBorder: '#C98A1F',
  statusSpoiled:         '#C1432B',
  statusSpoiledBg:       '#F9ECE9',
  statusSpoiledBorder:   '#C1432B',
  statusFermenting:      '#C98A1F',
  statusFermentingBg:    '#F8F1E2',
  statusFermentingBorder:'#C98A1F',
};

// ── Typography System ───────────────────────────────────────────────────────
// Uses classic Serif headings and crisp monospace numerals for audit ledgers
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

// ── Spacing Scale (8pt Grid System) ─────────────────────────────────────────
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// ── Corner Radii ────────────────────────────────────────────────────────────
// Minimal rounding (4px) to maintain the authentic book-bound rectangular feel
export const radius = {
  none: 0,
  sm: 2,
  md: 4,
  lg: 6,
  pill: 999,
};

// ── Clean Ledger Card Styles — Zero Drop Shadows Policy ─────────────────────
export const ledgerCard = {
  backgroundColor: colors.paperWhite,
  borderWidth: 1.5,
  borderTopWidth: 2.5,
  borderColor: colors.inkCharcoal,
  borderRadius: radius.md,
};

// Shadow placeholders (empty per authentic flat-paper design specification)
export const shadows = {
  soft: {},
  card: {},
};

