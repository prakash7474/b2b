import { Pressable, View, Text, StyleSheet } from 'react-native';
import type { Vendor } from '../../types';
import { colors } from '../../theme';

interface Props {
  vendor: Vendor;
  onPress: () => void;
}

export default function VendorCard({ vendor, onPress }: Props) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, { opacity: pressed ? 0.85 : 1 }]}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{vendor.shop_name || vendor.vendor_id}</Text>
          <Text style={styles.sub}>{vendor.owner_name} · {vendor.localityTier}</Text>
          <Text style={styles.sub}>
            ⭐ {vendor.rating} · Batches: {vendor.batch_count || 0}
          </Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>
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
  title: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  sub: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  chevron: { fontSize: 24, color: colors.textMuted },
});
