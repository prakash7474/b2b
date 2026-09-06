import { useState, type ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import predictionService from '../services/predictionService';
import Screen from '../components/ui/Screen';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import PredictionResult from '../components/cards/PredictionResult';
import { colors } from '../theme';

const NUMERIC_KEYS = [
  'temperature', 'rainProbability', 'hotspotDensityScore', 'availableStock', 'safetyStock',
  'lag1', 'lag7', 'rolling7DayMean', 'rolling7DayStd', 'rolling28DayMean', 'sameSlot4WeekMean',
];

type Form = Record<string, string>;

const INITIAL: Form = {
  vendor_id: 'V100',
  product_id: 'Idly_Batter',
  date: new Date().toISOString().slice(0, 10),
  window: 'morning',
  temperature: '30',
  rainProbability: '0.2',
  localityTier: 'residential_budget',
  festivalType: 'none',
  hotspotDensityScore: '30',
  availableStock: '20',
  safetyStock: '5',
  lag1: '20',
  lag7: '18',
  rolling7DayMean: '19',
  rolling7DayStd: '4',
  rolling28DayMean: '20',
  sameSlot4WeekMean: '21',
};

export default function DemandForecastScreen() {
  const [form, setForm] = useState<Form>(INITIAL);
  const [result, setResult] = useState<null | { predictedDemand: number; recommendedDispatch: number; vendorId: string; productId: string }>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const update = (key: string) => (text: string) => setForm((f) => ({ ...f, [key]: text }));

  const predict = async () => {
    setLoading(true);
    setError('');
    try {
      const numeric: Record<string, number> = {};
      NUMERIC_KEYS.forEach((k) => (numeric[k] = parseFloat(form[k]) || 0));
      const res = await predictionService.predictDemand({ ...form, ...numeric } as any);
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
    <Screen title="Demand Forecast">
      <View style={styles.row}>{fields}</View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button label={loading ? 'Predicting...' : '🔮 Predict'} onPress={predict} loading={loading} />

      {result ? (
        <PredictionResult
          title="🤖 Predicted Demand"
          value={`${result.predictedDemand} units`}
          color={colors.primary}
          details={[
            { label: 'Recommended Dispatch', value: `${result.recommendedDispatch} units` },
            { label: 'Vendor', value: result.vendorId },
            { label: 'Product', value: result.productId },
          ]}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  field: { width: '48%' },
  error: { color: colors.danger, fontSize: 13, marginTop: 8 },
});
