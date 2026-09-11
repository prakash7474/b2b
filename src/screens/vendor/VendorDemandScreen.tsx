import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import { useAuthStore } from '../../store/authStore';
import { usePredictionStore } from '../../store/predictionStore';
import { predictionService } from '../../services/predictionService';
import { RequestRestockModal } from './RequestRestockModal';
import { colors, typography } from '../../theme';

export const VendorDemandScreen: React.FC = () => {
  const { vendor_id, shop_name } = useAuthStore();
  const { fetchVendorForecast, vendorForecast, isLoading, error } = usePredictionStore();

  const [refreshing, setRefreshing] = useState(false);
  const [restockModalVisible, setRestockModalVisible] = useState(false);
  const [festivalNote, setFestivalNote] = useState<string>('');
  const [weatherNote, setWeatherNote] = useState<string>('');

  const loadData = async () => {
    if (!vendor_id) return;
    await Promise.all([
      fetchVendorForecast(vendor_id),
      predictionService.getFestivalCalendar().then((festivals: any) => {
        if (Array.isArray(festivals) && festivals.length > 0) {
          const today = new Date();
          const upcoming = festivals.find((f: any) => {
            if (!f.date) return false;
            const diffDays = (new Date(f.date).getTime() - today.getTime()) / (1000 * 3600 * 24);
            return diffDays >= 0 && diffDays <= 7;
          });
          if (upcoming) {
            setFestivalNote(`Upcoming Festive Window: ${upcoming.festivalName} (${upcoming.region || 'TN'}) — Expected boost to breakfast footfall.`);
          } else {
            setFestivalNote('Normal Festive Window: Standard consumption cadence across neighborhood.');
          }
        }
      }).catch(() => null),
      predictionService.getWeatherForecast().then((weather: any) => {
        if (weather && weather.temperatureC !== undefined) {
          setWeatherNote(`Atmospheric Conditions: ${weather.temperatureC}°C, ${weather.rainProbability}% precipitation likelihood.`);
        } else {
          setWeatherNote('Atmospheric Conditions: 31°C, warm ambient condition.');
        }
      }).catch(() => null),
    ]);
  };

  useEffect(() => {
    loadData();
  }, [vendor_id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const currentStock = vendorForecast?.availableStock ?? 0;
  const predictedDemand = vendorForecast?.predictedDemand ?? 15.0;
  const recommendedDispatch = vendorForecast?.recommendedDispatch ?? Math.max(0, Math.round((predictedDemand - currentStock) * 10) / 10);
  const minStock = vendorForecast?.minimumStock ?? 10.0;
  const safetyStock = vendorForecast?.safetyStock ?? Math.round(minStock * 1.2 * 10) / 10;
  const isBelowDemand = currentStock < predictedDemand;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Demand Forecast & Requisition</Text>
        <Text style={styles.subtitle}>
          Predicted consumer consumption velocity and recommended kitchen restock.
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.clayTerracotta}
            colors={[colors.clayTerracotta]}
          />
        }
      >
        <View style={styles.maxContainer}>

          {/* Shop Identification Banner */}
          <View style={styles.shopBanner}>
            <View style={styles.shopBannerTop}>
              <Text style={styles.shopName}>{shop_name || vendor_id}</Text>
              <View style={styles.productBadge}>
                <Text style={styles.productBadgeText}>{vendorForecast?.product || 'Idli Batter'}</Text>
              </View>
            </View>
            <Text style={styles.shopBannerDesc}>
              XGBoost predictive engine evaluates your neighborhood density, historical POS orders, seasonal weather, and calendar events to anticipate exact sales.
            </Text>
          </View>

          {isLoading && !refreshing ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.clayTerracotta} />
              <Text style={styles.loadingText}>Running XGBoost demand model...</Text>
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {vendorForecast ? (
            <View style={styles.mainCard}>
              {/* Primary Dual Metrics */}
              <View style={styles.primaryGrid}>
                <View style={styles.primaryMetric}>
                  <Text style={styles.primaryVal}>{predictedDemand} <Text style={styles.unitVal}>kg</Text></Text>
                  <Text style={styles.primaryLbl}>Anticipated Demand</Text>
                </View>
                <View style={styles.verticalRule} />
                <View style={styles.primaryMetric}>
                  <Text style={[styles.primaryVal, { color: colors.clayTerracotta }]}>
                    {recommendedDispatch} <Text style={styles.unitVal}>kg</Text>
                  </Text>
                  <Text style={styles.primaryLbl}>Recommended Restock</Text>
                </View>
              </View>

              {/* Status Alert */}
              <View style={[styles.statusStrip, isBelowDemand ? styles.statusStripAlert : styles.statusStripAdequate]}>
                <Text style={styles.statusGlyph}>{isBelowDemand ? '▲' : '✓'}</Text>
                <Text style={[styles.statusText, { color: isBelowDemand ? colors.rustRed : colors.bananaGreen }]}>
                  {isBelowDemand
                    ? `Current stock (${currentStock} kg) is below anticipated demand. Requisition needed.`
                    : `Current stock (${currentStock} kg) adequately covers today's demand.`}
                </Text>
              </View>

              {/* Stock Balance Ledger Table */}
              <Text style={styles.sectionHeader}>Stock Balance Ledger</Text>
              <View style={styles.stockTable}>
                <View style={styles.stockCol}>
                  <Text style={styles.stockNum}>{currentStock} kg</Text>
                  <Text style={styles.stockLbl}>Current in Hand</Text>
                </View>
                <View style={styles.verticalRule} />
                <View style={styles.stockCol}>
                  <Text style={styles.stockNum}>{minStock} kg</Text>
                  <Text style={styles.stockLbl}>Minimum Reserve</Text>
                </View>
                <View style={styles.verticalRule} />
                <View style={styles.stockCol}>
                  <Text style={styles.stockNum}>{safetyStock} kg</Text>
                  <Text style={styles.stockLbl}>Safety Threshold</Text>
                </View>
              </View>

              {/* Demand Explanatory Context (Plain-English factors) */}
              <Text style={styles.sectionHeader}>Demand Influencing Factors</Text>
              <View style={styles.factorsCard}>
                <View style={styles.factorRow}>
                  <Text style={styles.factorDot}>•</Text>
                  <View style={styles.factorBody}>
                    <Text style={styles.factorHead}>Calendar & Holiday Effects:</Text>
                    <Text style={styles.factorDetail}>{festivalNote || 'Standard weekday consumption.'}</Text>
                  </View>
                </View>

                <View style={styles.factorRow}>
                  <Text style={styles.factorDot}>•</Text>
                  <View style={styles.factorBody}>
                    <Text style={styles.factorHead}>Weather & Temperature Effects:</Text>
                    <Text style={styles.factorDetail}>{weatherNote}</Text>
                  </View>
                </View>

                <View style={styles.factorRow}>
                  <Text style={styles.factorDot}>•</Text>
                  <View style={styles.factorBody}>
                    <Text style={styles.factorHead}>Sales Momentum (Past 7 Days):</Text>
                    <Text style={styles.factorDetail}>
                      Prior day sales: {vendorForecast.featuresUsed?.lag1 ?? '-'} units • 7-day average: {vendorForecast.featuresUsed?.rolling_7d_mean ?? '-'} units/day.
                    </Text>
                  </View>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.actionsContainer}>
                <TouchableOpacity
                  style={styles.requestOrderBtn}
                  onPress={() => setRestockModalVisible(true)}
                >
                  <Text style={styles.requestOrderBtnText}>Request Fresh Batter Restock →</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.refreshDataBtn} onPress={loadData}>
                  <Text style={styles.refreshDataBtnText}>↺ Re-evaluate Forecast</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

        </View>
      </ScrollView>

      {/* Restock Order Requisition Modal */}
      <RequestRestockModal
        visible={restockModalVisible}
        vendorId={vendor_id || ''}
        productName={vendorForecast?.product || 'Idli Batter'}
        suggestedQty={recommendedDispatch > 0 ? recommendedDispatch : 15}
        currentStock={currentStock}
        onClose={() => setRestockModalVisible(false)}
        onSuccess={() => {
          setRestockModalVisible(false);
          loadData();
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.batterCream,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.inkCharcoal,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.inkCharcoal,
    fontFamily: typography.heading,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  content: {
    padding: 12,
    paddingBottom: 48,
  },
  maxContainer: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    gap: 14,
  },
  shopBanner: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderTopWidth: 3,
    borderColor: colors.inkCharcoal,
    borderRadius: 4,
    padding: 16,
  },
  shopBannerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  shopName: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.clayTerracotta,
    fontFamily: typography.heading,
  },
  productBadge: {
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
  },
  productBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.inkCharcoal,
  },
  shopBannerDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  mainCard: {
    backgroundColor: colors.paperWhite,
    borderWidth: 1.5,
    borderTopWidth: 3.5,
    borderColor: colors.inkCharcoal,
    borderRadius: 4,
    padding: 16,
  },
  primaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 4,
    paddingVertical: 14,
    marginBottom: 12,
  },
  primaryMetric: {
    flex: 1,
    alignItems: 'center',
  },
  primaryVal: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.inkCharcoal,
  },
  unitVal: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  primaryLbl: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 2,
  },
  verticalRule: {
    width: 1,
    height: 36,
    backgroundColor: colors.borderHairline,
  },
  statusStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 4,
    borderWidth: 1,
    gap: 8,
    marginBottom: 16,
  },
  statusStripAlert: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.rustRed,
  },
  statusStripAdequate: {
    backgroundColor: colors.successBg,
    borderColor: colors.bananaGreen,
  },
  statusGlyph: {
    fontSize: 14,
    fontWeight: '900',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.inkCharcoal,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  stockTable: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginBottom: 16,
  },
  stockCol: {
    flex: 1,
    alignItems: 'center',
  },
  stockNum: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.inkCharcoal,
  },
  stockLbl: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  factorsCard: {
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 4,
    padding: 12,
    marginBottom: 18,
  },
  factorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  factorDot: {
    fontSize: 14,
    color: colors.clayTerracotta,
    fontWeight: '900',
  },
  factorBody: {
    flex: 1,
  },
  factorHead: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.inkCharcoal,
  },
  factorDetail: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
    marginTop: 1,
  },
  actionsContainer: {
    gap: 10,
  },
  requestOrderBtn: {
    backgroundColor: colors.clayTerracotta,
    paddingVertical: 13,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
    alignItems: 'center',
  },
  requestOrderBtnText: {
    color: colors.textInverse,
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.3,
  },
  refreshDataBtn: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingVertical: 10,
    borderRadius: 4,
    alignItems: 'center',
  },
  refreshDataBtnText: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 12,
  },
  center: {
    padding: 32,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: colors.textSecondary,
    fontSize: 13,
  },
  errorBox: {
    backgroundColor: colors.dangerBg,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.rustRed,
    padding: 10,
    marginBottom: 12,
  },
  errorText: {
    color: colors.rustRed,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
});
