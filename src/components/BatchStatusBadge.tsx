// ════════════════════════════════════════════════════════════════════════════
// 📌 BATCH STATUS BADGE COMPONENT (src/components/BatchStatusBadge.tsx)
// ════════════════════════════════════════════════════════════════════════════
// 💡 WHAT THIS FILE DOES (EXPLAIN THIS TO THE INSTRUCTOR):
//    Renders a colored pill/badge with a bullet dot indicating the current
//    lifecycle stage of a batter batch.
//
//    The 5 Status Stages & Colors:
//    1. "Created" (Terracotta Brown)   : Batch milled & sitting in Central Kitchen.
//    2. "Assigned" (Turmeric Amber)    : Dispatched on delivery vehicle to vendor.
//    3. "Received" (Banana Leaf Green) : Delivered, confirmed by vendor, active in store.
//    4. "Stock Out" (Rust Red)         : Batch depleted / completely consumed.
//    5. "Archived" (Muted Slate/Grey)  : Historical batch stored in database ledger.
//
// 👉 HOW TO CHANGE BADGE COLORS OR LABELS:
//    - Look at the `if (normalized === '...')` ladder around lines 30-55.
//    - Change `bg`, `borderColor`, `textColor`, or `label`.
// ════════════════════════════════════════════════════════════════════════════

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BatchStatus } from '../types/batch';
import { colors, radius, spacing } from '../theme';

// ── Props definition ────────────────────────────────────────────────────────
interface BatchStatusBadgeProps {
  status: BatchStatus | string; // e.g. 'created', 'assigned', 'received', 'archived'
}

export const BatchStatusBadge: React.FC<BatchStatusBadgeProps> = ({ status }) => {
  const normalized = (status || '').toLowerCase();

  // Default fallback styles
  let bg = colors.backgroundAlt;
  let borderColor = colors.border;
  let textColor = colors.textSecondary;
  let dotColor = colors.textMuted;
  let label = status;

  // ── 1. CREATED (Freshly milled at central kitchen) ─────────────────────────
  if (normalized === 'created') {
    bg = colors.brownLight;
    borderColor = colors.brownBorder;
    textColor = colors.brownDark;
    dotColor = colors.brownMedium;
    label = 'Created';

  // ── 2. ASSIGNED (In transit to vendor outlet) ──────────────────────────────
  } else if (normalized === 'assigned') {
    bg = colors.statusFermentingBg;
    borderColor = colors.statusFermentingBorder;
    textColor = colors.statusFermenting;
    dotColor = colors.statusFermenting;
    label = 'Assigned';

  // ── 3. RECEIVED (Delivered & active in shop inventory) ─────────────────────
  } else if (normalized === 'received') {
    bg = colors.statusFreshBg;
    borderColor = colors.statusFreshBorder;
    textColor = colors.statusFresh;
    dotColor = colors.statusFresh;
    label = 'Received';

  // ── 4. STOCK OUT (Fully used / emptied) ────────────────────────────────────
  } else if (normalized === 'stockout' || normalized === 'stocked_out' || normalized === 'depleted') {
    bg = colors.dangerBg;
    borderColor = colors.rustRed;
    textColor = colors.rustRed;
    dotColor = colors.rustRed;
    label = 'Stock Out';

  // ── 5. ARCHIVED (Completed historical record) ──────────────────────────────
  } else if (normalized === 'archived') {
    bg = colors.backgroundAlt;
    borderColor = colors.borderLight;
    textColor = colors.textMuted;
    dotColor = colors.textMuted;
    label = 'Archived';
  }

  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor }]}>
      <Text style={[styles.dot, { color: dotColor }]}>●</Text>
      <Text style={[styles.text, { color: textColor }]}>{label}</Text>
    </View>
  );
};

// ── Stylesheet ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
    gap: 4,
  },
  dot: {
    fontSize: 8,
  },
  text: {
    fontSize: 11.5,
    fontWeight: '700',
  },
});

