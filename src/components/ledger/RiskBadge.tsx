import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, typography } from '../../theme';

interface RiskBadgeProps {
  score?: number | string; // 0-1, or 0-100, or 'Low'|'Medium'|'High'
  showScore?: boolean;
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({ score, showScore = true }) => {
  let pct: number = 0;
  let tier: 'green' | 'amber' | 'red' = 'green';
  let label: string = 'Good';

  if (typeof score === 'string') {
    const s = score.toLowerCase();
    if (s.includes('high') || s.includes('danger') || s.includes('critical')) {
      tier = 'red';
      pct = 85;
      label = 'Needs Immediate Attention';
    } else if (s.includes('med') || s.includes('warn') || s.includes('attention')) {
      tier = 'amber';
      pct = 50;
      label = 'Needs Attention';
    } else if (s.includes('low') || s.includes('good') || s.includes('safe')) {
      tier = 'green';
      pct = 15;
      label = 'Good';
    } else {
      const num = parseFloat(score);
      if (!isNaN(num)) {
        pct = num > 1 ? num : num * 100;
      }
    }
  } else if (typeof score === 'number') {
    pct = score > 1 ? score : score * 100;
  }

  if (pct < 30) {
    tier = 'green';
    label = 'Good';
  } else if (pct <= 70) {
    tier = 'amber';
    label = 'Needs Attention';
  } else {
    tier = 'red';
    label = 'Needs Immediate Attention';
  }

  const badgeStyles = [
    styles.badge,
    tier === 'green' && styles.greenBadge,
    tier === 'amber' && styles.amberBadge,
    tier === 'red' && styles.redBadge,
  ];

  const textStyles = [
    styles.text,
    tier === 'green' && styles.greenText,
    tier === 'amber' && styles.amberText,
    tier === 'red' && styles.redText,
  ];

  const dotStyles = [
    styles.dot,
    tier === 'green' && styles.greenDot,
    tier === 'amber' && styles.amberDot,
    tier === 'red' && styles.redDot,
  ];

  return (
    <View style={badgeStyles}>
      <View style={dotStyles} />
      <Text style={textStyles}>
        {label}
        {showScore && pct > 0 ? ` (${Math.round(pct)}%)` : ''}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
    fontFamily: typography.body,
  },
  greenBadge: {
    backgroundColor: colors.successBg,
    borderColor: colors.bananaGreen,
  },
  greenDot: {
    backgroundColor: colors.bananaGreen,
  },
  greenText: {
    color: colors.bananaGreen,
  },
  amberBadge: {
    backgroundColor: colors.warningBg,
    borderColor: colors.turmericGold,
  },
  amberDot: {
    backgroundColor: colors.turmericGold,
  },
  amberText: {
    color: colors.turmericGold,
  },
  redBadge: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.rustRed,
  },
  redDot: {
    backgroundColor: colors.rustRed,
  },
  redText: {
    color: colors.rustRed,
  },
});
