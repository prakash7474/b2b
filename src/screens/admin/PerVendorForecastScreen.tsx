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
import { useVendorStore } from '../../store/vendorStore';
import { usePredictionStore } from '../../store/predictionStore';
import { VendorPicker } from '../../components/VendorPicker';
import { colors, radius, shadows, spacing } from '../../theme';

export const PerVendorForecastScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const initialVendorId = route.params?.vendorId || '';

  const { vendors, fetchVendors } = useVendorStore();
  const { fetchVendorForecast, vendorForecast, isLoading, error } = usePredictionStore();

  const [vendorId, setVendorId] = useState(initialVendorId);

  useEffect(() => {
    fetchVendors();
  }, []);

  useEffect(() => {
    if (vendors.length > 0 && !vendorId) {
      setVendorId(vendors[0].vendor_id);
    }
  }, [vendors]);

  const handleRunForecast = () => {
    if (vendorId) {
      fetchVendorForecast(vendorId);
    }
  };

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
        <Text style={styles.headerSub}>AUTOMATED DEMAND FORECAST</Text>
        <Text style={styles.title}>Per-Vendor Auto Forecast</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.pickerCard}>
          <VendorPicker
            vendors={vendors}
            selectedVendorId={vendorId}
            onSelect={setVendorId}
            label="Select Vendor to Forecast"
          />

          <TouchableOpacity
            style={[styles.forecastBtn, isLoading && styles.disabledBtn]}
            onPress={handleRunForecast}
            disabled={isLoading || !vendorId}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.textInverse} size="small" />
            ) : (
              <Text style={styles.forecastBtnText}>Compute Forecast from Real Orders →</Text>
            )}
          </TouchableOpacity>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {vendorForecast ? (
          <View style={styles.resultCard}>
            <View style={styles.vendorHeader}>
              <View style={styles.shopMeta}>
                <Text style={styles.resultTag}>FORECAST OUTCOME</Text>
                <Text style={styles.shopName}>
                  {vendorForecast.vendor?.shop_name || (vendorForecast as any).shopName || 'Partner Outlet'}
                </Text>
              </View>
              <View style={styles.productBadge}>
                <Text style={styles.productBadgeText}>{vendorForecast.product || 'Idli Batter'}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.mainMetricsRow}>
              <View style={styles.metricBox}>
                <Text style={styles.metricLbl}>Predicted Demand</Text>
                <Text style={styles.metricVal}>
                  {vendorForecast.predictedDemand} <Text style={styles.metricUnit}>units</Text>
                </Text>
              </View>
              <View style={[styles.metricBox, styles.metricBoxHighlight]}>
                <Text style={[styles.metricLbl, { color: colors.greenDark }]}>
                  Recommended Dispatch
                </Text>
                <Text style={[styles.metricVal, { color: colors.greenPrimary }]}>
                  {vendorForecast.recommendedDispatch} <Text style={[styles.metricUnit, { color: colors.greenPrimary }]}>kg</Text>
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            <Text style={styles.subHeading}>Inventory Context</Text>
            <View style={styles.stockRow}>
              <View style={styles.stockCol}>
                <Text style={styles.stockVal}>
                  {vendorForecast.availableStock ?? (vendorForecast as any).currentStock ?? 0} kg
                </Text>
                <Text style={styles.stockLbl}>Available Stock</Text>
              </View>
              <View style={styles.stockCol}>
                <Text style={styles.stockVal}>{vendorForecast.minimumStock ?? 0} kg</Text>
                <Text style={styles.stockLbl}>Min Buffer</Text>
              </View>
              <View style={styles.stockCol}>
                <Text style={styles.stockVal}>{vendorForecast.safetyStock ?? 5} kg</Text>
                <Text style={styles.stockLbl}>Safety Stock</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <Text style={styles.subHeading}>Model Extracted Lag Features</Text>
            <View style={styles.featureGrid}>
              <View style={styles.featureItem}>
                <Text style={styles.featureLabel}>Lag 1d (Yesterday)</Text>
                <Text style={styles.featureVal}>
                  {vendorForecast.featuresUsed?.lag1 ?? (vendorForecast as any).lag1 ?? '-'}
                </Text>
              </View>
              <View style={styles.featureItem}>
                <Text style={styles.featureLabel}>Lag 7d (Same Day Last Wk)</Text>
                <Text style={styles.featureVal}>
                  {vendorForecast.featuresUsed?.lag7 ?? (vendorForecast as any).lag7 ?? '-'}
                </Text>
              </View>
              <View style={styles.featureItem}>
                <Text style={styles.featureLabel}>Rolling 7d Mean</Text>
                <Text style={styles.featureVal}>
                  {vendorForecast.featuresUsed?.rolling_7d_mean ?? (vendorForecast as any).rolling7DayMean ?? '-'}
                </Text>
              </View>
              <View style={styles.featureItem}>
                <Text style={styles.featureLabel}>Rolling 7d Std</Text>
                <Text style={styles.featureVal}>
                  {vendorForecast.featuresUsed?.rolling_7d_std ?? '-'}
                </Text>
              </View>
            </View>

            <View style={styles.footerNote}>
              <Text style={styles.footerNoteText}>
                Derived from {vendorForecast.orderHistoryCount ?? (vendorForecast as any).recentOrders ?? 0} real order records in database.
              </Text>
            </View>
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
  forecastBtn: {
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
  forecastBtnText: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: '700',
  },
  resultCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md + 2,
    borderWidth: 1,
    borderColor: colors.greenBorder,
    ...shadows.card,
  },
  vendorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  shopMeta: {
    flex: 1,
  },
  resultTag: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.greenPrimary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  shopName: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  productBadge: {
    backgroundColor: colors.greenLight,
    borderWidth: 1,
    borderColor: colors.greenBorder,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginLeft: 8,
  },
  productBadgeText: {
    color: colors.greenDark,
    fontSize: 12,
    fontWeight: '700',
  },
  mainMetricsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginVertical: spacing.xs,
  },
  metricBox: {
    flex: 1,
    backgroundColor: colors.backgroundAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
  },
  metricBoxHighlight: {
    backgroundColor: colors.greenLight,
    borderColor: colors.greenBorder,
  },
  metricVal: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 4,
  },
  metricUnit: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  metricLbl: {
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
  stockRow: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundAlt,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.borderLight,
    justifyContent: 'space-around',
  },
  stockCol: {
    alignItems: 'center',
  },
  stockVal: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  stockLbl: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
    fontWeight: '600',
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  featureItem: {
    width: '48%',
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.sm + 2,
    borderRadius: radius.md,
  },
  featureLabel: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  featureVal: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 3,
  },
  footerNote: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    alignItems: 'center',
  },
  footerNoteText: {
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: 'italic',
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
