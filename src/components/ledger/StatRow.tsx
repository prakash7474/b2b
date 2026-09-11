import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../../theme';

interface StatRowProps {
  label: string;
  value: string | number;
  unit?: string;
  highlight?: boolean;
  borderBottom?: boolean;
}

export const StatRow: React.FC<StatRowProps> = ({
  label,
  value,
  unit,
  highlight = false,
  borderBottom = true,
}) => {
  return (
    <View style={[styles.row, borderBottom && styles.borderBottom]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueWrap}>
        <Text style={[styles.value, highlight && styles.valueHighlight]}>
          {value}
        </Text>
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
  },
  borderBottom: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  label: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
    flex: 1,
  },
  valueWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginLeft: spacing.sm,
  },
  value: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.inkCharcoal,
    fontFamily: typography.mono,
  },
  valueHighlight: {
    color: colors.clayTerracotta,
  },
  unit: {
    fontSize: 11,
    color: colors.textMuted,
    marginLeft: 3,
    fontFamily: typography.mono,
    fontWeight: '600',
  },
});
