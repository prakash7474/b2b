import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { colors } from '../../theme';

export default function Loading({ message = 'Loading...' }: { message?: string }) {
  return (
    <View style={styles.wrapper}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { paddingVertical: 40, alignItems: 'center' },
  text: { marginTop: 8, color: colors.textSecondary, fontSize: 14 },
});
