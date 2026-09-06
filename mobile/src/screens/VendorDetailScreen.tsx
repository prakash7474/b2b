import { useRoute } from '@react-navigation/native';
import { View, Text, StyleSheet } from 'react-native';
import { useFetch } from '../hooks/useFetch';
import vendorService from '../services/vendorService';
import Screen from '../components/ui/Screen';
import PredictionResult from '../components/cards/PredictionResult';
import Loading from '../components/ui/Loading';
import EmptyState from '../components/ui/EmptyState';
import { colors } from '../theme';

export default function VendorDetailScreen() {
  const route = useRoute();
  const { id } = route.params as { id: string };

  const { data: vendor, loading } = useFetch(() => vendorService.get(id), [id]);
  const { data: forecast } = useFetch(() => vendorService.demandForecast(id), [id]);

  if (loading) return <Screen title="Vendor"><Loading /></Screen>;
  if (!vendor) return <Screen title="Vendor"><EmptyState message="Vendor not found." /></Screen>;

  return (
    <Screen title={vendor.shop_name}>
      <View style={styles.infoCard}>
        <Text style={styles.id}>ID: {vendor.vendor_id}</Text>
        <Text style={styles.line}>👤 Owner: {vendor.owner_name}</Text>
        <Text style={styles.line}>📞 {vendor.phone}</Text>
        <Text style={styles.line}>📍 {vendor.address}</Text>
        <Text style={styles.line}>⭐ Rating: {vendor.rating}</Text>
        <Text style={styles.line}>🏘️ Locality: {vendor.localityTier}</Text>
        <Text style={styles.line}>🌡️ Storage: {vendor.storageType} · Fridge: {vendor.fridgeTemperatureC}°C</Text>
      </View>

      {forecast ? (
        <PredictionResult
          title="🤖 ML Demand Forecast"
          value={`${forecast.predictedDemand} units`}
          color={colors.primary}
          details={[
            { label: 'Recommended Dispatch', value: `${forecast.recommendedDispatch} units` },
            { label: 'Current Stock', value: forecast.currentStock },
            { label: 'Rolling 7-Day Mean', value: forecast.rolling7DayMean },
            { label: 'Recent Trend', value: forecast.recentTrend?.toFixed(2) ?? '—' },
            { label: 'Data Source', value: forecast.dataSource },
          ]}
        />
      ) : null}

      {vendor.batches && vendor.batches.length > 0 ? (
        <View style={styles.batchCard}>
          <Text style={styles.batchTitle}>📦 Batches ({vendor.batches.length})</Text>
          {vendor.batches.map((b) => (
            <View key={b.batch_id} style={styles.batchRow}>
              <Text style={styles.batchId}>{b.batch_id}</Text>
              <Text style={[styles.batchStatus, { color: b.status === 'received' ? colors.success : colors.warning }]}>
                {b.status}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  infoCard: { backgroundColor: colors.white, borderRadius: 10, padding: 20, marginBottom: 16 },
  id: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  line: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
  batchCard: { backgroundColor: colors.white, borderRadius: 10, padding: 20 },
  batchTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
  batchRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  batchId: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  batchStatus: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
});
