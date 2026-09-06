import { View, Text } from 'react-native';
import { useFetch } from '../hooks/useFetch';
import predictionService from '../services/predictionService';
import Screen from '../components/ui/Screen';
import PredictionResult from '../components/cards/PredictionResult';
import Loading from '../components/ui/Loading';
import EmptyState from '../components/ui/EmptyState';
import { formatDate, riskColor } from '../utils/helpers';

export default function HistoryScreen() {
  const { data: predictions, loading, error, refetch } = useFetch(() => predictionService.history(50));

  return (
    <Screen title="History" onRefresh={refetch} refreshing={loading}>
      {loading ? <Loading /> : null}
      {error ? <EmptyState message={`Error: ${error}`} /> : null}
      {predictions?.map((p) => {
        const isDemand = p.predictionType === 'DEMAND';
        return (
          <View key={p._id} style={styles.card}>
            <View style={styles.head}>
              <Text style={styles.type}>{isDemand ? '📈 Demand' : '🔬 Spoilage'}</Text>
              <Text style={styles.time}>{formatDate(p.generatedAt)}</Text>
            </View>
            <Text style={[styles.value, { color: isDemand ? '#4A90D9' : riskColor(String(p.predictedValue)) }]}>
              {isDemand ? `${p.predictedValue} units` : String(p.predictedValue)}
            </Text>
            <Text style={styles.meta}>Vendor: {p.vendorId} · Model: {p.modelVersion}</Text>
          </View>
        );
      })}
      {predictions?.length === 0 ? <EmptyState message="No predictions yet." /> : null}
    </Screen>
  );
}

const styles = {
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 16, marginBottom: 8 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  type: { fontSize: 14, fontWeight: '700', color: '#2C3E50' },
  time: { fontSize: 12, color: '#BDC3C7' },
  value: { fontSize: 18, fontWeight: '700', marginTop: 4 },
  meta: { fontSize: 12, color: '#7F8C8D', marginTop: 4 },
} as const;
