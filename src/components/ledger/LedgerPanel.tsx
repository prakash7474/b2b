// ════════════════════════════════════════════════════════════════════════════
// 📌 LEDGER PANEL CONTAINER (src/components/ledger/LedgerPanel.tsx)
// ════════════════════════════════════════════════════════════════════════════
// 💡 WHAT THIS FILE DOES (EXPLAIN THIS TO THE INSTRUCTOR):
//    This is the core design container component for the entire app.
//    Implements the "South Indian Shop Ledger" (Katha Pusthagam) aesthetic:
//
//    Design Characteristics:
//    - Background: Crisp paper white (`colors.paperWhite`).
//    - Borders: Hand-inked charcoal line (`colors.inkCharcoal`, 1.5px solid).
//    - Top Rule: Emphasized 2.5px solid top border resembling traditional hardbound book binding.
//    - Header: Ruled section with mono uppercase subtitle and bold serif/heading title.
//    - Children: Enclosed form controls, tables, or KPI figures.
//
// 👉 HOW TO USE IN A SCREEN:
//    `<LedgerPanel title="Active Batches" subtitle="CENTRAL INVENTORY">
//       <Text>Content goes here...</Text>
//     </LedgerPanel>`
// ════════════════════════════════════════════════════════════════════════════

import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { colors, radius, typography, spacing } from '../../theme';

// ── Props definition ────────────────────────────────────────────────────────
interface LedgerPanelProps {
  title?: string;               // Main section heading
  subtitle?: string;            // Mono uppercase section tracker
  headerRight?: React.ReactNode;// Action button in top right of header
  children: React.ReactNode;    // Child UI elements
  style?: StyleProp<ViewStyle>; // Custom outer style overrides
  noPadding?: boolean;          // Set true for full-bleed edge-to-edge tables
}

export const LedgerPanel: React.FC<LedgerPanelProps> = ({
  title,
  subtitle,
  headerRight,
  children,
  style,
  noPadding = false,
}) => {
  return (
    <View style={[styles.panel, style]}>
      {/* ── Ruled Ledger Header ────────────────────────────────────────────── */}
      {title ? (
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            <Text style={styles.title}>{title}</Text>
          </View>
          {headerRight ? <View style={styles.headerRight}>{headerRight}</View> : null}
        </View>
      ) : null}

      {/* ── Panel Body ────────────────────────────────────────────────────── */}
      <View style={[styles.body, noPadding && styles.noPadding]}>{children}</View>
    </View>
  );
};

// ── Ledger Card Styles ──────────────────────────────────────────────────────
const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.paperWhite,
    borderWidth: 1.5,
    borderTopWidth: 2.5,                 // Distinctive ledger top rule
    borderColor: colors.inkCharcoal,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.paperWhite,
  },
  headerLeft: {
    flex: 1,
  },
  subtitle: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
    fontFamily: typography.mono,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.inkCharcoal,
    fontFamily: typography.heading,
  },
  headerRight: {
    marginLeft: spacing.sm,
  },
  body: {
    padding: spacing.md,
  },
  noPadding: {
    padding: 0,
  },
});

