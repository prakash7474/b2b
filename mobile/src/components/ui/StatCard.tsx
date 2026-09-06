import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme';

interface StatCardProps {
  label: string;
  value: number | string;
  color?: string;
  icon?: string;
}

export default function StatCard({ label, value, color = colors.primary, icon }: StatCardProps) {
  return (
    <View style={[styles.card, { borderLeftColor: color }]}>
      {icon ? <Text style={styles.icon}>{icon}</Text> : null}
      <Text style={[styles.value, { color }]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 10,
    padding: 16,
    borderLeftWidth: 4,
    marginBottom: 10,
  },
  icon: { fontSize: 22, marginBottom: 4 },
  value: { fontSize: 26, fontWeight: '700' },
  label: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
});
