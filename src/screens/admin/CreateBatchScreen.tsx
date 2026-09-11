import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useBatchStore } from '../../store/batchStore';
import { colors, radius, shadows, spacing } from '../../theme';

const PRODUCTS = ['Idli Batter', 'Dosa Batter', 'Combo Pack', 'Rava Batter'];

export const CreateBatchScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { addBatch, isLoading } = useBatchStore();

  const [batchId, setBatchId] = useState(`B${Math.floor(10000 + Math.random() * 90000)}`);
  const [productName, setProductName] = useState('Idli Batter');
  const [manufacturer, setManufacturer] = useState('B2P Central Kitchen');
  const [batchNumber, setBatchNumber] = useState('');
  const [volumeKg, setVolumeKg] = useState('15.0');
  const [initialPH, setInitialPH] = useState('4.40');
  const [temperatureC, setTemperatureC] = useState('26.5');
  const [humidityPct, setHumidityPct] = useState('58');
  const [fermentationHours, setFermentationHours] = useState('8.0');
  const [notes, setNotes] = useState('');

  const handleSubmit = async () => {
    if (!batchId.trim()) {
      Alert.alert('Missing Field', 'Batch ID is required.');
      return;
    }

    const payload = {
      batch_id: batchId.trim().toUpperCase(),
      product_name: productName,
      manufacturer: manufacturer.trim(),
      batch_number: batchNumber.trim() || batchId.trim().toUpperCase(),
      volume_kg: parseFloat(volumeKg) || 15.0,
      initialPH: parseFloat(initialPH) || 4.4,
      temperatureC: parseFloat(temperatureC) || 26.5,
      humidityPct: parseFloat(humidityPct) || 58.0,
      fermentationHours: parseFloat(fermentationHours) || 8.0,
      notes: notes.trim() || undefined,
    };

    const ok = await addBatch(payload);
    if (ok) {
      Alert.alert('Batch Created', `Batch ${payload.batch_id} registered into central inventory!`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } else {
      Alert.alert('Error', 'Failed to create batch.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Product Selection */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>Batter Recipe & Type</Text>

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

        {/* Basic Batch Identifiers */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>Batch Identifiers</Text>

          <View style={styles.formRow}>
            <View style={styles.halfCol}>
              <Text style={styles.label}>Batch ID *</Text>
              <TextInput
                style={styles.input}
                value={batchId}
                onChangeText={setBatchId}
                placeholder="e.g. B20005"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
              />
            </View>

            <View style={styles.halfCol}>
              <Text style={styles.label}>Lot / Batch No.</Text>
              <TextInput
                style={styles.input}
                value={batchNumber}
                onChangeText={setBatchNumber}
                placeholder={batchId}
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Facility / Kitchen Name</Text>
            <TextInput
              style={styles.input}
              value={manufacturer}
              onChangeText={setManufacturer}
              placeholder="e.g. B2P Central Kitchen"
              placeholderTextColor={colors.textMuted}
            />
          </View>
        </View>

        {/* Physical & Fermentation Telemetry */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>Production Telemetry</Text>

          <View style={styles.formRow}>
            <View style={styles.halfCol}>
              <Text style={styles.label}>Total Volume (kg)</Text>
              <TextInput
                style={styles.input}
                value={volumeKg}
                onChangeText={setVolumeKg}
                placeholder="15.0"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.halfCol}>
              <Text style={styles.label}>Initial pH Level</Text>
              <TextInput
                style={styles.input}
                value={initialPH}
                onChangeText={setInitialPH}
                placeholder="4.40"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={styles.formRow}>
            <View style={styles.halfCol}>
              <Text style={styles.label}>Storage Temp (°C)</Text>
              <TextInput
                style={styles.input}
                value={temperatureC}
                onChangeText={setTemperatureC}
                placeholder="26.5"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.halfCol}>
              <Text style={styles.label}>Fermentation (hrs)</Text>
              <TextInput
                style={styles.input}
                value={fermentationHours}
                onChangeText={setFermentationHours}
                placeholder="8.0"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Storage Humidity (%)</Text>
            <TextInput
              style={styles.input}
              value={humidityPct}
              onChangeText={setHumidityPct}
              placeholder="58"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Kitchen Notes / Grain Ratio</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. 4:1 Ponni rice to Urad dal. Ground in stone wet grinder."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={2}
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, isLoading && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={styles.submitBtnText}>Produce & Log Batter Batch</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
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
  sectionHeader: {
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
  textArea: {
    minHeight: 65,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
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
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.greenDark,
    fontWeight: '800',
  },
  submitBtn: {
    backgroundColor: colors.greenPrimary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.xs,
    ...shadows.soft,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: colors.textInverse,
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
