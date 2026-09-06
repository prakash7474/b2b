import { useRoute } from '@react-navigation/native';
import { View, Text, StyleSheet } from 'react-native';
import { useFetch } from '../hooks/useFetch';
import batchService from '../services/batchService';
import Screen from '../components/ui/Screen';
import PredictionResult from '../components/cards/PredictionResult';
import Loading from '../components/ui/Loading';
import EmptyState from '../components/ui/EmptyState';
import { riskColor } from '../utils/helpers';

export default function BatchDetailScreen() {
  const route = useRoute();
  const { id } = route.params as { id: string };
  const { data: spoilage, loading } = useFetch(() => batchService.spoilageRisk(id), [id]);

  if (loading) return <Screen title="Batch"><Loading /></Screen>;
  if (!spoilage) return <Screen title="Batch"><EmptyState message="Could not load batch data." /></Screen>;

  const rc = riskColor(spoilage.mlRiskLabel);

  return (
    <Screen title={`Batch ${spoilage.batchId}`}>
      <View style={styles.infoCard}>
        <Text style={styles.line}>Product: {spoilage.productId}</Text>
        <Text style={styles.line}>Vendor: {spoilage.vendorName} ({spoilage.vendorId})</Text>
        <Text style={styles.line}>Hours Since Mfg: {spoilage.hoursSinceManufacture}h</Text>
        <Text style={styles.line}>Hours to Expiry: {spoilage.hoursToExpiry}h</Text>
        <Text style={styles.line}>Sell-Through Rate: {(spoilage.sellThroughRate * 100).toFixed(0)}%</Text>
      </View>

      <PredictionResult
        title="🤖 ML Spoilage Risk"
        value={spoilage.mlRiskLabel}
        color={rc}
        details={[
          { label: 'Confidence', value: `${spoilage.mlConfidence}%` },
          { label: 'Freshness Score', value: `${(spoilage.freshnessScore * 100).toFixed(0)}%` },
          { label: 'Freshness Risk', value: spoilage.freshnessRisk },
          ...Object.entries(spoilage.mlProbabilities || {}).map(([k, v]) => ({ label: k, value: `${v}%` })),
          { label: 'Data Source', value: spoilage.dataSource },
        ]}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  infoCard: { backgroundColor: '#fff', borderRadius: 10, padding: 20, marginBottom: 16 },
  line: { fontSize: 14, color: '#7F8C8D', marginTop: 4 },
});
