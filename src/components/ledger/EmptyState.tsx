import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../../theme';
import { PrimaryButton } from './LedgerButtons';

interface EmptyStateProps {
  message?: string;
  title?: string;
  subtext?: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  message,
  title,
  subtext,
  subtitle,
  actionLabel,
  onAction,
}) => {
  const displayTitle = message || title || 'No Records Found';
  const displaySubtext = subtext || subtitle;
  return (
    <View style={styles.container}>
      <Text style={styles.dash}>—</Text>
      <Text style={styles.message}>{displayTitle}</Text>
      {displaySubtext ? <Text style={styles.subtext}>{displaySubtext}</Text> : null}
      {actionLabel && onAction ? (
        <View style={styles.actionWrap}>
          <PrimaryButton label={actionLabel} onPress={onAction} size="sm" />
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dash: {
    fontSize: 20,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    fontFamily: typography.mono,
  },
  message: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  subtext: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 360,
  },
  actionWrap: {
    marginTop: spacing.md,
  },
});
