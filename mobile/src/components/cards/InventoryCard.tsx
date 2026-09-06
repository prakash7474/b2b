import { View, Text, StyleSheet } from 'react-native';
import type { InventoryItem } from '../../types';
import { freshnessColor } from '../../utils/helpers';
import { colors } from '../../theme';

interface Props {
  item: InventoryItem;
}

export default function InventoryCard({ item }: Props) {
  const fs = item.freshness_score || 0;
  const fsColor = freshnessColor(fs);
  const isLow = item.quantity <= (item.minimum_stock || 0);
  const pct = Math.min(100, fs * 100);

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.title}>{item.product_name}</Text>
        {isLow ? (
          <View style={styles.lowBadge}>
            <Text style={styles.lowText}>LOW STOCK</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.sub}>
        Stock: {item.quantity} · Min: {item.minimum_stock}
      </Text>
      <Text style={styles.sub}>
        ₹{item.price} · {item.vendor_name || item.vendor_id}
      </Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: fsColor }]} />
      </View>
      <Text style={[styles.fresh, { color: fsColor }]}>Freshness: {pct.toFixed(0)}%</Text>
    </View>
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
  title: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  lowBadge: { backgroundColor: '#FDEDEC', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  lowText: { fontSize: 10, fontWeight: '700', color: colors.danger },
  sub: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  barTrack: { height: 6, backgroundColor: colors.border, borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  fresh: { fontSize: 11, fontWeight: '600', marginTop: 4 },
});
