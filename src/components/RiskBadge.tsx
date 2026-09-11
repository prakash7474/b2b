import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '../theme';

interface RiskBadgeProps {
  risk: 'Low' | 'Medium' | 'High' | string;
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({ risk }) => {
  const normalized = (risk || '').toLowerCase();

  let bg = colors.statusFreshBg;
  let borderColor = colors.statusFreshBorder;
  let color = colors.statusFresh;

  if (normalized === 'medium') {
    bg = colors.statusFermentingBg;
    borderColor = colors.statusFermentingBorder;
    color = colors.statusFermenting;
  } else if (normalized === 'high') {
    bg = colors.statusAttentionBg;
    borderColor = colors.statusAttentionBorder;
    color = colors.statusAttention;
  }

  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor }]}>
      <Text style={[styles.text, { color }]}>{risk} Risk</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11.5,
    fontWeight: '700',
  },
});
