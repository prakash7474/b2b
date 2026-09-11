import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { colors, radius, typography, spacing } from '../../theme';

interface LedgerPanelProps {
  title?: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  noPadding?: boolean;
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
      {title ? (
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            <Text style={styles.title}>{title}</Text>
          </View>
          {headerRight ? <View style={styles.headerRight}>{headerRight}</View> : null}
        </View>
      ) : null}
      <View style={[styles.body, noPadding && styles.noPadding]}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.paperWhite,
    borderWidth: 1.5,
    borderTopWidth: 2.5,
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
