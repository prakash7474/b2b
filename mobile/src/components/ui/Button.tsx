import { Pressable, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { colors } from '../../theme';

type Variant = 'primary' | 'danger' | 'outline';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
}

const backgrounds: Record<Variant, string> = {
  primary: colors.primary,
  danger: colors.danger,
  outline: colors.white,
};

const textColors: Record<Variant, string> = {
  primary: colors.white,
  danger: colors.white,
  outline: colors.primary,
};

export default function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
}: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: backgrounds[variant], borderColor: variant === 'outline' ? colors.primary : 'transparent', borderWidth: variant === 'outline' ? 1 : 0, opacity: disabled || loading ? 0.6 : pressed ? 0.85 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColors[variant]} />
      ) : (
        <Text style={[styles.label, { color: textColors[variant] }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
  },
});
