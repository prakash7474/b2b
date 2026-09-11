import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  StyleProp,
} from 'react-native';
import { colors, radius, typography, spacing } from '../../theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  prefix?: string;
  suffix?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const PrimaryButton: React.FC<ButtonProps> = ({
  label,
  onPress,
  disabled = false,
  isLoading = false,
  style,
  textStyle,
  prefix,
  suffix,
  size = 'md',
}) => {
  return (
    <TouchableOpacity
      style={[
        styles.base,
        styles.primary,
        size === 'sm' && styles.sizeSm,
        size === 'lg' && styles.sizeLg,
        disabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || isLoading}
      activeOpacity={0.8}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={colors.textInverse} />
      ) : (
        <Text
          style={[
            styles.primaryText,
            size === 'sm' && styles.textSm,
            size === 'lg' && styles.textLg,
            textStyle,
          ]}
        >
          {prefix ? `${prefix} ` : ''}
          {label}
          {suffix ? ` ${suffix}` : ''}
        </Text>
      )}
    </TouchableOpacity>
  );
};

export const AcceptButton: React.FC<ButtonProps> = ({
  label = 'Accept',
  onPress,
  disabled = false,
  isLoading = false,
  style,
  textStyle,
}) => {
  return (
    <TouchableOpacity
      style={[styles.base, styles.accept, disabled && styles.disabled, style]}
      onPress={onPress}
      disabled={disabled || isLoading}
      activeOpacity={0.8}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={colors.paperWhite} />
      ) : (
        <Text style={[styles.acceptText, textStyle]}>✓ {label}</Text>
      )}
    </TouchableOpacity>
  );
};

export const RejectButton: React.FC<ButtonProps> = ({
  label = 'Reject',
  onPress,
  disabled = false,
  isLoading = false,
  style,
  textStyle,
}) => {
  return (
    <TouchableOpacity
      style={[styles.base, styles.reject, disabled && styles.disabled, style]}
      onPress={onPress}
      disabled={disabled || isLoading}
      activeOpacity={0.8}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={colors.rustRed} />
      ) : (
        <Text style={[styles.rejectText, textStyle]}>✗ {label}</Text>
      )}
    </TouchableOpacity>
  );
};

export const GhostLinkButton: React.FC<{
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}> = ({ label, onPress, style, textStyle }) => {
  return (
    <TouchableOpacity
      style={[styles.ghostLink, style]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.ghostLinkText, textStyle]}>
        {label} <Text style={styles.arrow}>→</Text>
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.sm,
    paddingVertical: 9,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
    flexDirection: 'row',
  },
  sizeSm: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    minHeight: 30,
  },
  sizeLg: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    minHeight: 46,
  },
  disabled: {
    opacity: 0.5,
  },
  primary: {
    backgroundColor: colors.clayTerracotta,
    borderWidth: 1,
    borderColor: colors.inkCharcoal,
  },
  primaryText: {
    color: colors.paperWhite,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  accept: {
    backgroundColor: colors.bananaGreen,
    borderWidth: 1,
    borderColor: colors.inkCharcoal,
  },
  acceptText: {
    color: colors.paperWhite,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  reject: {
    backgroundColor: colors.paperWhite,
    borderWidth: 1.5,
    borderColor: colors.rustRed,
  },
  rejectText: {
    color: colors.rustRed,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  textSm: {
    fontSize: 11,
  },
  textLg: {
    fontSize: 15,
  },
  ghostLink: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
  },
  ghostLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.clayTerracotta,
  },
  arrow: {
    fontSize: 13,
    fontWeight: '700',
  },
});
