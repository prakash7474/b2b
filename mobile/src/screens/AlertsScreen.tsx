import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useFetch } from '../hooks/useFetch';
import alertService from '../services/alertService';
import type { Alert } from '../types';
import Screen from '../components/ui/Screen';
import Loading from '../components/ui/Loading';
import EmptyState from '../components/ui/EmptyState';
import { formatDate } from '../utils/helpers';
import { colors } from '../theme';

const TYPE_LABELS: Record<string, string> = {
  low_stock: '⚠️ LOW STOCK',
  spoilage_risk: '🌡️ SPOILAGE RISK',
  expiry_warning: '⏰ EXPIRY WARNING',
};

const TYPE_COLORS: Record<string, string> = {
  low_stock: colors.danger,
  spoilage_risk: colors.warning,
  expiry_warning: colors.purple,
};

const FILTERS: { key: string | null; label: string }[] = [
  { key: null, label: 'All' },
  { key: 'low_stock', label: 'Low Stock' },
  { key: 'spoilage_risk', label: 'Spoilage' },
  { key: 'expiry_warning', label: 'Expiry' },
];

export default function AlertsScreen() {
  const [filter, setFilter] = useState<string | null>(null);
  const { data: alerts, loading, error, refetch } = useFetch(
    () => alertService.list(filter ? { alert_type: filter } : {}),
    [filter],
  );

  return (
    <Screen title="Alerts" onRefresh={refetch} refreshing={loading}>
      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.key ?? 'all'}
            onPress={() => setFilter(f.key)}
            style={[styles.chip, { backgroundColor: filter === f.key ? colors.primary : colors.white, borderColor: colors.border }]}
          >
            <Text style={{ color: filter === f.key ? colors.white : colors.textSecondary, fontWeight: '600', fontSize: 12 }}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? <Loading /> : null}
      {error ? <EmptyState message={`Error: ${error}`} /> : null}

      {alerts?.map((a: Alert) => (
        <View key={a.alert_id} style={styles.card}>
          <View style={styles.cardHead}>
            <View style={[styles.typeBadge, { backgroundColor: TYPE_COLORS[a.alert_type] || colors.textMuted }]}>
              <Text style={styles.typeText}>{TYPE_LABELS[a.alert_type] || a.alert_type}</Text>
            </View>
            <Text style={styles.time}>{formatDate(a.generated_time)}</Text>
          </View>
          <Text style={styles.message}>{a.message}</Text>
          <Text style={styles.meta}>
            {a.product_name} · Vendor: {a.vendor_id} · {a.inventory_id}
          </Text>
        </View>
      ))}
      {alerts?.length === 0 ? <EmptyState message="✅ No alerts — everything looks good!" /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  card: { backgroundColor: colors.white, borderRadius: 10, padding: 16, marginBottom: 8 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  typeText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  time: { fontSize: 11, color: colors.textMuted },
  message: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  meta: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
});
