import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../store/authStore';
import { useBatchStore } from '../../store/batchStore';
import { usePredictionStore } from '../../store/predictionStore';
import { inventoryService } from '../../services/inventoryService';
import { predictionService } from '../../services/predictionService';
import { InventorySummary } from '../../types/batch';
import { VendorSpoilageResult } from '../../types/prediction';
import { RequestRestockModal } from './RequestRestockModal';
import { UpdateStockModal } from './UpdateStockModal';
import { colors, typography } from '../../theme';

export const VendorHomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { vendor_id, shop_name, logout } = useAuthStore();
  const { fetchBatches } = useBatchStore();
  const { fetchVendorForecast, vendorForecast } = usePredictionStore();

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [inventorySummary, setInventorySummary] = useState<InventorySummary | null>(null);
  const [spoilageResult, setSpoilageResult] = useState<VendorSpoilageResult | null>(null);
  const [festivalNote, setFestivalNote] = useState<string>('');
  const [weatherNote, setWeatherNote] = useState<string>('');
  const [restockModalVisible, setRestockModalVisible] = useState(false);
  const [updateStockVisible, setUpdateStockVisible] = useState(false);

  const loadData = async () => {
    if (!vendor_id) return;
    try {
      const [forecastRes, summaryRes, spoilageRes, festivals, weather] = await Promise.all([
        fetchVendorForecast(vendor_id),
        inventoryService.getInventorySummary(vendor_id).catch(() => null),
        predictionService.getVendorSpoilageRisk(vendor_id).catch(() => null),
        predictionService.getFestivalCalendar().catch(() => []),
        predictionService.getWeatherForecast().catch(() => null),
        fetchBatches(vendor_id),
      ]);

      if (summaryRes) setInventorySummary(summaryRes);
      if (spoilageRes) setSpoilageResult(spoilageRes);

      // Analyze upcoming festival in next 7 days
      if (Array.isArray(festivals) && festivals.length > 0) {
        const today = new Date();
        const upcoming = festivals.find((f: any) => {
          if (!f.date) return false;
          const fDate = new Date(f.date);
          const diffDays = (fDate.getTime() - today.getTime()) / (1000 * 3600 * 24);
          return diffDays >= 0 && diffDays <= 7;
        });
        if (upcoming) {
          setFestivalNote(`Upcoming: ${upcoming.festivalName} (${upcoming.festivalType || 'Festival'}) — Elevated batter demand expected.`);
        } else {
          setFestivalNote('Normal sales window — No major festive anomalies in the upcoming 7 days.');
        }
      }

      // Analyze weather note
      if (weather && weather.temperatureC !== undefined) {
        setWeatherNote(`Atmospheric: ${weather.temperatureC}°C, ${weather.rainProbability}% rain chance (${weather.source || 'Local Forecast'}).`);
      } else {
        setWeatherNote('Atmospheric: 31°C, typical morning idli consumption pattern.');
      }
    } catch (e) {
      console.warn('VendorHomeScreen loadData error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [vendor_id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const currentStock = inventorySummary?.totalQuantityKg ?? vendorForecast?.availableStock ?? 0;
  const isStockOut = currentStock <= 0;
  const predictedDemand = vendorForecast?.predictedDemand ?? 15.0;
  const recommendedDispatch = vendorForecast?.recommendedDispatch ?? Math.max(0, Math.round((predictedDemand - currentStock) * 10) / 10);
  const isRestockNeeded = currentStock < predictedDemand;

  const isSpoilageStockOut = isStockOut || !!spoilageResult?.isStockOut || spoilageResult?.riskLabel === 'None';
  const riskLabel = isSpoilageStockOut ? 'None' : (spoilageResult?.riskLabel || 'Low');
  const riskColor = isSpoilageStockOut
    ? colors.rustRed
    : riskLabel === 'High'
    ? colors.rustRed
    : riskLabel === 'Medium'
    ? colors.turmericGold
    : colors.bananaGreen;
  const riskBg = isSpoilageStockOut
    ? colors.dangerBg
    : riskLabel === 'High'
    ? colors.dangerBg
    : riskLabel === 'Medium'
    ? colors.warningBg
    : colors.successBg;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header Bar */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerBrand}>B2P Partner Ledger</Text>
          <Text style={styles.headerShop}>{shop_name || vendor_id}</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.clayTerracotta} />
          <Text style={styles.loadingSubtitle}>Synchronizing shop telemetry & forecast models...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
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

            {/* ═══════════════════════════════════════════════════════ */}
            {/* CARD 1: DEMAND FORECAST & DEMAND FACTORS              */}
            {/* ═══════════════════════════════════════════════════════ */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardTitleBadge}>
                  <Text style={styles.cardIndexText}>CARD 01</Text>
                  <Text style={styles.cardTitle}>Today's Demand & Restock Intelligence</Text>
                </View>
                <View style={styles.productTag}>
                  <Text style={styles.productTagText}>{vendorForecast?.product || 'Idli Batter'}</Text>
                </View>
              </View>

              {/* Top Numbers Row */}
              <View style={styles.statGrid}>
                <View style={styles.statBlock}>
                  <Text style={styles.statNumber}>{predictedDemand} <Text style={styles.unitText}>kg</Text></Text>
                  <Text style={styles.statLabel}>Predicted Demand</Text>
                </View>
                <View style={styles.verticalDivider} />
                <View style={styles.statBlock}>
                  <Text style={[styles.statNumber, { color: isRestockNeeded ? colors.rustRed : colors.bananaGreen }]}>
                    {currentStock} <Text style={styles.unitText}>kg</Text>
                  </Text>
                  <Text style={styles.statLabel}>Current Stock in Hand</Text>
                </View>
                <View style={styles.verticalDivider} />
                <View style={styles.statBlock}>
                  <Text style={[styles.statNumber, { color: colors.clayTerracotta }]}>
                    {recommendedDispatch} <Text style={styles.unitText}>kg</Text>
                  </Text>
                  <Text style={styles.statLabel}>Recommended Restock</Text>
                </View>
              </View>

              {/* Status Banner */}
              <View style={[styles.statusBanner, isStockOut ? styles.statusBannerAlert : (isRestockNeeded ? styles.statusBannerAlert : styles.statusBannerAdequate)]}>
                <Text style={styles.statusBannerGlyph}>{isStockOut ? '!' : (isRestockNeeded ? '▲' : '✓')}</Text>
                <Text style={[styles.statusBannerText, { color: isStockOut || isRestockNeeded ? colors.rustRed : colors.bananaGreen }]}>
                  {isStockOut
                    ? `STOCK OUT: Store has 0 kg batter in hand (predicted demand: ${predictedDemand} kg). Immediate requisition required.`
                    : isRestockNeeded
                    ? `Current stock (${currentStock} kg) is below predicted demand (${predictedDemand} kg). Requisition advised.`
                    : `Stock in hand (${currentStock} kg) is sufficient for today's forecast demand.`}
                </Text>
              </View>

              {/* Why is demand like this? Factors Section */}
              <View style={styles.factorsBox}>
                <Text style={styles.factorsTitle}>Why is demand estimated like this? (Demand Factors)</Text>
                
                <View style={styles.factorItem}>
                  <Text style={styles.factorBullet}>•</Text>
                  <View style={styles.factorContent}>
                    <Text style={styles.factorName}>Festive Context:</Text>
                    <Text style={styles.factorText}>{festivalNote || 'Normal calendar window.'}</Text>
                  </View>
                </View>

                <View style={styles.factorItem}>
                  <Text style={styles.factorBullet}>•</Text>
                  <View style={styles.factorContent}>
                    <Text style={styles.factorName}>Weather Telemetry:</Text>
                    <Text style={styles.factorText}>{weatherNote}</Text>
                  </View>
                </View>

                <View style={styles.factorItem}>
                  <Text style={styles.factorBullet}>•</Text>
                  <View style={styles.factorContent}>
                    <Text style={styles.factorName}>Historical Sales Velocity:</Text>
                    <Text style={styles.factorText}>
                      Prior Day Sales (Lag 1): {vendorForecast?.featuresUsed?.lag1 ?? '-'} units • 7-Day Running Avg: {vendorForecast?.featuresUsed?.rolling_7d_mean ?? '-'} units/day.
                    </Text>
                  </View>
                </View>
              </View>

              {/* Request Restock CTA Button */}
              <TouchableOpacity
                style={[styles.primaryActionBtn, isRestockNeeded ? styles.primaryActionBtnHighlight : null]}
                onPress={() => setRestockModalVisible(true)}
              >
                <Text style={styles.primaryActionBtnText}>
                  {isRestockNeeded ? 'Request Fresh Batter Restock →' : 'Submit Requisition Order →'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* ═══════════════════════════════════════════════════════ */}
            {/* CARD 2: SPOILAGE RISK SUMMARY                         */}
            {/* ═══════════════════════════════════════════════════════ */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardTitleBadge}>
                  <Text style={styles.cardIndexText}>CARD 02</Text>
                  <Text style={styles.cardTitle}>Batter Freshness & Spoilage Health</Text>
                </View>
                <View style={[styles.riskChip, { backgroundColor: riskBg, borderColor: riskColor }]}>
                  <Text style={[styles.riskChipText, { color: riskColor }]}>
                    {isSpoilageStockOut ? 'STOCK OUT' : `${riskLabel.toUpperCase()} RISK`}
                  </Text>
                </View>
              </View>

              <View style={styles.spoilageRow}>
                <View style={styles.spoilageMetric}>
                  <Text style={styles.spoilageVal}>
                    {isSpoilageStockOut ? '—' : `${spoilageResult?.hoursSinceManufacture ?? 4.0} hrs`}
                  </Text>
                  <Text style={styles.spoilageLbl}>Hours Since Milling</Text>
                </View>
                <View style={styles.verticalDivider} />
                <View style={styles.spoilageMetric}>
                  <Text style={[styles.spoilageVal, { color: isSpoilageStockOut ? colors.textSecondary : colors.clayTerracotta }]}>
                    {isSpoilageStockOut ? '0 hrs' : `~${spoilageResult?.hoursToExpiry ?? 24.0} hrs`}
                  </Text>
                  <Text style={styles.spoilageLbl}>Safe Shelf Life Remaining</Text>
                </View>
                <View style={styles.verticalDivider} />
                <View style={styles.spoilageMetric}>
                  <Text style={styles.spoilageVal}>
                    {isSpoilageStockOut ? 'Depleted' : `${Math.round(spoilageResult?.confidence ?? 90)}%`}
                  </Text>
                  <Text style={styles.spoilageLbl}>
                    {isSpoilageStockOut ? 'Inventory Status' : 'Classifier Confidence'}
                  </Text>
                </View>
              </View>

              {/* Operational Guidance */}
              <View style={[styles.adviceBox, { borderColor: riskColor }]}>
                <Text style={styles.adviceTitle}>Biochemical Guidance & Dispensing Advice</Text>
                <Text style={styles.adviceText}>
                  {isSpoilageStockOut
                    ? 'Store inventory is completely depleted (Stock Out). Spoilage risk evaluation is inactive until fresh batter is received. Submit a restock requisition to resume store sales.'
                    : riskLabel === 'High'
                    ? 'High biochemical spoilage risk detected in current stock. Recommend immediate clearance, discounting, or marking as Stock Out.'
                    : riskLabel === 'Medium'
                    ? 'Moderate fermentation age. Recommend prioritizing morning counter dispensing and maintaining cold temperature below 5°C.'
                    : 'Batter is biochemically fresh with optimal acidity profile. Safe for normal sales velocity throughout the day.'}
                </Text>
              </View>

              {isSpoilageStockOut ? (
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => setRestockModalVisible(true)}
                >
                  <Text style={styles.secondaryBtnText}>Request Fresh Batter Restock →</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => navigation.navigate('My Batches')}
                >
                  <Text style={styles.secondaryBtnText}>Inspect Specific Batches & Health →</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* ═══════════════════════════════════════════════════════ */}
            {/* CARD 3: CURRENT INVENTORY & BATCH SNAPSHOT           */}
            {/* ═══════════════════════════════════════════════════════ */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardTitleBadge}>
                  <Text style={styles.cardIndexText}>CARD 03</Text>
                  <Text style={styles.cardTitle}>Current Inventory & Batch Snapshot</Text>
                </View>
                <View style={[
                  styles.stockBadge,
                  isStockOut ? styles.stockBadgeLow : (inventorySummary?.belowMinimum ? styles.stockBadgeLow : styles.stockBadgeOk),
                ]}>
                  <Text style={[
                    styles.stockBadgeText,
                    { color: isStockOut || inventorySummary?.belowMinimum ? colors.rustRed : colors.bananaGreen },
                  ]}>
                    {isStockOut ? 'OUT OF STOCK' : (inventorySummary?.belowMinimum ? 'BELOW MINIMUM' : 'STOCK ADEQUATE')}
                  </Text>
                </View>
              </View>

              <View style={styles.invGrid}>
                <View style={styles.invItem}>
                  <Text style={styles.invVal}>{inventorySummary?.totalQuantityKg ?? currentStock} kg</Text>
                  <Text style={styles.invLbl}>Total Active Stock</Text>
                </View>
                <View style={styles.verticalDivider} />
                <View style={styles.invItem}>
                  <Text style={styles.invVal}>{inventorySummary?.minimumStockKg ?? 10} kg</Text>
                  <Text style={styles.invLbl}>Minimum Reserve</Text>
                </View>
                <View style={styles.verticalDivider} />
                <View style={styles.invItem}>
                  <Text style={styles.invVal}>{inventorySummary?.batchCount ?? 0}</Text>
                  <Text style={styles.invLbl}>Batches Assigned</Text>
                </View>
                <View style={styles.verticalDivider} />
                <View style={styles.invItem}>
                  <Text style={[styles.invVal, { color: colors.bananaGreen }]}>
                    {isStockOut ? 0 : (inventorySummary?.receivedBatchCount ?? 0)}
                  </Text>
                  <Text style={styles.invLbl}>Batches in Store</Text>
                </View>
              </View>

              <View style={styles.logSummaryRow}>
                <Text style={styles.logSummaryText}>
                  {isStockOut || (inventorySummary?.receivedBatchCount ?? 0) === 0
                    ? 'No active batches currently in store • Store inventory depleted'
                    : `Oldest batch in store: ${inventorySummary?.oldestBatchAgeHrs ? `${inventorySummary.oldestBatchAgeHrs} hrs ago` : 'Fresh delivery'} • Freshness score: ${Math.round((inventorySummary?.freshnessScore ?? 0.85) * 100)}%`}
                </Text>
              </View>

              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.tertiaryBtn}
                  onPress={() => setUpdateStockVisible(true)}
                >
                  <Text style={styles.tertiaryBtnText}>Update Stock →</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.tertiaryBtn}
                  onPress={() => navigation.navigate('My Batches')}
                >
                  <Text style={styles.tertiaryBtnText}>Open My Batches Ledger →</Text>
                </TouchableOpacity>
              </View>
            </View>

          </View>
        </ScrollView>
      )}

      {/* Requisition Restock Modal */}
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

      <UpdateStockModal
        visible={updateStockVisible}
        vendorId={vendor_id || ''}
        currentStock={currentStock}
        minimumStock={inventorySummary?.minimumStockKg ?? 10}
        onClose={() => setUpdateStockVisible(false)}
        onSuccess={(result) => {
          setUpdateStockVisible(false);
          loadData();
          if (result.below_minimum || result.is_stockout) {
            setRestockModalVisible(true);
          }
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.inkCharcoal,
  },
  headerBrand: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.clayTerracotta,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  headerShop: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.inkCharcoal,
    fontFamily: typography.heading,
    marginTop: 1,
  },
  logoutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.backgroundAlt,
  },
  logoutText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inkCharcoal,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 12,
    textAlign: 'center',
  },
  scrollContent: {
    padding: 12,
    paddingBottom: 48,
  },
  maxContainer: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    gap: 14,
  },
  card: {
    backgroundColor: colors.paperWhite,
    borderWidth: 1.5,
    borderTopWidth: 3.5,
    borderColor: colors.inkCharcoal,
    borderRadius: 4,
    padding: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderHairline,
  },
  cardTitleBadge: {
    flex: 1,
  },
  cardIndexText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.clayTerracotta,
    letterSpacing: 0.5,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.inkCharcoal,
    fontFamily: typography.heading,
    marginTop: 2,
  },
  productTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  productTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.clayTerracotta,
  },
  statGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  statBlock: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.inkCharcoal,
  },
  unitText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  statLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '700',
    marginTop: 2,
    textAlign: 'center',
  },
  verticalDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.borderHairline,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 4,
    borderWidth: 1,
    gap: 8,
    marginBottom: 14,
  },
  statusBannerAlert: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.rustRed,
  },
  statusBannerAdequate: {
    backgroundColor: colors.successBg,
    borderColor: colors.bananaGreen,
  },
  statusBannerGlyph: {
    fontSize: 14,
    fontWeight: '900',
  },
  statusBannerText: {
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
    lineHeight: 16,
  },
  factorsBox: {
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 4,
    padding: 12,
    marginBottom: 14,
  },
  factorsTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.inkCharcoal,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  factorItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 6,
  },
  factorBullet: {
    fontSize: 12,
    color: colors.clayTerracotta,
    fontWeight: '900',
  },
  factorContent: {
    flex: 1,
  },
  factorName: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.inkCharcoal,
  },
  factorText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
    marginTop: 1,
  },
  primaryActionBtn: {
    backgroundColor: colors.clayTerracotta,
    paddingVertical: 12,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
    alignItems: 'center',
  },
  primaryActionBtnHighlight: {
    backgroundColor: colors.rustRed,
  },
  primaryActionBtnText: {
    color: colors.textInverse,
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.3,
  },
  riskChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 3,
    borderWidth: 1.5,
  },
  riskChipText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  spoilageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  spoilageMetric: {
    flex: 1,
    alignItems: 'center',
  },
  spoilageVal: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.inkCharcoal,
  },
  spoilageLbl: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '700',
    marginTop: 2,
    textAlign: 'center',
  },
  adviceBox: {
    backgroundColor: colors.backgroundAlt,
    borderLeftWidth: 3.5,
    padding: 10,
    borderRadius: 2,
    marginBottom: 12,
  },
  adviceTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.inkCharcoal,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  adviceText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
    fontWeight: '500',
  },
  secondaryBtn: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
    paddingVertical: 11,
    borderRadius: 4,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.inkCharcoal,
  },
  stockBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
    borderWidth: 1,
  },
  stockBadgeLow: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.rustRed,
  },
  stockBadgeOk: {
    backgroundColor: colors.successBg,
    borderColor: colors.bananaGreen,
  },
  stockBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  invGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 6,
    marginBottom: 12,
  },
  invItem: {
    flex: 1,
    alignItems: 'center',
  },
  invVal: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.inkCharcoal,
  },
  invLbl: {
    fontSize: 9,
    color: colors.textSecondary,
    fontWeight: '700',
    marginTop: 2,
    textAlign: 'center',
  },
  logSummaryRow: {
    backgroundColor: colors.backgroundAlt,
    padding: 10,
    borderRadius: 4,
    marginBottom: 12,
  },
  logSummaryText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tertiaryBtn: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
    paddingVertical: 11,
    borderRadius: 4,
    alignItems: 'center',
  },
  tertiaryBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.clayTerracotta,
  },
});
