import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  Alert,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useVendorStore } from '../../store/vendorStore';
import { usePredictionStore } from '../../store/predictionStore';
import { predictionService } from '../../services/predictionService';
import { VendorPicker } from '../../components/VendorPicker';
import { colors, radius, shadows, spacing } from '../../theme';

const PRODUCTS = ['Idli Batter', 'Dosa Batter', 'Combo Pack'];
const WINDOWS: { label: string; value: 'morning' | 'evening' }[] = [
  { label: 'Morning (6 AM - 11 AM)', value: 'morning' },
  { label: 'Evening (4 PM - 9 PM)', value: 'evening' },
];
const LOCALITIES = [
  { label: 'Residential Budget', value: 'residential_budget' },
  { label: 'Commercial Offices', value: 'commercial_offices' },
  { label: 'Residential Premium', value: 'residential_premium' },
  { label: 'Institutional', value: 'institutional' },
  { label: 'Mixed', value: 'mixed' },
];
const FESTIVALS = [
  { label: 'Regular Day', value: 'none' },
  { label: 'Diwali', value: 'diwali' },
  { label: 'Harvest Festival', value: 'harvestFestival' },
];

export const DemandPredictScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { vendors, fetchVendors } = useVendorStore();
  const { runDemandPrediction, lastDemandResult, isLoading, error } = usePredictionStore();

  const [vendorId, setVendorId] = useState('');
  const [productName, setProductName] = useState('Idli Batter');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [windowSlot, setWindowSlot] = useState<'morning' | 'evening'>('morning');
  const [temperature, setTemperature] = useState('31.0');
  const [rainProb, setRainProb] = useState('0.20');
  const [locality, setLocality] = useState('residential_budget');
  const [festival, setFestival] = useState('none');
  const [hotspot, setHotspot] = useState('33');
  const [availableStock, setAvailableStock] = useState('20');
  const [safetyStock, setSafetyStock] = useState('5');
  const [lag1, setLag1] = useState('18.0');
  const [lag7, setLag7] = useState('17.0');
  const [rolling7dMean, setRolling7dMean] = useState('19.0');
  const [rolling7dStd, setRolling7dStd] = useState('4.0');
  const [sameSlot4wk, setSameSlot4wk] = useState('21.0');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [lastEvaluatedAt, setLastEvaluatedAt] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<'quiet' | 'standard' | 'festival' | null>('standard');
  const [isLoadingDbMetrics, setIsLoadingDbMetrics] = useState(false);

  useEffect(() => {
    fetchVendors();
  }, []);

  useEffect(() => {
    if (vendors.length > 0 && !vendorId) {
      const v = vendors[0];
      setVendorId(v.vendor_id);
      if (v.localityTier) setLocality(v.localityTier);
      if (v.hotspotDensityScore) setHotspot(String(v.hotspotDensityScore));
    }
  }, [vendors]);

  const applyPreset = (preset: 'quiet' | 'standard' | 'festival') => {
    setActivePreset(preset);
    if (preset === 'quiet') {
      setSameSlot4wk('5.0');
      setRolling7dMean('5.5');
      setRolling7dStd('1.0');
      setLag1('5.0');
      setLag7('6.0');
      setLocality('residential_budget');
      setHotspot('15');
      setFestival('none');
      setTemperature('28.0');
      setRainProb('0.80');
      setWindowSlot('morning');
      setAvailableStock('10');
    } else if (preset === 'standard') {
      setSameSlot4wk('21.0');
      setRolling7dMean('19.0');
      setRolling7dStd('4.0');
      setLag1('20.0');
      setLag7('18.0');
      setLocality('residential_budget');
      setHotspot('45');
      setFestival('none');
      setTemperature('31.0');
      setRainProb('0.20');
      setWindowSlot('morning');
      setAvailableStock('20');
    } else {
      setSameSlot4wk('85.0');
      setRolling7dMean('80.0');
      setRolling7dStd('10.0');
      setLag1('85.0');
      setLag7('78.0');
      setLocality('commercial_offices');
      setHotspot('85');
      setFestival('diwali');
      setTemperature('32.0');
      setRainProb('0.05');
      setWindowSlot('morning');
      setAvailableStock('25');
    }
  };

  const handleLoadDbMetrics = async () => {
    if (!vendorId) return;
    try {
      setIsLoadingDbMetrics(true);
      const res = await predictionService.getVendorDemandForecast(vendorId);
      if (res) {
        if (res.availableStock !== undefined) setAvailableStock(String(res.availableStock));
        const lag1Val = res.lag1 ?? res.featuresUsed?.lag1;
        const lag7Val = res.lag7 ?? res.featuresUsed?.lag7;
        const r7mVal = res.rolling7DayMean ?? res.featuresUsed?.rolling_7d_mean;
        const ss4Val = res.sameSlot4WeekMean ?? res.featuresUsed?.same_slot_4wk;
        if (lag1Val !== undefined) setLag1(String(lag1Val));
        if (lag7Val !== undefined) setLag7(String(lag7Val));
        if (r7mVal !== undefined) setRolling7dMean(String(r7mVal));
        if (ss4Val !== undefined) setSameSlot4wk(String(ss4Val));
        if (res.vendor?.localityTier) setLocality(res.vendor.localityTier);
        if (res.vendor?.hotspotDensityScore !== undefined) setHotspot(String(res.vendor.hotspotDensityScore));
        setShowAdvanced(true);
        Alert.alert('Metrics Loaded', `Successfully populated live metrics from MongoDB for vendor ${vendorId}.`);
      }
    } catch (e: any) {
      Alert.alert('Load Error', 'Could not fetch vendor telemetry from database.');
    } finally {
      setIsLoadingDbMetrics(false);
    }
  };

  const handlePredict = async () => {
    if (!vendorId) {
      Alert.alert('Select Vendor', 'Please choose a destination partner shop.');
      return;
    }

    const payload = {
      vendor_id: vendorId,
      product_name: productName,
      date,
      window: windowSlot,
      localityTier: locality,
      festival,
      temperatureC: parseFloat(temperature) || 31.0,
      rainProbability: parseFloat(rainProb) || 0.2,
      hotspotDensityScore: parseFloat(hotspot) || 33,
      available_stock: parseFloat(availableStock) || 0,
      safety_stock: parseFloat(safetyStock) || 5,
      lag_1_demand: parseFloat(lag1) || 18.0,
      lag_7_demand: parseFloat(lag7) || 17.0,
      rolling_7d_mean: parseFloat(rolling7dMean) || 19.0,
      rolling_7d_std: parseFloat(rolling7dStd) || 4.0,
      same_slot_last_4wk_avg: parseFloat(sameSlot4wk) || 21.0,
    };

    const res = await runDemandPrediction(payload);
    if (res) {
      setLastEvaluatedAt(new Date().toLocaleTimeString());
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.headerSub}>MACHINE LEARNING INFERENCE</Text>
          <Text style={styles.title}>Demand Forecast</Text>
        </View>
        <TouchableOpacity
          style={styles.trendsBtn}
          onPress={() => navigation.navigate('PerVendorForecast', { vendorId })}
        >
          <Text style={styles.trendsBtnText}>Weekly Trends →</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Preset Simulator Strip */}
        <View style={styles.presetCard}>
          <Text style={styles.presetHeading}>Quick Test Scenarios (See Model Shift)</Text>
          <View style={styles.presetRow}>
            <TouchableOpacity
              style={[styles.presetBtn, activePreset === 'quiet' && styles.presetBtnActive]}
              onPress={() => applyPreset('quiet')}
              activeOpacity={0.7}
            >
              <Text style={[styles.presetBtnText, activePreset === 'quiet' && styles.presetBtnTextActive]}>
                Quiet Shop (~6.5kg)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.presetBtn, activePreset === 'standard' && styles.presetBtnActive]}
              onPress={() => applyPreset('standard')}
              activeOpacity={0.7}
            >
              <Text style={[styles.presetBtnText, activePreset === 'standard' && styles.presetBtnTextActive]}>
                Standard (~21.6kg)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.presetBtn, activePreset === 'festival' && styles.presetBtnActive]}
              onPress={() => applyPreset('festival')}
              activeOpacity={0.7}
            >
              <Text style={[styles.presetBtnText, activePreset === 'festival' && styles.presetBtnTextActive]}>
                Festival Rush (~104kg)
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Prediction Results Card */}
        {lastDemandResult && (
          <View style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <View>
                <Text style={styles.resultTag}>
                  FORECAST OUTCOME {lastEvaluatedAt ? `• RUN AT ${lastEvaluatedAt}` : ''}
                </Text>
                <Text style={styles.resultTitle}>Optimal Dispatch Recommendation</Text>
              </View>
              <View style={styles.aiBadge}>
                <Text style={styles.aiBadgeText}>ML Model</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.metricGrid}>
              <View style={styles.metricBox}>
                <Text style={styles.metricLbl}>Projected Demand</Text>
                <Text style={styles.metricVal}>
                  {lastDemandResult.predicted_demand_kg?.toFixed(1) ??
                    lastDemandResult.predictedDemand?.toFixed(1) ?? '—'}{' '}
                  <Text style={styles.metricUnit}>kg</Text>
                </Text>
              </View>

              <View style={[styles.metricBox, styles.metricBoxHighlight]}>
                <Text style={[styles.metricLbl, { color: colors.greenDark }]}>Suggested Dispatch</Text>
                <Text style={[styles.metricVal, { color: colors.greenPrimary }]}>
                  {lastDemandResult.recommended_dispatch_kg?.toFixed(1) ??
                    lastDemandResult.recommendedDispatch?.toFixed(1) ?? '—'}{' '}
                  <Text style={styles.metricUnit}>kg</Text>
                </Text>
              </View>
            </View>

            <View style={styles.reorderNotes}>
              <Text style={styles.reorderText}>
                Based on current shop stock ({availableStock} kg) and safety reserve ({safetyStock} kg).
              </Text>
            </View>
          </View>
        )}

        {/* Input Form Card */}
        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>Shop & Product Selection</Text>

          <VendorPicker
            vendors={vendors}
            selectedVendorId={vendorId}
            onSelect={(id) => {
              setVendorId(id);
              const found = vendors.find((v) => v.vendor_id === id);
              if (found?.localityTier) setLocality(found.localityTier);
              if (found?.hotspotDensityScore) setHotspot(String(found.hotspotDensityScore));
            }}
            label="Destination Vendor"
          />

          <TouchableOpacity
            style={styles.loadDbBtn}
            onPress={handleLoadDbMetrics}
            disabled={isLoadingDbMetrics || !vendorId}
            activeOpacity={0.7}
          >
            {isLoadingDbMetrics ? (
              <ActivityIndicator color={colors.brownPrimary} size="small" />
            ) : (
              <Text style={styles.loadDbBtnText}>
                Sync Vendor Live Order History from MongoDB
              </Text>
            )}
          </TouchableOpacity>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Product</Text>
            <View style={styles.chipRow}>
              {PRODUCTS.map((prod) => {
                const active = productName === prod;
                return (
                  <TouchableOpacity
                    key={prod}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setProductName(prod)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {prod}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Meal Service Slot</Text>
            <View style={styles.chipRow}>
              {WINDOWS.map((win) => {
                const active = windowSlot === win.value;
                return (
                  <TouchableOpacity
                    key={win.value}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setWindowSlot(win.value)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {win.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        {/* Environmental & Contextual Parameters */}
        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>Weather & Locality Conditions</Text>

          <View style={styles.formRow}>
            <View style={styles.halfCol}>
              <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                value={date}
                onChangeText={setDate}
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={styles.halfCol}>
              <Text style={styles.label}>Ambient Temp (°C)</Text>
              <TextInput
                style={styles.input}
                value={temperature}
                onChangeText={setTemperature}
                keyboardType="numeric"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          <View style={styles.formRow}>
            <View style={styles.halfCol}>
              <Text style={styles.label}>Rain Probability (0–1)</Text>
              <TextInput
                style={styles.input}
                value={rainProb}
                onChangeText={setRainProb}
                keyboardType="numeric"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={styles.halfCol}>
              <Text style={styles.label}>Special Occasion</Text>
              <View style={styles.chipRow}>
                {FESTIVALS.map((fest) => {
                  const active = festival === fest.value;
                  return (
                    <TouchableOpacity
                      key={fest.value}
                      style={[styles.miniChip, active && styles.miniChipActive]}
                      onPress={() => setFestival(fest.value)}
                    >
                      <Text style={[styles.miniChipText, active && styles.miniChipTextActive]}>
                        {fest.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        </View>

        {/* Current Stock Input */}
        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>Current Shop Inventory</Text>
          <View style={styles.formRow}>
            <View style={styles.halfCol}>
              <Text style={styles.label}>Vendor's Stock (kg)</Text>
              <TextInput
                style={styles.input}
                value={availableStock}
                onChangeText={setAvailableStock}
                keyboardType="numeric"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={styles.halfCol}>
              <Text style={styles.label}>Safety Buffer (kg)</Text>
              <TextInput
                style={styles.input}
                value={safetyStock}
                onChangeText={setSafetyStock}
                keyboardType="numeric"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          {/* Toggle for Advanced Historical Factors */}
          <TouchableOpacity
            style={styles.toggleAdvBtn}
            onPress={() => setShowAdvanced(!showAdvanced)}
          >
            <Text style={styles.toggleAdvText}>
              {showAdvanced ? '▴ Hide Historical Time-Series Lags' : '▾ Edit Historical Time-Series Lags'}
            </Text>
          </TouchableOpacity>

          {showAdvanced && (
            <View style={styles.advancedBox}>
              <View style={styles.formRow}>
                <View style={styles.halfCol}>
                  <Text style={styles.label}>Lag 1d (kg)</Text>
                  <TextInput
                    style={styles.input}
                    value={lag1}
                    onChangeText={setLag1}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.halfCol}>
                  <Text style={styles.label}>Lag 7d (kg)</Text>
                  <TextInput
                    style={styles.input}
                    value={lag7}
                    onChangeText={setLag7}
                    keyboardType="numeric"
                  />
                </View>
              </View>
              <View style={styles.formRow}>
                <View style={styles.halfCol}>
                  <Text style={styles.label}>Rolling 7d Mean</Text>
                  <TextInput
                    style={styles.input}
                    value={rolling7dMean}
                    onChangeText={setRolling7dMean}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.halfCol}>
                  <Text style={styles.label}>4-Wk Slot Avg</Text>
                  <TextInput
                    style={styles.input}
                    value={sameSlot4wk}
                    onChangeText={setSameSlot4wk}
                    keyboardType="numeric"
                  />
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Submit Prediction */}
        <TouchableOpacity
          style={[styles.predictBtn, isLoading && styles.predictBtnDisabled]}
          onPress={handlePredict}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={styles.predictBtnText}>Generate Machine Learning Forecast →</Text>
          )}
        </TouchableOpacity>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'android' ? spacing.md : spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  headerSub: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: colors.brownPrimary,
    marginBottom: 2,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  trendsBtn: {
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  trendsBtnText: {
    color: colors.brownDark,
    fontSize: 12,
    fontWeight: '700',
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  resultCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.greenBorder,
    borderLeftWidth: 5,
    borderLeftColor: colors.greenPrimary,
    ...shadows.soft,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  resultTag: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: colors.greenDark,
    marginBottom: 2,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  aiBadge: {
    backgroundColor: colors.greenLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  aiBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.greenDark,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.sm + 2,
  },
  metricGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  metricBox: {
    flex: 1,
    backgroundColor: colors.backgroundAlt,
    padding: spacing.sm + 4,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  metricBoxHighlight: {
    backgroundColor: colors.greenLight,
    borderColor: colors.greenBorder,
    borderWidth: 1,
  },
  metricLbl: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 2,
  },
  metricVal: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  metricUnit: {
    fontSize: 14,
    fontWeight: '500',
  },
  reorderNotes: {
    marginTop: spacing.xs,
  },
  reorderText: {
    fontSize: 11.5,
    color: colors.textMuted,
    textAlign: 'center',
  },
  presetCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: spacing.md,
    ...shadows.soft,
  },
  presetHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.brownPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs + 2,
  },
  presetRow: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
  },
  presetBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetBtnActive: {
    backgroundColor: colors.greenLight,
    borderColor: colors.greenPrimary,
  },
  presetBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  presetBtnTextActive: {
    color: colors.textPrimary,
    fontWeight: '800',
  },
  loadDbBtn: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.brownBorder,
    borderRadius: radius.sm + 2,
    paddingVertical: 9,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -4,
    marginBottom: spacing.md,
  },
  loadDbBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brownPrimary,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.soft,
  },
  cardSectionTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.brownPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.md,
  },
  formGroup: {
    marginBottom: spacing.md,
  },
  formRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  halfCol: {
    flex: 1,
  },
  label: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  chipActive: {
    backgroundColor: colors.greenLight,
    borderColor: colors.greenBorder,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.greenDark,
    fontWeight: '700',
  },
  miniChip: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  miniChipActive: {
    backgroundColor: colors.brownLight,
    borderColor: colors.brownBorder,
  },
  miniChipText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  miniChipTextActive: {
    color: colors.brownDark,
    fontWeight: '700',
  },
  toggleAdvBtn: {
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  toggleAdvText: {
    fontSize: 11.5,
    color: colors.brownPrimary,
    fontWeight: '700',
  },
  advancedBox: {
    backgroundColor: colors.backgroundAlt,
    padding: spacing.md,
    borderRadius: radius.sm,
    marginTop: spacing.sm,
  },
  predictBtn: {
    backgroundColor: colors.greenPrimary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.xs,
    ...shadows.soft,
  },
  predictBtnDisabled: {
    opacity: 0.6,
  },
  predictBtnText: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  errorText: {
    marginTop: spacing.sm,
    color: colors.statusAttention,
    textAlign: 'center',
    fontSize: 12.5,
  },
});
