import { Pressable, View, Text, StyleSheet } from 'react-native';
import type { Batch } from '../../types';
import { colors } from '../../theme';

const STATUS_COLORS: Record<string, string> = {
  created: colors.info,
  assigned: colors.warning,
  received: colors.success,
};

interface Props {
  batch: Batch;
  onPress: () => void;
}

export default function BatchCard({ batch, onPress }: Props) {
  const statusColor = STATUS_COLORS[batch.status] || colors.textMuted;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, { opacity: pressed ? 0.85 : 1 }]}>
      <View style={styles.row}>
        <Text style={styles.id}>{batch.batch_id}</Text>
        <View style={[styles.badge, { backgroundColor: statusColor }]}>
          <Text style={styles.badgeText}>{batch.status}</Text>
        </View>
      </View>
      <Text style={styles.sub}>
        {batch.product_name} · {batch.volume_kg}kg · pH {batch.initialPH}
      </Text>
      {batch.vendor_name ? <Text style={styles.muted}>→ {batch.vendor_name}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 10,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  id: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgeText: { color: colors.white, fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  sub: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  muted: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
});
