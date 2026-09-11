import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BatchStatus } from '../types/batch';
import { colors, radius, spacing } from '../theme';

interface BatchStatusBadgeProps {
  status: BatchStatus | string;
}

export const BatchStatusBadge: React.FC<BatchStatusBadgeProps> = ({ status }) => {
  const normalized = (status || '').toLowerCase();

  let bg = colors.backgroundAlt;
  let borderColor = colors.border;
  let textColor = colors.textSecondary;
  let dotColor = colors.textMuted;
  let label = status;

  if (normalized === 'created') {
    bg = colors.brownLight;
    borderColor = colors.brownBorder;
    textColor = colors.brownDark;
    dotColor = colors.brownMedium;
    label = 'Created';
  } else if (normalized === 'assigned') {
    bg = colors.statusFermentingBg;
    borderColor = colors.statusFermentingBorder;
    textColor = colors.statusFermenting;
    dotColor = colors.statusFermenting;
    label = 'Assigned';
  } else if (normalized === 'received') {
    bg = colors.statusFreshBg;
    borderColor = colors.statusFreshBorder;
    textColor = colors.statusFresh;
    dotColor = colors.statusFresh;
    label = 'Received';
  } else if (normalized === 'stockout' || normalized === 'stocked_out' || normalized === 'depleted') {
    bg = colors.dangerBg;
    borderColor = colors.rustRed;
    textColor = colors.rustRed;
    dotColor = colors.rustRed;
    label = 'Stock Out';
  }

  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor }]}>
      <Text style={[styles.dot, { color: dotColor }]}>●</Text>
      <Text style={[styles.text, { color: textColor }]}>{label}</Text>
    </View>
  );
};

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
