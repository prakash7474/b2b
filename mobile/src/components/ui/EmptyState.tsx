import { Text, StyleSheet } from 'react-native';
import { colors } from '../../theme';

export default function EmptyState({ message }: { message: string }) {
  return <Text style={styles.text}>{message}</Text>;
}

const styles = StyleSheet.create({
  text: { textAlign: 'center', marginTop: 40, color: colors.textSecondary, fontSize: 14 },
});
