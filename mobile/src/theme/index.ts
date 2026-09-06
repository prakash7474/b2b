/**
 * Theme — Central color palette and spacing constants.
 */

export const colors = {
  primary:      '#4A90D9',
  primaryDark:  '#357ABD',
  primaryLight: '#E8F0FE',
  success:      '#27AE60',
  warning:      '#F39C12',
  danger:       '#E74C3C',
  info:         '#3498DB',
  white:        '#FFFFFF',
  bgLight:      '#F5F7FA',
  border:       '#E0E0E0',
  textPrimary:  '#2C3E50',
  textSecondary:'#7F8C8D',
  textMuted:    '#BDC3C7',
  cardBg:       '#FFFFFF',
  purple:       '#9B59B6',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const borderRadius = {
  sm: 6,
  md: 10,
  lg: 16,
} as const;
