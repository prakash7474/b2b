import { View, Text, StyleSheet } from 'react-native';
import type { Order } from '../../types';
import { colors } from '../../theme';

interface Props {
  order: Order;
}

const statusColor = (status: string) =>
  status === 'delivered' ? colors.success : colors.warning;

export default function OrderCard({ order }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.id}>{order.order_id}</Text>
        <Text style={[styles.status, { color: statusColor(order.order_status) }]}>
          {order.order_status}
        </Text>
      </View>
      <Text style={styles.sub}>₹{order.total_amount} · {order.payment_status}</Text>
      <Text style={styles.sub}>Vendor: {order.vendor_id}</Text>
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
  id: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  status: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  sub: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
});
