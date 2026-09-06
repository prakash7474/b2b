import { useState, type ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import predictionService from '../services/predictionService';
import Screen from '../components/ui/Screen';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import PredictionResult from '../components/cards/PredictionResult';
import { riskColor } from '../utils/helpers';

const NUMERIC_KEYS = [
  'initialPH', 'hoursSinceManufacture', 'hasRefrigerator', 'ambientTemperatureC', 'humidityPct',
  'fridgeTemperatureC', 'hoursOnShelf', 'sellThroughRate', 'hoursToExpiry', 'volumeKg', 'vendorRating',
];

type Form = Record<string, string>;

const INITIAL: Form = {
  vendor_id: 'V100',
  batch_id: 'B20000',
  product_id: 'Idly_Batter',
  initialPH: '4.4',
  hoursSinceManufacture: '48',
  hasRefrigerator: '1',
  storageType: 'counter',
  ambientTemperatureC: '30',
  humidityPct: '65',
  fridgeTemperatureC: '4',
  hoursOnShelf: '24',
  sellThroughRate: '0.5',
  hoursToExpiry: '120',
  volumeKg: '1',
  vendorRating: '4.0',
};

interface SpoilageResult {
  riskLabel: string;
  confidence: number;
  probabilities: Record<string, number>;
  vendorId: string;
  batchId: string;
  productId: string;
}

export default function SpoilageRiskScreen() {
  const [form, setForm] = useState<Form>(INITIAL);
  const [result, setResult] = useState<SpoilageResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const update = (key: string) => (text: string) => setForm((f) => ({ ...f, [key]: text }));

  const predict = async () => {
    setLoading(true);
    setError('');
    try {
      const numeric: Record<string, number> = {};
      NUMERIC_KEYS.forEach((k) => (numeric[k] = parseFloat(form[k]) || 0));
      const res = await predictionService.predictSpoilage({ ...form, ...numeric } as any);
      setResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Prediction failed');
    } finally {
      setLoading(false);
    }
  };

  const fields: ReactNode[] = Object.entries(form).map(([key, val]) => (
    <View key={key} style={styles.field}>
      <Input label={key} value={val} onChangeText={update(key)} />
    </View>
  ));

  return (
    <Screen title="Spoilage Risk">
      <View style={styles.row}>{fields}</View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button label={loading ? 'Predicting...' : '🔬 Predict Risk'} onPress={predict} loading={loading} variant="danger" />

      {result ? (
        <PredictionResult
          title="🤖 Spoilage Risk Assessment"
          value={result.riskLabel}
          color={riskColor(result.riskLabel)}
          details={[
            { label: 'Confidence', value: `${result.confidence}%` },
            { label: 'Vendor', value: result.vendorId },
            { label: 'Batch', value: result.batchId },
            ...Object.entries(result.probabilities || {}).map(([k, v]) => ({ label: k, value: `${v}%` })),
          ]}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  field: { width: '48%' },
  error: { color: '#E74C3C', fontSize: 13, marginTop: 8 },
});
