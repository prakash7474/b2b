import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  ActivityIndicator,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useVendorStore } from '../../store/vendorStore';
import { usePredictionStore } from '../../store/predictionStore';
import { VendorPicker } from '../../components/VendorPicker';
import { RiskBadge } from '../../components/RiskBadge';
import { colors, radius, shadows, spacing } from '../../theme';

const PRODUCTS = ['Idli Batter', 'Dosa Batter', 'Combo Pack'];
const STORAGE_TYPES = [
  { label: 'Refrigerated', value: 'refrigerated' },
  { label: 'Ambient Cool', value: 'ambient_cool' },
  { label: 'Room Temp', value: 'room_temp' },
];

const formatPct = (val?: number) => {
  if (val === undefined || val === null) return '0%';
  const num = typeof val === 'number' ? val : parseFloat(String(val)) || 0;
  const pct = num > 1 ? num : num * 100;
  return `${Math.round(pct)}%`;
};

export const SpoilagePredictScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { vendors, fetchVendors } = useVendorStore();
  const { runSpoilagePrediction, lastSpoilageResult, isLoading, error } = usePredictionStore();

  const [vendorId, setVendorId] = useState('');
  const [batchId, setBatchId] = useState('B20010_FRESH');
  const [productName, setProductName] = useState('Idli Batter');
  const [initialPH, setInitialPH] = useState('5.80');
  const [hoursSinceMfg, setHoursSinceMfg] = useState('6');
  const [hasFridge, setHasFridge] = useState(true);
  const [storageType, setStorageType] = useState('refrigerated');
  const [ambientTemp, setAmbientTemp] = useState('30.0');
  const [humidity, setHumidity] = useState('65');
  const [fridgeTemp, setFridgeTemp] = useState('4.0');
  const [hoursOnShelf, setHoursOnShelf] = useState('2');
  const [sellThroughRate, setSellThroughRate] = useState('1.2');
  const [hoursToExpiry, setHoursToExpiry] = useState('66');
  const [volumeKg, setVolumeKg] = useState('5.0');
  const [vendorRating, setVendorRating] = useState('4.5');
  const [lastEvaluatedAt, setLastEvaluatedAt] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<'fresh' | 'mid' | 'spoiled' | null>('fresh');

  useEffect(() => {
    fetchVendors();
  }, []);

  const handleSelectVendor = (selectedId: string) => {
    setVendorId(selectedId);
    const v = vendors.find((item) => item.vendor_id === selectedId);
    if (v) {
      if (v.hasRefrigerator !== undefined) setHasFridge(!!v.hasRefrigerator);
      if (v.storageType) {
        setStorageType(v.storageType === 'fridge' ? 'refrigerated' : v.storageType);
      }
      if (v.rating !== undefined) setVendorRating(String(v.rating));
      if (v.fridgeTemperatureC !== undefined) setFridgeTemp(String(v.fridgeTemperatureC));
    }
  };

  useEffect(() => {
    if (vendors.length > 0 && !vendorId) {
      handleSelectVendor(vendors[0].vendor_id);
    }
  }, [vendors]);

  const applyPreset = (type: 'fresh' | 'mid' | 'spoiled') => {
    setActivePreset(type);
    if (type === 'fresh') {
      setInitialPH('6.00');
      setHoursSinceMfg('4');
      setHoursOnShelf('2');
      setHasFridge(true);
      setStorageType('refrigerated');
      setFridgeTemp('4.0');
      setAmbientTemp('28.0');
      setHoursToExpiry('68');
      setSellThroughRate('1.2');
    } else if (type === 'mid') {
      setInitialPH('5.20');
      setHoursSinceMfg('24');
      setHoursOnShelf('12');
      setHasFridge(true);
      setStorageType('refrigerated');
      setFridgeTemp('4.0');
      setAmbientTemp('30.0');
      setHoursToExpiry('48');
      setSellThroughRate('0.8');
    } else {
      setInitialPH('4.20');
      setHoursSinceMfg('48');
      setHoursOnShelf('24');
      setHasFridge(false);
      setStorageType('room_temp');
      setFridgeTemp('-1.0');
      setAmbientTemp('33.0');
      setHoursToExpiry('0');
      setSellThroughRate('0.2');
    }
  };

  const handlePredict = async () => {
    if (!vendorId) {
      Alert.alert('Selection Error', 'Please select a vendor.');
      return;
    }

    const payload = {
      vendor_id: vendorId,
      batch_id: batchId.trim(),
      product_name: productName,
      initialPH: parseFloat(initialPH) || 5.8,
      hoursSinceManufacture: parseFloat(hoursSinceMfg) || 6,
      hasRefrigerator: hasFridge,
      storageType,
      ambientTemperatureC: parseFloat(ambientTemp) || 30,
      humidityPct: parseFloat(humidity) || 65,
      fridgeTemperatureC: hasFridge ? parseFloat(fridgeTemp) || 4 : undefined,
      hoursOnShelf: parseFloat(hoursOnShelf) || 2,
      sellThroughRate: parseFloat(sellThroughRate) || 1.2,
      hoursToExpiry: parseFloat(hoursToExpiry) || 66,
      volumeKg: parseFloat(volumeKg) || 5.0,
      vendorRating: parseFloat(vendorRating) || 4.5,
    };

    const res = await runSpoilagePrediction(payload);
    if (res) {
      setLastEvaluatedAt(new Date().toLocaleTimeString());
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.headerSub}>BIOCHEMICAL & SENSOR ML</Text>
          <Text style={styles.title}>Spoilage Risk Model</Text>
        </View>
        <TouchableOpacity
          style={styles.batchBtn}
          onPress={() => navigation.navigate('PerBatchSpoilage', { batchId })}
          activeOpacity={0.7}
        >
          <Text style={styles.batchBtnText}>Batch Telemetry →</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Preset Simulator Strip */}
        <View style={styles.presetCard}>
          <Text style={styles.presetHeading}>Quick Test Scenarios (See Model Shift)</Text>
          <View style={styles.presetRow}>
            <TouchableOpacity
              style={[styles.presetBtn, activePreset === 'fresh' && styles.presetBtnActiveGreen]}
              onPress={() => applyPreset('fresh')}
              activeOpacity={0.7}
            >
              <Text style={[styles.presetBtnText, activePreset === 'fresh' && styles.presetBtnTextActive]}>
                Fresh (4h, pH 6.0)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.presetBtn, activePreset === 'mid' && styles.presetBtnActiveYellow]}
              onPress={() => applyPreset('mid')}
              activeOpacity={0.7}
            >
              <Text style={[styles.presetBtnText, activePreset === 'mid' && styles.presetBtnTextActive]}>
                Mid (24h, pH 5.2)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.presetBtn, activePreset === 'spoiled' && styles.presetBtnActiveRed]}
              onPress={() => applyPreset('spoiled')}
              activeOpacity={0.7}
            >
              <Text style={[styles.presetBtnText, activePreset === 'spoiled' && styles.presetBtnTextActive]}>
                Aged (48h, pH 4.2)
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {lastSpoilageResult ? (
          <View style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <View>
                <Text style={styles.resultSub}>
                  INSPECTION ASSESSMENT {lastEvaluatedAt ? `• RUN AT ${lastEvaluatedAt}` : ''}
                </Text>
                <Text style={styles.resultHeading}>Spoilage Evaluation</Text>
              </View>
              <RiskBadge risk={lastSpoilageResult.riskLabel} />
            </View>

            <View style={styles.divider} />

            <View style={styles.resultGrid}>
              <View style={styles.resultItem}>
                <Text style={styles.resultVal}>
                  {formatPct(lastSpoilageResult.confidence)}
                </Text>
                <Text style={styles.resultLbl}>Model Confidence</Text>
              </View>
              {lastSpoilageResult.freshnessScore !== undefined ? (
                <View style={[styles.resultItem, styles.resultItemHighlight]}>
                  <Text style={[styles.resultVal, { color: colors.greenPrimary }]}>
                    {formatPct(lastSpoilageResult.freshnessScore)}
                  </Text>
                  <Text style={[styles.resultLbl, { color: colors.greenDark }]}>Freshness Index</Text>
                </View>
              ) : null}
            </View>

            {lastSpoilageResult.probabilities ? (
              <View style={styles.probSection}>
                <Text style={styles.probHeading}>Class Probabilities</Text>
                <View style={styles.probRow}>
                  {Object.entries(lastSpoilageResult.probabilities).map(([k, v]) => (
                    <View key={k} style={styles.probPill}>
                      <Text style={styles.probClass}>{k}</Text>
                      <Text style={styles.probText}>{formatPct(v)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>1. Target Vendor & Product</Text>
          <VendorPicker
            vendors={vendors}
            selectedVendorId={vendorId}
            onSelect={handleSelectVendor}
          />

          <View style={styles.row}>
            <View style={[styles.formGroup, styles.halfCol]}>
              <Text style={styles.label}>Batch ID</Text>
              <TextInput
                style={styles.input}
                value={batchId}
                onChangeText={setBatchId}
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={[styles.formGroup, styles.halfCol]}>
              <Text style={styles.label}>Volume (kg)</Text>
              <TextInput
                style={styles.input}
                value={volumeKg}
                onChangeText={setVolumeKg}
                keyboardType="numeric"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Product Type</Text>
            <View style={styles.chipRow}>
              {PRODUCTS.map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.chip, productName === p && styles.chipActive]}
                  onPress={() => setProductName(p)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, productName === p && styles.chipTextActive]}>
                    {p}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.formDivider} />

          <Text style={styles.sectionTitle}>2. Biochemical & Age Factors</Text>
          <View style={styles.row}>
            <View style={[styles.formGroup, styles.halfCol]}>
              <Text style={styles.label}>Initial pH</Text>
              <TextInput
                style={styles.input}
                value={initialPH}
                onChangeText={setInitialPH}
                keyboardType="numeric"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={[styles.formGroup, styles.halfCol]}>
              <Text style={styles.label}>Hours Since Mfg</Text>
              <TextInput
                style={styles.input}
                value={hoursSinceMfg}
                onChangeText={setHoursSinceMfg}
                keyboardType="numeric"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={[styles.formGroup, styles.halfCol]}>
              <Text style={styles.label}>Hours on Shelf</Text>
              <TextInput
                style={styles.input}
                value={hoursOnShelf}
                onChangeText={setHoursOnShelf}
                keyboardType="numeric"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={[styles.formGroup, styles.halfCol]}>
              <Text style={styles.label}>Hours to Expiry</Text>
              <TextInput
                style={styles.input}
                value={hoursToExpiry}
                onChangeText={setHoursToExpiry}
                keyboardType="numeric"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          <View style={styles.formDivider} />

          <Text style={styles.sectionTitle}>3. Storage & Environment</Text>
          <View style={styles.switchRow}>
            <View>
              <Text style={styles.switchLabel}>Cold Chain Active</Text>
              <Text style={styles.switchSub}>Vendor has dedicated refrigeration</Text>
            </View>
            <Switch
              value={hasFridge}
              onValueChange={setHasFridge}
              trackColor={{ false: colors.border, true: colors.greenBorder }}
              thumbColor={hasFridge ? colors.greenPrimary : colors.surface}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Storage Condition</Text>
            <View style={styles.chipRow}>
              {STORAGE_TYPES.map((st) => (
                <TouchableOpacity
                  key={st.value}
                  style={[styles.chip, storageType === st.value && styles.chipActive]}
                  onPress={() => setStorageType(st.value)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.chipText,
                      storageType === st.value && styles.chipTextActive,
                    ]}
                  >
                    {st.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.row}>
            <View style={[styles.formGroup, styles.halfCol]}>
              <Text style={styles.label}>Ambient Temp (°C)</Text>
              <TextInput
                style={styles.input}
                value={ambientTemp}
                onChangeText={setAmbientTemp}
                keyboardType="numeric"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={[styles.formGroup, styles.halfCol]}>
              <Text style={styles.label}>Humidity (%)</Text>
              <TextInput
                style={styles.input}
                value={humidity}
                onChangeText={setHumidity}
                keyboardType="numeric"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          {hasFridge ? (
            <View style={styles.formGroup}>
              <Text style={styles.label}>Fridge Temp (°C)</Text>
              <TextInput
                style={styles.input}
                value={fridgeTemp}
                onChangeText={setFridgeTemp}
                keyboardType="numeric"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          ) : null}

          <View style={styles.row}>
            <View style={[styles.formGroup, styles.halfCol]}>
              <Text style={styles.label}>Sell-Through Rate</Text>
              <TextInput
                style={styles.input}
                value={sellThroughRate}
                onChangeText={setSellThroughRate}
                keyboardType="numeric"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={[styles.formGroup, styles.halfCol]}>
              <Text style={styles.label}>Vendor Rating</Text>
              <TextInput
                style={styles.input}
                value={vendorRating}
                onChangeText={setVendorRating}
                keyboardType="numeric"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, isLoading && styles.submitBtnDisabled]}
            onPress={handlePredict}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.textInverse} size="small" />
            ) : (
              <Text style={styles.submitBtnText}>Run Spoilage Risk Evaluation →</Text>
            )}
          </TouchableOpacity>
        </View>
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
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm + 4,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  headerSub: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.brownMedium,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  batchBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  batchBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brownPrimary,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  presetCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: spacing.md,
    ...shadows.card,
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
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetBtnActiveGreen: {
    backgroundColor: colors.greenLight,
    borderColor: colors.greenPrimary,
  },
  presetBtnActiveYellow: {
    backgroundColor: '#FEF9C3',
    borderColor: '#CA8A04',
  },
  presetBtnActiveRed: {
    backgroundColor: '#FEE2E2',
    borderColor: '#DC2626',
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.card,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.brownPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  formDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.md,
  },
  formGroup: {
    marginBottom: spacing.sm + 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  chipActive: {
    backgroundColor: colors.brownPrimary,
    borderColor: colors.brownPrimary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.textInverse,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  halfCol: {
    flex: 1,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.backgroundAlt,
    padding: spacing.sm + 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: spacing.sm + 4,
  },
  switchLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  switchSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  submitBtn: {
    backgroundColor: colors.greenPrimary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.md,
    ...shadows.soft,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: colors.textInverse,
    fontSize: 15,
    fontWeight: '700',
  },
  resultCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  resultSub: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.brownMedium,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  resultHeading: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.sm + 4,
  },
  resultGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  resultItem: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.backgroundAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  resultItemHighlight: {
    backgroundColor: colors.greenLight,
    borderColor: colors.greenBorder,
  },
  resultVal: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  resultLbl: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 4,
  },
  probSection: {
    marginTop: spacing.sm + 4,
    paddingTop: spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  probHeading: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.xs + 2,
  },
  probRow: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
  },
  probPill: {
    flex: 1,
    backgroundColor: colors.backgroundAlt,
    borderRadius: radius.sm,
    paddingVertical: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  probClass: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  probText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 2,
  },
  errorBox: {
    backgroundColor: colors.statusAttentionBg,
    borderWidth: 1,
    borderColor: colors.statusAttentionBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    color: colors.statusAttention,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
