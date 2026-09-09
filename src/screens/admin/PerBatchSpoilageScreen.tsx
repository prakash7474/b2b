import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useBatchStore } from '../../store/batchStore';
import { usePredictionStore } from '../../store/predictionStore';
import { BatchPicker } from '../../components/BatchPicker';
import { RiskBadge } from '../../components/RiskBadge';
import { colors, radius, shadows, spacing } from '../../theme';

const formatPct = (val?: number) => {
  if (val === undefined || val === null) return '0%';
  const num = typeof val === 'number' ? val : parseFloat(String(val)) || 0;
  const pct = num > 1 ? num : num * 100;
  return `${Math.round(pct)}%`;
};

export const PerBatchSpoilageScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const initialBatchId = route.params?.batchId || '';

  const { batches, fetchBatches } = useBatchStore();
  const { fetchBatchSpoilage, batchSpoilage, isLoading, error } = usePredictionStore();

  const [batchId, setBatchId] = useState(initialBatchId);

  useEffect(() => {
    fetchBatches();
  }, []);

  useEffect(() => {
    if (batches.length > 0 && !batchId) {
      setBatchId(batches[0].batch_id);
    }
  }, [batches]);

  useEffect(() => {
    if (batchId) {
      fetchBatchSpoilage(batchId);
    }
  }, [batchId]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerSub}>TELEMETRY & FRESHNESS ML</Text>
        <Text style={styles.title}>Batch Spoilage Risk</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.pickerCard}>
          <BatchPicker
            batches={batches}
            selectedBatchId={batchId}
            onSelect={setBatchId}
            label="Select Batch to Inspect"
          />

          <TouchableOpacity
            style={[styles.checkBtn, isLoading && styles.disabledBtn]}
            onPress={() => batchId && fetchBatchSpoilage(batchId)}
            disabled={isLoading || !batchId}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.textInverse} size="small" />
            ) : (
              <Text style={styles.checkBtnText}>Evaluate Real-Time Spoilage Risk →</Text>
            )}
          </TouchableOpacity>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {batchSpoilage ? (
          <View style={styles.resultCard}>
            <View style={styles.batchHeader}>
              <View>
                <Text style={styles.resultTag}>BATCH TELEMETRY</Text>
                <Text style={styles.batchTitle}>{batchSpoilage.batch_id || (batchSpoilage as any).batchId}</Text>
                <Text style={styles.productText}>{batchSpoilage.product_name || (batchSpoilage as any).productId}</Text>
              </View>
              <RiskBadge risk={batchSpoilage.mlRiskLabel || batchSpoilage.freshnessRisk || (batchSpoilage as any).riskLabel || 'Low'} />
            </View>

            <View style={styles.divider} />

            <View style={styles.mainGrid}>
              <View style={[styles.mainMetric, styles.mainMetricFreshness]}>
                <Text style={styles.metricLabel}>Freshness Index</Text>
                <Text style={[styles.metricNum, { color: colors.greenPrimary }]}>
                  {formatPct(batchSpoilage.freshnessScore)}
                </Text>
              </View>
              <View style={styles.mainMetric}>
                <Text style={styles.metricLabel}>Model Confidence</Text>
                <Text style={styles.metricNum}>
                  {formatPct(batchSpoilage.mlConfidence || (batchSpoilage as any).confidence)}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            <Text style={styles.subHeading}>Lifecycle Progression</Text>
            <View style={styles.statGrid}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Hours Since Mfg</Text>
                <Text style={styles.statVal}>{batchSpoilage.hoursSinceManufacture} hrs</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Est. Expiry In</Text>
                <Text style={[styles.statVal, { color: colors.brownPrimary }]}>
                  {batchSpoilage.hoursToExpiry} hrs
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Sell-Through Rate</Text>
                <Text style={styles.statVal}>{batchSpoilage.sellThroughRate} units/hr</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Assigned Partner</Text>
                <Text style={styles.statVal} numberOfLines={1}>
                  {batchSpoilage.vendor_name || (batchSpoilage as any).vendorName || batchSpoilage.vendor_id || (batchSpoilage as any).vendorId || 'Not Assigned'}
                </Text>
              </View>
            </View>

            {(batchSpoilage.mlProbabilities || (batchSpoilage as any).probabilities) ? (
              <View style={styles.probBox}>
                <Text style={styles.probHeading}>Random Forest Probabilities</Text>
                <View style={styles.probRow}>
                  {Object.entries(batchSpoilage.mlProbabilities || (batchSpoilage as any).probabilities).map(([cls, p]: [string, any]) => (
                    <View key={cls} style={styles.probCol}>
                      <Text style={styles.probVal}>{formatPct(p)}</Text>
                      <Text style={styles.probLbl}>{cls}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm + 4,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  backBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.backgroundAlt,
  },
  backBtnText: {
    color: colors.brownPrimary,
    fontSize: 13,
    fontWeight: '700',
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
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  pickerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  checkBtn: {
    backgroundColor: colors.greenPrimary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.sm,
    ...shadows.soft,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  checkBtnText: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: '700',
  },
  resultCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md + 2,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  batchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  resultTag: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.brownMedium,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  batchTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  productText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  mainGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginVertical: spacing.xs,
  },
  mainMetric: {
    flex: 1,
    backgroundColor: colors.backgroundAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
  },
  mainMetricFreshness: {
    backgroundColor: colors.greenLight,
    borderColor: colors.greenBorder,
  },
  metricNum: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.textPrimary,
    marginTop: 4,
  },
  metricLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.md,
  },
  subHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.brownMedium,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statItem: {
    width: '48%',
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.sm + 2,
    borderRadius: radius.md,
  },
  statLabel: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  statVal: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 3,
  },
  probBox: {
    marginTop: spacing.md,
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
  probCol: {
    flex: 1,
    backgroundColor: colors.backgroundAlt,
    borderRadius: radius.sm,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  probVal: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  probLbl: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: '600',
    marginTop: 2,
    textTransform: 'capitalize',
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
