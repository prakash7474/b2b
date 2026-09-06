import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme';

interface Detail {
  label: string;
  value: string | number;
}

interface Props {
  title: string;
  value: string | number;
  details?: Detail[];
  color?: string;
}

export default function PredictionResult({ title, value, details = [], color }: Props) {
  const accent = color || colors.primary;
  return (
    <View style={[styles.card, { borderLeftColor: accent }]}>
      <Text style={styles.title}>{title}</Text>
      <Text style={[styles.value, { color: accent }]}>{value}</Text>
      {details.map((d, i) => (
        <View key={i} style={styles.detailRow}>
          <Text style={styles.detailLabel}>{d.label}</Text>
          <Text style={styles.detailValue}>{d.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  title: { fontSize: 14, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 },
  value: { fontSize: 24, fontWeight: '700', marginBottom: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  detailLabel: { fontSize: 13, color: colors.textSecondary },
  detailValue: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
});
