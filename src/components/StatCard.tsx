import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, radius, shadows, spacing } from '../theme';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  accentColor?: string;
  color?: string;
  onPress?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  accentColor,
  color,
  onPress,
}) => {
  const effectiveAccent = accentColor || color || colors.greenPrimary;
  const content = (
    <View style={styles.card}>
      <View style={[styles.accentPill, { backgroundColor: effectiveAccent }]} />
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={styles.wrapper}>
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={styles.wrapper}>{content}</View>;
};

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    minWidth: 140,
    margin: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
    overflow: 'hidden',
    ...shadows.soft,
  },
  accentPill: {
    width: 24,
    height: 3,
    borderRadius: 2,
    marginBottom: spacing.sm,
  },
  value: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  title: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 10.5,
    color: colors.textMuted,
    marginTop: 3,
  },
});
