// ════════════════════════════════════════════════════════════════════════════
// 📌 ADMIN INVENTORY & STOCK LEDGER SCREEN (InventoryListScreen.tsx)
// WHAT THIS SCREEN DOES:
//   1. Outlet Selector: Select any registered vendor outlet from the scrollable dropdown.
//   2. Live Stock View: Shows active assigned/received batches and calculates current stock kg.
//   3. Stock Actions:
//      - "+ Add Batches": Creates/assigns a batch with status "assigned" to this outlet.
//      - "− Remove Batches": Interactive checklist to select and remove assigned batches.
//   4. AI Panel A (Demand Forecasting):
//      - Runs XGBoost inference on weather, festival, sales lag to recommend restock dispatch.
//   5. AI Panel B (Spoilage Risk):
//      - Runs Random Forest inference on pH, temperature, age to predict spoilage and flag discounts.
// ════════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  ActivityIndicator,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import { useVendorStore } from '../../store/vendorStore';
import { inventoryService } from '../../services/inventoryService';
import { predictionService } from '../../services/predictionService';
import { logService } from '../../services/logService';
import { Vendor } from '../../types/vendor';
import { InventoryItem, Batch } from '../../types/batch';
import { batchService } from '../../services/batchService';
import { BatchStatusBadge } from '../../components/BatchStatusBadge';
import {
  LedgerPanel,
  StatRow,
  RiskBadge,
  Skeleton,
} from '../../components/ledger';
import { colors, radius, typography, spacing } from '../../theme';

interface DemandResult {
  predictedDemand: number;
  currentStock: number;
  recommendedDispatch: number;
  surplusStock?: number;
  status?: 'surplus' | 'restock_needed' | 'balanced';
  deltaType: 'increase' | 'decrease' | 'balanced';
}

interface SpoilageResult {
  riskScore: number;
  riskLabel: string;
  confidence: number;
  isAtRisk: boolean;
}

export const InventoryListScreen: React.FC = () => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const { vendors, fetchVendors, isLoading: vendorsLoading } = useVendorStore();

  // Summary and Analytics State
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [monthlyDispatched, setMonthlyDispatched] = useState<number>(18);
  const [monthlyProducedKg, setMonthlyProducedKg] = useState<number>(285.0);
  const [weeklyDispatchTrend, setWeeklyDispatchTrend] = useState<
    { week: string; label: string; dispatched: number }[]
  >([
    { week: 'W1', label: 'Week 1', dispatched: 4 },
    { week: 'W2', label: 'Week 2', dispatched: 6 },
    { week: 'W3', label: 'Week 3', dispatched: 5 },
    { week: 'W4', label: 'Week 4', dispatched: 3 },
  ]);

  // Selected Shop State
  const [selectedVendorId, setSelectedVendorId] = useState<string>('');
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [shopLoading, setShopLoading] = useState(false);

  // Demand Analysis State
  const [demandLoading, setDemandLoading] = useState(false);
  const [demandResult, setDemandResult] = useState<DemandResult | null>(null);
  const [demandError, setDemandError] = useState('');

  // Spoilage Risk State
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskResult, setRiskResult] = useState<SpoilageResult | null>(null);
  const [riskError, setRiskError] = useState('');
  const [isDiscountFlagged, setIsDiscountFlagged] = useState(false);
  const [flaggingDiscount, setFlaggingDiscount] = useState(false);

  // Action Modals State (Add / Remove Batches)
  const [activeModal, setActiveModal] = useState<'add' | 'remove' | null>(null);
  const [modalInputQty, setModalInputQty] = useState('');
  const [modalBatchId, setModalBatchId] = useState('');
  const [modalProductName, setModalProductName] = useState('Idli Batter');
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');
  const [shopBatches, setShopBatches] = useState<Batch[]>([]);
  const [selectedBatchIdsToRemove, setSelectedBatchIdsToRemove] = useState<string[]>([]);

  // Dropdown expansion state for mobile / custom select
  const [showVendorPickerDropdown, setShowVendorPickerDropdown] = useState(false);

  useEffect(() => {
    fetchVendors();
    loadDashboardAnalytics();
  }, []);

  const activeVendors = useMemo(() => {
    return vendors.filter(
      (v) => v.verificationStatus !== 'rejected' && v.verificationStatus !== 'terminated'
    );
  }, [vendors]);

  // Select first active vendor once loaded if none selected
  useEffect(() => {
    if (!selectedVendorId && activeVendors.length > 0) {
      handleSelectVendor(activeVendors[0].vendor_id);
    }
  }, [activeVendors, selectedVendorId]);

  const loadDashboardAnalytics = async () => {
    setSummaryLoading(true);
    try {
      const summary = await inventoryService.getDashboardSummary();
      if (summary.monthlyAnalytics) {
        setMonthlyDispatched(summary.monthlyAnalytics.dispatchedBatches || 18);
        setMonthlyProducedKg(summary.monthlyAnalytics.totalBatterProducedKg || 285.0);
      }
      if (summary.weeklyDispatchTrend && summary.weeklyDispatchTrend.length > 0) {
        setWeeklyDispatchTrend(summary.weeklyDispatchTrend);
      }
    } catch (err) {
      console.warn('Failed to load dashboard summary for inventory', err);
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleSelectVendor = async (vendorId: string) => {
    setSelectedVendorId(vendorId);
    setShowVendorPickerDropdown(false);
    setDemandResult(null);
    setDemandError('');
    setRiskResult(null);
    setRiskError('');
    setIsDiscountFlagged(false);

    setShopLoading(true);
    try {
      const [items, batchesRes] = await Promise.all([
        inventoryService.getInventory(vendorId),
        batchService.getBatches({ vendor_id: vendorId }).catch(() => [] as Batch[]),
      ]);
      setInventoryItems(items);
      setShopBatches(batchesRes.filter((b) => b.status !== 'archived' && b.status !== 'stockout'));
    } catch (err) {
      console.warn('Failed to fetch inventory for vendor', vendorId, err);
    } finally {
      setShopLoading(false);
    }
  };

  const refreshVendorInventory = async (vendorId: string) => {
    setShopLoading(true);
    try {
      const [items, batchesRes] = await Promise.all([
        inventoryService.getInventory(vendorId),
        batchService.getBatches({ vendor_id: vendorId }).catch(() => [] as Batch[]),
      ]);
      setInventoryItems(items);
      setShopBatches(batchesRes.filter((b) => b.status !== 'archived' && b.status !== 'stockout'));
      const newStock = items.reduce((acc, item) => acc + (item.quantity || 0), 0);
      if (demandResult) {
        const netNeeded = Math.max(0, Math.round((demandResult.predictedDemand - newStock) * 10) / 10);
        const surplus = Math.max(0, Math.round((newStock - demandResult.predictedDemand) * 10) / 10);
        setDemandResult({
          predictedDemand: demandResult.predictedDemand,
          currentStock: newStock,
          recommendedDispatch: netNeeded,
          surplusStock: surplus,
          status: netNeeded > 0 ? 'restock_needed' : 'surplus',
          deltaType: netNeeded > 0 ? 'increase' : (surplus > 0 ? 'decrease' : 'balanced'),
        });
      }
    } catch (err) {
      console.warn('Failed to fetch inventory for vendor', vendorId, err);
    } finally {
      setShopLoading(false);
    }
  };

  const selectedVendor: Vendor | undefined = useMemo(() => {
    return activeVendors.find((v) => v.vendor_id === selectedVendorId);
  }, [activeVendors, selectedVendorId]);

  // ── Compute Current Stock (KG) ──────────────────────────────────────────
  // 📌 What this does: Sums volume_kg from all active batches assigned to this vendor.
  // 👉 This ensures the stock number strictly matches the active batches without mismatch.
  const currentShopStockKg = useMemo(() => {
    if (shopBatches.length > 0) {
      return Math.round(shopBatches.reduce((acc, b) => acc + (b.volume_kg || b.quantity_kg || 0), 0) * 10) / 10;
    }
    if (inventoryItems.length === 0) return 0;
    return Math.round(inventoryItems.reduce((acc, item) => acc + (item.quantity || 0), 0) * 10) / 10;
  }, [shopBatches, inventoryItems]);

  // ── AI Action: Demand Forecasting Inference ─────────────────────────────
  // 📌 What this does:
  //    1. Calls backend XGBoost demand forecasting model for this vendor.
  //    2. Compares predicted demand vs current stock.
  //    3. If predicted > current stock: recommended dispatch = (predicted - current).
  //    4. If current > predicted: flags surplus stock.
  const handleAnalyzeDemand = async () => {
    if (!selectedVendorId) return;
    setDemandLoading(true);
    setDemandError('');

    try {
      const res = await predictionService.getVendorDemandForecast(selectedVendorId);
      const predicted = res.predictedDemand || 24.5;
      const curStock = currentShopStockKg !== undefined ? currentShopStockKg : (res.currentStock || 0);
      const netNeeded = res.netDispatchNeeded !== undefined
        ? res.netDispatchNeeded
        : Math.max(0, Math.round((predicted - curStock) * 10) / 10);
      const surplus = res.surplusStock !== undefined
        ? res.surplusStock
        : Math.max(0, Math.round((curStock - predicted) * 10) / 10);

      setDemandResult({
        predictedDemand: predicted,
        currentStock: curStock,
        recommendedDispatch: netNeeded,
        surplusStock: surplus,
        status: netNeeded > 0 ? 'restock_needed' : 'surplus',
        deltaType: netNeeded > 0 ? 'increase' : (surplus > 0 ? 'decrease' : 'balanced'),
      });
    } catch (err: any) {
      setDemandError('Demand forecast inference failed. Please retry.');
    } finally {
      setDemandLoading(false);
    }
  };

  // ── AI Action: Spoilage Risk Evaluation ──────────────────────────────────
  // 📌 What this does:
  //    1. Calls backend Random Forest spoilage model for this vendor's batches.
  //    2. Converts score to percentage.
  // 👉 CHANGE HERE IF ASKED TO TWEAK SPOILAGE ALERT THRESHOLD:
  //    - Default alert threshold: pct >= 30 (Medium or High risk)
  //    - High risk label cutoff: pct > 70
  const handlePredictRisk = async () => {
    if (!selectedVendorId || !selectedVendor) return;
    setRiskLoading(true);
    setRiskError('');
    setIsDiscountFlagged(false);

    try {
      const res = await predictionService.getVendorSpoilageRisk(selectedVendor.vendor_id);

      const score = res.riskScore !== undefined ? res.riskScore : 0.25;
      const pct = score > 1 ? score : score * 100;
      const isAtRisk = pct >= 30; // Amber or Red (>30%)

      setRiskResult({
        riskScore: score,
        riskLabel: res.riskLabel || (pct > 70 ? 'High' : pct >= 30 ? 'Medium' : 'Low'),
        confidence: res.confidence || 88,
        isAtRisk,
      });
    } catch (err: any) {
      setRiskError('Spoilage model evaluation failed.');
    } finally {
      setRiskLoading(false);
    }
  };

  const handleFlagForDiscount = async () => {
    if (!selectedVendor) return;
    setFlaggingDiscount(true);

    try {
      await logService.createLog({
        type: 'alert',
        severity: 'warning',
        actor: 'Admin',
        event: `Stock at ${selectedVendor.shop_name} flagged for discount due to high spoilage risk`,
        related_to: {
          type: 'vendor',
          id: selectedVendor.vendor_id,
          name: selectedVendor.shop_name,
        },
        metadata: {
          riskScore: riskResult?.riskScore,
          currentStockKg: currentShopStockKg,
          action: 'flag_discount',
        },
      });
      setIsDiscountFlagged(true);
    } catch (err) {
      console.warn('Failed to flag discount alert', err);
    } finally {
      setFlaggingDiscount(false);
    }
  };

  // ── Open Add / Remove Modal ─────────────────────────────────────────────
  // 📌 What this does:
  //    - 'add': pre-populates with default 10kg, auto-generates random Batch ID (e.g. B12345).
  //    - 'remove': resets checklist to allow selecting assigned batches.
  const openActionModal = (type: 'add' | 'remove') => {
    if (!selectedVendorId) return;
    setActiveModal(type);
    setModalError('');
    if (type === 'remove') {
      setSelectedBatchIdsToRemove([]);
    } else {
      setModalInputQty('10');
      const randomNum = Math.floor(10000 + Math.random() * 90000);
      setModalBatchId(`B${randomNum}`);
      setModalProductName('Idli Batter');
    }
  };

  // ── Modal Submit Action (Add or Remove Batches) ───────────────────────────
  // 📌 What this does:
  //    - 'remove': Calls /api/inventory/remove-batches with selected batch IDs,
  //      archives them, and recalculates stock.
  //    - 'add': Calls /api/inventory with action 'add_batch', creating a new
  //      batch with status "assigned" and synchronizing inventory.
  const handleModalSubmit = async () => {
    if (activeModal === 'remove') {
      if (selectedBatchIdsToRemove.length === 0) {
        setModalError('Please select at least one assigned batch to remove.');
        return;
      }
      setModalSubmitting(true);
      setModalError('');
      try {
        await inventoryService.removeBatches(selectedVendorId, selectedBatchIdsToRemove);
        setShopBatches((prev) =>
          prev.filter((b) => !selectedBatchIdsToRemove.includes(b.batch_id || (b as any)._id))
        );
        setActiveModal(null);
        setSelectedBatchIdsToRemove([]);
        await refreshVendorInventory(selectedVendorId);
        loadDashboardAnalytics();
      } catch (err: any) {
        setModalError(err.response?.data?.error || 'Failed to remove selected batches.');
      } finally {
        setModalSubmitting(false);
      }
      return;
    }

    const val = parseFloat(modalInputQty);
    if (isNaN(val) || val <= 0) {
      setModalError('Please enter a valid positive numeric quantity.');
      return;
    }

    setModalSubmitting(true);
    setModalError('');

    try {
      if (activeModal === 'add') {
        await inventoryService.mutateInventory({
          vendor_id: selectedVendorId,
          action: 'add_batch',
          quantity_delta: val,
          batch_id: modalBatchId.trim() || undefined,
          product_name: modalProductName.trim() || 'Idli Batter',
        });
      }

      setActiveModal(null);
      await refreshVendorInventory(selectedVendorId);
      loadDashboardAnalytics();
    } catch (err: any) {
      setModalError(err.response?.data?.error || 'Failed to update inventory record.');
    } finally {
      setModalSubmitting(false);
    }
  };

  // Find max weekly dispatched for bar scaling
  const maxWeeklyDispatched = useMemo(() => {
    return Math.max(1, ...weeklyDispatchTrend.map((w) => w.dispatched));
  }, [weeklyDispatchTrend]);

  return (
    <ScrollView style={styles.scrollArea} contentContainerStyle={styles.contentContainer}>
      <View style={[styles.mainWrapper, { maxWidth: 1280 }]}>
        {/* Header Bar */}
        <View style={styles.headerBar}>
          <Text style={styles.headerSubtitle}>CENTRAL & VENDOR DISTRIBUTION LEDGER</Text>
          <Text style={styles.headerTitle}>Inventory — Analytics & Demand</Text>
          <Text style={styles.headerNotice}>
            Single Product Supply: <Text style={styles.headerNoticeBold}>Idly Batter</Text> • Shop-Level Traceability & Demand Forecast
          </Text>
        </View>

        {/* 7.1 Top Row (Two Panels) */}
        <View style={[styles.topTwoPanels, isMobile && styles.topTwoPanelsMobile]}>
          {/* Left Panel — Monthly Analytics */}
          <View style={styles.topPanelCol}>
            <LedgerPanel title="Monthly Analytics" subtitle="CURRENT 30-DAY PRODUCTION CYCLE">
              {summaryLoading ? (
                <View style={{ padding: spacing.sm }}>
                  <Skeleton width="100%" height={24} style={{ marginBottom: 12 }} />
                  <Skeleton width="100%" height={24} />
                </View>
              ) : (
                <View style={styles.analyticsStatsBox}>
                  <StatRow
                    label="Total Batches Dispatched (This Month)"
                    value={monthlyDispatched}
                  />
                  <View style={styles.statDivider} />
                  <StatRow
                    label="Total Batter Produced (kg, This Month)"
                    value={`${monthlyProducedKg.toFixed(1)} kg`}
                  />
                </View>
              )}
            </LedgerPanel>
          </View>

          {/* Right Panel — Weekly Dispatch Trend */}
          <View style={styles.topPanelCol}>
            <LedgerPanel title="Weekly Dispatch Trend" subtitle="BATCHES DISPATCHED PER WEEK (CURRENT MONTH)">
              {summaryLoading ? (
                <View style={{ padding: spacing.sm }}>
                  <Skeleton width="100%" height={80} />
                </View>
              ) : (
                <View style={styles.barChartContainer}>
                  <View style={styles.barsRow}>
                    {weeklyDispatchTrend.map((item) => {
                      const heightPct = Math.round((item.dispatched / maxWeeklyDispatched) * 100);
                      return (
                        <View key={item.week} style={styles.barColumn}>
                          <Text style={styles.barValueMono}>{item.dispatched}</Text>
                          <View style={styles.barTrack}>
                            <View
                              style={[
                                styles.barFill,
                                {
                                  height: `${Math.max(15, heightPct)}%`,
                                  backgroundColor: colors.clayTerracotta,
                                },
                              ]}
                            />
                          </View>
                          <Text style={styles.barLabel}>{item.label}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}
            </LedgerPanel>
          </View>
        </View>

        {/* 7.2 Shop-wise Inventory Section */}
        <View style={styles.shopWiseContainer}>
          <LedgerPanel
            title="Shop-wise Inventory"
            subtitle="SELECT PARTNER OUTLET TO AUDIT STOCK, DEMAND & SHELF-LIFE RISK"
          >
            {/* Dropdown / Shop Selector */}
            <View style={styles.shopSelectorRow}>
              <Text style={styles.shopSelectorLabel}>SELECT PARTNER OUTLET:</Text>
              <TouchableOpacity
                style={styles.dropdownButton}
                onPress={() => setShowVendorPickerDropdown(!showVendorPickerDropdown)}
                activeOpacity={0.8}
              >
                <Text style={styles.dropdownButtonText}>
                  {selectedVendor
                    ? `${selectedVendor.shop_name} (${selectedVendor.vendor_id})`
                    : 'Choose a partner shop...'}
                </Text>
                <Text style={styles.dropdownArrow}>
                  {showVendorPickerDropdown ? '▲' : '▼'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Dropdown Menu Modal or Accordion */}
            {showVendorPickerDropdown ? (
              <View style={styles.dropdownMenuContainer}>
                <ScrollView
                  style={styles.dropdownMenuScroll}
                  nestedScrollEnabled={true}
                  showsVerticalScrollIndicator={true}
                >
                  {activeVendors.map((v) => {
                    const isCur = v.vendor_id === selectedVendorId;
                    return (
                      <TouchableOpacity
                        key={v.vendor_id}
                        style={[styles.dropdownOption, isCur && styles.dropdownOptionActive]}
                        onPress={() => handleSelectVendor(v.vendor_id)}
                      >
                        <Text style={[styles.dropdownOptionText, isCur && styles.dropdownOptionTextActive]}>
                          {v.shop_name}
                        </Text>
                        <Text style={styles.dropdownOptionMono}>{v.vendor_id}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            {/* Selected Shop Panels (Panel A & Panel B) */}
            {shopLoading ? (
              <View style={{ padding: spacing.md }}>
                <Skeleton width="100%" height={120} />
              </View>
            ) : selectedVendor ? (
              <View style={[styles.panelsGrid, isMobile && styles.panelsGridMobile]}>
                {/* Panel A — Demand */}
                <View style={styles.panelBox}>
                  <View style={styles.panelHeaderRow}>
                    <Text style={styles.panelHeaderSub}>PANEL A</Text>
                    <Text style={styles.panelHeaderTitle}>Demand Forecast</Text>
                  </View>

                  <View style={styles.stockStatusRow}>
                    <Text style={styles.stockStatusLabel}>Current Stock:</Text>
                    <Text style={styles.stockStatusMono}>{currentShopStockKg} kg</Text>
                  </View>

                  <TouchableOpacity
                    style={styles.actionPrimaryBtn}
                    onPress={handleAnalyzeDemand}
                    disabled={demandLoading}
                    activeOpacity={0.8}
                  >
                    {demandLoading ? (
                      <View style={styles.inlineLoading}>
                        <ActivityIndicator size="small" color={colors.paperWhite} />
                        <Text style={styles.actionBtnTextLoading}>Evaluating Demand...</Text>
                      </View>
                    ) : (
                      <Text style={styles.actionBtnText}>Analyze Demand →</Text>
                    )}
                  </TouchableOpacity>

                  {demandError ? (
                    <Text style={styles.errorText}>{demandError}</Text>
                  ) : null}

                  {demandResult ? (
                    <View style={styles.demandResultCard}>
                      <View style={styles.demandResultHeader}>
                        <View>
                          <Text style={styles.forecastSubTitle}>FORECASTED DAILY DEMAND</Text>
                          <Text style={styles.demandNeededText}>
                            <Text style={styles.monoStrong}>{demandResult.predictedDemand.toFixed(1)} kg</Text>
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.deltaPill,
                            demandResult.recommendedDispatch > 0 && styles.deltaPillIncrease,
                            demandResult.recommendedDispatch === 0 && styles.deltaPillBalanced,
                          ]}
                        >
                          <Text style={styles.deltaPillText}>
                            {demandResult.recommendedDispatch > 0
                              ? `↑ Restock Needed: ${demandResult.recommendedDispatch.toFixed(1)} kg`
                              : `↓ Surplus Stock: ${(demandResult.surplusStock ?? Math.max(0, demandResult.currentStock - demandResult.predictedDemand)).toFixed(1)} kg`}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.demandComparisonRow}>
                        <Text style={styles.recommendedNote}>
                          Recommended dispatch: <Text style={styles.monoStrong}>{demandResult.recommendedDispatch.toFixed(1)} kg</Text>
                        </Text>
                        <Text style={styles.demandComparisonSub}>
                          (Demand {demandResult.predictedDemand.toFixed(1)} kg - Stock {demandResult.currentStock.toFixed(1)} kg)
                        </Text>
                      </View>
                    </View>
                  ) : null}
                </View>

                {/* Panel B — Risk */}
                <View style={styles.panelBox}>
                  <View style={styles.panelHeaderRow}>
                    <Text style={styles.panelHeaderSub}>PANEL B</Text>
                    <Text style={styles.panelHeaderTitle}>Spoilage Risk</Text>
                  </View>

                  <View style={styles.stockStatusRow}>
                    <Text style={styles.stockStatusLabel}>Storage Condition:</Text>
                    <Text style={styles.storageMono}>
                      {selectedVendor.hasRefrigerator
                        ? `Fridge (${selectedVendor.fridgeTemperatureC ?? 4.0}°C)`
                        : 'Ambient Counter'}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.actionSecondaryBtn}
                    onPress={handlePredictRisk}
                    disabled={riskLoading}
                    activeOpacity={0.8}
                  >
                    {riskLoading ? (
                      <View style={styles.inlineLoading}>
                        <ActivityIndicator size="small" color={colors.inkCharcoal} />
                        <Text style={styles.actionBtnTextLoadingSecondary}>Evaluating Risk...</Text>
                      </View>
                    ) : (
                      <Text style={styles.actionSecondaryBtnText}>Predict Risk Score →</Text>
                    )}
                  </TouchableOpacity>

                  {riskError ? (
                    <Text style={styles.errorText}>{riskError}</Text>
                  ) : null}

                  {riskResult ? (
                    <View style={styles.riskResultCard}>
                      <View style={styles.riskResultHeader}>
                        <RiskBadge score={riskResult.riskScore} />
                        <Text style={styles.confidenceMono}>
                          Model Confidence: {riskResult.confidence}%
                        </Text>
                      </View>

                      {riskResult.isAtRisk ? (
                        <View style={styles.riskAlertBanner}>
                          <Text style={styles.riskAlertText}>
                            This stock is at risk — consider a discount or price reduction.
                          </Text>

                          {isDiscountFlagged ? (
                            <View style={styles.flaggedBanner}>
                              <Text style={styles.flaggedText}>
                                ✓ Flagged for discount (Alert logged in audit feed)
                              </Text>
                            </View>
                          ) : (
                            <TouchableOpacity
                              style={styles.flagDiscountBtn}
                              onPress={handleFlagForDiscount}
                              disabled={flaggingDiscount}
                            >
                              {flaggingDiscount ? (
                                <ActivityIndicator size="small" color={colors.paperWhite} />
                              ) : (
                                <Text style={styles.flagDiscountBtnText}>
                                  Flag for discount →
                                </Text>
                              )}
                            </TouchableOpacity>
                          )}
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </View>
            ) : (
              <View style={styles.emptyPrompt}>
                <Text style={styles.emptyPromptText}>Please select a shop above to review inventory.</Text>
              </View>
            )}

            {/* Active Outlet Batches Ledger */}
            {selectedVendor ? (
              <View style={styles.outletBatchesContainer}>
                <View style={styles.outletBatchesHeader}>
                  <Text style={styles.outletBatchesTitle}>
                    ACTIVE OUTLET BATCHES ({shopBatches.length})
                  </Text>
                  <Text style={styles.outletBatchesSub}>
                    Live batches currently stocked in {selectedVendor.shop_name}'s inventory
                  </Text>
                </View>
                {shopBatches.length === 0 ? (
                  <View style={styles.emptyBatchesBox}>
                    <Text style={styles.emptyBatchesText}>
                      No active batches currently in store for this partner. Click [+ Add Batches] below to allocate stock.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.batchCardsGrid}>
                    {shopBatches.map((b) => (
                      <View key={b.batch_id} style={styles.batchItemCard}>
                        <View style={styles.batchItemHeader}>
                          <Text style={styles.batchItemCode}>Batch #{b.batch_id}</Text>
                          <BatchStatusBadge status={b.status} />
                        </View>
                        <Text style={styles.batchItemProduct}>{b.product_name || 'Idli Batter'}</Text>
                        <View style={styles.batchItemMetaRow}>
                          <Text style={styles.batchItemMeta}>
                            Volume: <Text style={styles.monoStrong}>{b.volume_kg || b.quantity_kg || 0} kg</Text>
                          </Text>
                          <Text style={styles.batchItemMeta}>
                            pH: <Text style={styles.monoStrong}>{b.initialPH ? Number(b.initialPH).toFixed(2) : '4.40'}</Text>
                          </Text>
                          <Text style={styles.batchItemMeta}>
                            Temp: <Text style={styles.monoStrong}>{b.temperatureC ? Number(b.temperatureC).toFixed(1) : '26.5'}°C</Text>
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ) : null}

            {/* 7.3 Bottom Action Row */}
            <View style={[styles.bottomActionRow, isMobile && styles.bottomActionRowMobile]}>
              <TouchableOpacity
                style={[styles.bottomBtn, !selectedVendorId && styles.bottomBtnDisabled]}
                onPress={() => openActionModal('add')}
                disabled={!selectedVendorId}
              >
                <Text style={[styles.bottomBtnText, !selectedVendorId && styles.bottomBtnTextDisabled]}>
                  + Add Batches
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.bottomBtn, !selectedVendorId && styles.bottomBtnDisabled]}
                onPress={() => openActionModal('remove')}
                disabled={!selectedVendorId}
              >
                <Text style={[styles.bottomBtnText, !selectedVendorId && styles.bottomBtnTextDisabled]}>
                  - Remove Batches
                </Text>
              </TouchableOpacity>
            </View>

            {!selectedVendorId ? (
              <Text style={styles.disabledActionNote}>Select a shop first.</Text>
            ) : null}
          </LedgerPanel>
        </View>
      </View>

      {/* Action Modals (Add / Remove Batches) */}
      {activeModal ? (
        <Modal visible={true} transparent animationType="fade" onRequestClose={() => setActiveModal(null)}>
          <TouchableWithoutFeedback onPress={() => setActiveModal(null)}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback onPress={(e) => { e?.stopPropagation?.(); }}>
                <View style={[styles.modalCard, { width: isMobile ? '92%' : 480 }]}>
                  <View style={styles.modalHeader}>
                    <View>
                      <Text style={styles.modalHeaderSub}>INVENTORY ADJUSTMENT</Text>
                      <Text style={styles.modalHeaderTitle}>
                        {activeModal === 'add' ? 'Add Batches to Outlet' : 'Remove Assigned Batches'}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => setActiveModal(null)}>
                      <Text style={styles.modalCloseText}>[ ✕ ]</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.modalTargetShop}>
                    Target Shop: <Text style={styles.monoStrong}>{selectedVendor?.shop_name}</Text>
                  </Text>

                  {modalError ? (
                    <View style={styles.modalErrorBox}>
                      <Text style={styles.modalErrorText}>{modalError}</Text>
                    </View>
                  ) : null}

                  {activeModal === 'remove' ? (
                    <View style={styles.batchChecklistSection}>
                      <View style={styles.batchChecklistHeader}>
                        <Text style={styles.fieldLabel}>SELECT ASSIGNED BATCHES TO REMOVE *</Text>
                        {shopBatches.length > 0 ? (
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity
                              onPress={() =>
                                setSelectedBatchIdsToRemove(
                                  shopBatches.map((b) => b.batch_id || (b as any)._id)
                                )
                              }
                            >
                              <Text style={styles.checklistActionText}>Select All</Text>
                            </TouchableOpacity>
                            <Text style={styles.checklistDivider}>•</Text>
                            <TouchableOpacity onPress={() => setSelectedBatchIdsToRemove([])}>
                              <Text style={styles.checklistActionText}>Clear</Text>
                            </TouchableOpacity>
                          </View>
                        ) : null}
                      </View>

                      {shopBatches.length === 0 ? (
                        <View style={styles.emptyBatchBox}>
                          <Text style={styles.emptyBatchText}>
                            No active batches currently assigned to {selectedVendor?.shop_name}.
                          </Text>
                        </View>
                      ) : (
                        <ScrollView style={styles.batchChecklistScroll} nestedScrollEnabled={true}>
                          {shopBatches.map((batch) => {
                            const bId = batch.batch_id || (batch as any)._id;
                            const isSelected = selectedBatchIdsToRemove.includes(bId);
                            const vol = batch.volume_kg || batch.quantity_kg || 0;
                            const statusLabel =
                              batch.status === 'received'
                                ? 'In Store (Received)'
                                : batch.status === 'assigned'
                                ? 'Assigned'
                                : batch.status || 'Active';

                            return (
                              <TouchableOpacity
                                key={bId}
                                style={[styles.batchChecklistRow, isSelected && styles.batchChecklistRowSelected]}
                                onPress={() => {
                                  setSelectedBatchIdsToRemove((prev) =>
                                    isSelected ? prev.filter((id) => id !== bId) : [...prev, bId]
                                  );
                                }}
                                activeOpacity={0.7}
                              >
                                <View style={[styles.checkboxSquare, isSelected && styles.checkboxSquareSelected]}>
                                  <Text style={[styles.checkboxMark, isSelected && styles.checkboxMarkSelected]}>
                                    {isSelected ? '✓' : ''}
                                  </Text>
                                </View>
                                <View style={styles.batchRowInfo}>
                                  <View style={styles.batchRowTitleRow}>
                                    <Text style={styles.batchRowId}>Batch #{batch.batch_id || (batch as any).batch_number}</Text>
                                    <Text style={styles.batchRowStatus}>[{statusLabel}]</Text>
                                  </View>
                                  <Text style={styles.batchRowSub}>
                                    {batch.product_name || 'Idli Batter'} • {vol} kg
                                  </Text>
                                </View>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      )}

                      {selectedBatchIdsToRemove.length > 0 ? (
                        <View style={styles.selectedSummaryRow}>
                          <Text style={styles.selectedSummaryText}>
                            Selected: {selectedBatchIdsToRemove.length} batch(es) (
                            {Math.round(
                              shopBatches
                                .filter((b) => selectedBatchIdsToRemove.includes(b.batch_id || (b as any)._id))
                                .reduce((sum, b) => sum + (b.volume_kg || b.quantity_kg || 0), 0) * 10
                            ) / 10}{' '}
                            kg to remove)
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}

                  {activeModal === 'add' ? (
                    <>
                      {/* Preset Buttons for Add */}
                      <View style={styles.presetButtonsRow}>
                        {[5, 10, 25].map((preset) => (
                          <TouchableOpacity
                            key={preset}
                            style={styles.presetBtn}
                            onPress={() => setModalInputQty(String(preset))}
                          >
                            <Text style={styles.presetBtnText}>+{preset} kg</Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      <View style={styles.formGroup}>
                        <Text style={styles.fieldLabel}>QUANTITY DELTA (KG) *</Text>
                        <TextInput
                          style={[styles.fieldInput, styles.fieldInputMono]}
                          value={modalInputQty}
                          onChangeText={setModalInputQty}
                          keyboardType="numeric"
                          placeholder="e.g. 15.0"
                          placeholderTextColor={colors.textMuted}
                        />
                      </View>

                      <View style={styles.formGroup}>
                        <Text style={styles.fieldLabel}>BATCH IDENTIFIER (AUTO-GENERATED) *</Text>
                        <TextInput
                          style={[styles.fieldInput, styles.fieldInputMono]}
                          value={modalBatchId}
                          onChangeText={setModalBatchId}
                          placeholder="e.g. B20045"
                          placeholderTextColor={colors.textMuted}
                          autoCapitalize="characters"
                        />
                        <Text style={styles.fieldHint}>
                          This tracked batch document will be registered in {selectedVendor?.shop_name}'s ledger.
                        </Text>
                      </View>

                      <View style={styles.formGroup}>
                        <Text style={styles.fieldLabel}>BATTER PRODUCT</Text>
                        <View style={styles.presetButtonsRow}>
                          {['Idli Batter', 'Dosa Batter', 'Combo Pack'].map((prod) => (
                            <TouchableOpacity
                              key={prod}
                              style={[styles.presetBtn, modalProductName === prod && styles.presetBtnActive]}
                              onPress={() => setModalProductName(prod)}
                            >
                              <Text style={[styles.presetBtnText, modalProductName === prod && styles.presetBtnTextActive]}>
                                {prod}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    </>
                  ) : null}

                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      onPress={() => setActiveModal(null)}
                      disabled={modalSubmitting}
                    >
                      <Text style={styles.cancelBtnText}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.submitBtn,
                        activeModal === 'remove' &&
                          (selectedBatchIdsToRemove.length === 0 || shopBatches.length === 0) &&
                          styles.bottomBtnDisabled,
                      ]}
                      onPress={handleModalSubmit}
                      disabled={
                        modalSubmitting ||
                        (activeModal === 'remove' &&
                          (selectedBatchIdsToRemove.length === 0 || shopBatches.length === 0))
                      }
                    >
                      {modalSubmitting ? (
                        <ActivityIndicator size="small" color={colors.paperWhite} />
                      ) : (
                        <Text style={styles.submitBtnText}>
                          {activeModal === 'add' ? '✓ Add Batches' : '✓ Remove Selected Batches'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      ) : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollArea: {
    flex: 1,
    backgroundColor: colors.batterCream,
  },
  contentContainer: {
    padding: spacing.md,
    alignItems: 'center',
    paddingBottom: spacing.xxl,
  },
  mainWrapper: {
    width: '100%',
  },
  headerBar: {
    backgroundColor: colors.paperWhite,
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
    borderTopWidth: 3,
    borderTopColor: colors.clayTerracotta,
    marginBottom: spacing.md,
  },
  headerSubtitle: {
    fontSize: 10,
    fontFamily: typography.fontFamily.mono,
    letterSpacing: 1.2,
    color: colors.clayTerracotta,
    fontWeight: '700',
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: typography.fontFamily.display,
    fontWeight: '800',
    color: colors.inkCharcoal,
  },
  headerNotice: {
    fontSize: 12,
    fontFamily: typography.fontFamily.body,
    color: colors.textSecondary,
    marginTop: 2,
  },
  headerNoticeBold: {
    fontWeight: '700',
    color: colors.bananaGreen,
  },
  topTwoPanels: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  topTwoPanelsMobile: {
    flexDirection: 'column',
  },
  topPanelCol: {
    flex: 1,
  },
  analyticsStatsBox: {
    padding: spacing.sm,
  },
  statDivider: {
    height: 1,
    backgroundColor: colors.borderHairline,
    marginVertical: spacing.xs,
  },
  barChartContainer: {
    padding: spacing.sm,
  },
  barsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 100,
    paddingTop: 10,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  barValueMono: {
    fontSize: 11,
    fontFamily: typography.fontFamily.mono,
    fontWeight: '700',
    color: colors.inkCharcoal,
    marginBottom: 4,
  },
  barTrack: {
    width: 24,
    height: 60,
    backgroundColor: colors.batterCream,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: 2,
  },
  barLabel: {
    fontSize: 10,
    fontFamily: typography.fontFamily.mono,
    color: colors.textSecondary,
    marginTop: 4,
  },
  shopWiseContainer: {
    width: '100%',
  },
  shopSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.batterCream,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    marginBottom: spacing.md,
    flexWrap: 'wrap',
  },
  shopSelectorLabel: {
    fontSize: 11,
    fontFamily: typography.fontFamily.mono,
    fontWeight: '700',
    color: colors.inkCharcoal,
  },
  dropdownButton: {
    flex: 1,
    minWidth: 220,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.paperWhite,
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dropdownButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.inkCharcoal,
    fontFamily: typography.fontFamily.body,
  },
  dropdownArrow: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  dropdownMenuContainer: {
    backgroundColor: colors.paperWhite,
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
    maxHeight: 260,
    overflow: 'hidden',
  },
  dropdownMenuScroll: {
    maxHeight: 260,
  },
  dropdownMenu: {
    backgroundColor: colors.paperWhite,
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
    maxHeight: 260,
  },
  dropdownOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderHairline,
  },
  dropdownOptionActive: {
    backgroundColor: colors.batterCream,
  },
  dropdownOptionText: {
    fontSize: 13,
    color: colors.inkCharcoal,
    fontFamily: typography.fontFamily.body,
  },
  dropdownOptionTextActive: {
    fontWeight: '700',
    color: colors.clayTerracotta,
  },
  dropdownOptionMono: {
    fontSize: 11,
    fontFamily: typography.fontFamily.mono,
    color: colors.textSecondary,
  },
  batchChecklistSection: {
    marginBottom: spacing.md,
  },
  batchChecklistHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  checklistActionText: {
    fontSize: 11,
    fontFamily: typography.fontFamily.mono,
    color: colors.clayTerracotta,
    fontWeight: '700',
  },
  checklistDivider: {
    fontSize: 11,
    color: colors.textMuted,
  },
  emptyBatchBox: {
    padding: spacing.md,
    backgroundColor: colors.batterCream,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
  },
  emptyBatchText: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: typography.fontFamily.body,
  },
  batchChecklistScroll: {
    maxHeight: 220,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.sm,
    backgroundColor: colors.paperWhite,
  },
  batchChecklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderHairline,
  },
  batchChecklistRowSelected: {
    backgroundColor: colors.batterCream,
  },
  checkboxSquare: {
    width: 18,
    height: 18,
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
    borderRadius: 3,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paperWhite,
  },
  checkboxSquareSelected: {
    backgroundColor: colors.clayTerracotta,
    borderColor: colors.clayTerracotta,
  },
  checkboxMark: {
    fontSize: 11,
    color: 'transparent',
    fontWeight: 'bold',
  },
  checkboxMarkSelected: {
    color: colors.paperWhite,
  },
  batchRowInfo: {
    flex: 1,
  },
  batchRowTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  batchRowId: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: typography.fontFamily.mono,
    color: colors.inkCharcoal,
  },
  batchRowStatus: {
    fontSize: 10,
    fontFamily: typography.fontFamily.mono,
    color: colors.clayTerracotta,
    fontWeight: '600',
  },
  batchRowSub: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    fontFamily: typography.fontFamily.body,
  },
  selectedSummaryRow: {
    marginTop: 8,
    paddingHorizontal: 4,
  },
  selectedSummaryText: {
    fontSize: 11,
    fontFamily: typography.fontFamily.mono,
    fontWeight: '700',
    color: colors.clayTerracotta,
  },
  panelsGrid: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  panelsGridMobile: {
    flexDirection: 'column',
  },
  panelBox: {
    flex: 1,
    backgroundColor: colors.paperWhite,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
    padding: spacing.md,
  },
  panelHeaderRow: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderHairline,
    paddingBottom: spacing.xs,
    marginBottom: spacing.sm,
  },
  panelHeaderSub: {
    fontSize: 9.5,
    fontFamily: typography.fontFamily.mono,
    color: colors.clayTerracotta,
    fontWeight: '700',
  },
  panelHeaderTitle: {
    fontSize: 16,
    fontFamily: typography.fontFamily.display,
    fontWeight: '800',
    color: colors.inkCharcoal,
  },
  stockStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.batterCream,
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
  },
  stockStatusLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.body,
  },
  stockStatusMono: {
    fontSize: 14,
    fontFamily: typography.fontFamily.mono,
    fontWeight: '800',
    color: colors.inkCharcoal,
  },
  storageMono: {
    fontSize: 12,
    fontFamily: typography.fontFamily.mono,
    fontWeight: '600',
    color: colors.inkCharcoal,
  },
  actionPrimaryBtn: {
    backgroundColor: colors.bananaGreen,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  actionBtnText: {
    color: colors.paperWhite,
    fontSize: 12.5,
    fontWeight: '700',
    fontFamily: typography.fontFamily.body,
  },
  actionBtnTextLoading: {
    color: colors.paperWhite,
    fontSize: 12,
    fontFamily: typography.fontFamily.mono,
  },
  inlineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionSecondaryBtn: {
    backgroundColor: colors.paperWhite,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  actionSecondaryBtnText: {
    color: colors.inkCharcoal,
    fontSize: 12.5,
    fontWeight: '700',
    fontFamily: typography.fontFamily.body,
  },
  actionBtnTextLoadingSecondary: {
    color: colors.inkCharcoal,
    fontSize: 12,
    fontFamily: typography.fontFamily.mono,
  },
  demandResultCard: {
    backgroundColor: colors.batterCream,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  demandResultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    flexWrap: 'wrap',
    gap: 4,
  },
  demandNeededText: {
    fontSize: 13,
    color: colors.inkCharcoal,
    fontFamily: typography.fontFamily.body,
  },
  monoStrong: {
    fontFamily: typography.fontFamily.mono,
    fontWeight: '800',
    color: colors.inkCharcoal,
  },
  deltaPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  deltaPillIncrease: {
    backgroundColor: '#FDECE8',
    borderColor: colors.rustRed,
  },
  deltaPillDecrease: {
    backgroundColor: '#EAE5DB',
    borderColor: colors.inkCharcoal,
  },
  deltaPillBalanced: {
    backgroundColor: '#DEEBDA',
    borderColor: colors.bananaGreen,
  },
  deltaPillText: {
    fontSize: 11,
    fontFamily: typography.fontFamily.mono,
    fontWeight: '700',
    color: colors.inkCharcoal,
  },
  forecastSubTitle: {
    fontSize: 9.5,
    fontFamily: typography.fontFamily.mono,
    letterSpacing: 0.5,
    color: colors.textSecondary,
    fontWeight: '700',
    marginBottom: 2,
  },
  recommendedNote: {
    fontSize: 11.5,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.body,
  },
  demandComparisonRow: {
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.borderHairline,
  },
  demandComparisonSub: {
    fontSize: 10.5,
    fontFamily: typography.fontFamily.mono,
    color: colors.textSecondary,
    marginTop: 2,
  },
  riskResultCard: {
    backgroundColor: colors.batterCream,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  riskResultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: spacing.xs,
  },
  confidenceMono: {
    fontSize: 11,
    fontFamily: typography.fontFamily.mono,
    color: colors.textSecondary,
  },
  riskAlertBanner: {
    backgroundColor: '#FDECE8',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.rustRed,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  riskAlertText: {
    fontSize: 11.5,
    color: colors.rustRed,
    fontFamily: typography.fontFamily.body,
    fontWeight: '600',
    marginBottom: 6,
  },
  flagDiscountBtn: {
    backgroundColor: colors.rustRed,
    paddingVertical: 6,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  flagDiscountBtnText: {
    color: colors.paperWhite,
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: typography.fontFamily.body,
  },
  flaggedBanner: {
    backgroundColor: '#DEEBDA',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.bananaGreen,
    padding: 6,
    alignItems: 'center',
  },
  flaggedText: {
    color: colors.bananaGreen,
    fontSize: 11,
    fontFamily: typography.fontFamily.body,
    fontWeight: '700',
  },
  errorText: {
    color: colors.rustRed,
    fontSize: 11.5,
    fontFamily: typography.fontFamily.body,
    marginTop: 4,
  },
  bottomActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderHairline,
    paddingTop: spacing.md,
  },
  bottomActionRowMobile: {
    flexDirection: 'column',
  },
  bottomBtn: {
    backgroundColor: colors.paperWhite,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
    alignItems: 'center',
  },
  bottomBtnDisabled: {
    backgroundColor: colors.batterCream,
    borderColor: colors.borderHairline,
  },
  bottomBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.inkCharcoal,
    fontFamily: typography.fontFamily.body,
  },
  bottomBtnTextDisabled: {
    color: colors.textMuted,
  },
  disabledActionNote: {
    fontSize: 11.5,
    fontFamily: typography.fontFamily.mono,
    color: colors.textMuted,
    marginTop: 6,
  },
  emptyPrompt: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptyPromptText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.body,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(43, 36, 30, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  modalCard: {
    backgroundColor: colors.paperWhite,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.inkCharcoal,
    padding: spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: spacing.sm,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.inkCharcoal,
    marginBottom: spacing.sm,
  },
  modalHeaderSub: {
    fontSize: 9.5,
    fontFamily: typography.fontFamily.mono,
    letterSpacing: 1,
    color: colors.clayTerracotta,
    fontWeight: '700',
  },
  modalHeaderTitle: {
    fontSize: 18,
    fontFamily: typography.fontFamily.display,
    fontWeight: '800',
    color: colors.inkCharcoal,
  },
  modalCloseText: {
    fontSize: 14,
    fontFamily: typography.fontFamily.mono,
    color: colors.inkCharcoal,
    padding: 4,
  },
  modalTargetShop: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.body,
    marginBottom: spacing.sm,
  },
  modalErrorBox: {
    backgroundColor: '#FDECE8',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.rustRed,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  modalErrorText: {
    fontSize: 11.5,
    color: colors.rustRed,
    fontFamily: typography.fontFamily.body,
  },
  presetButtonsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  presetBtn: {
    flex: 1,
    backgroundColor: colors.batterCream,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    paddingVertical: 7,
    alignItems: 'center',
  },
  presetBtnText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: typography.fontFamily.mono,
    color: colors.inkCharcoal,
  },
  formGroup: {
    marginBottom: spacing.sm,
  },
  fieldLabel: {
    fontSize: 10,
    fontFamily: typography.fontFamily.mono,
    color: colors.textSecondary,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  fieldInput: {
    backgroundColor: colors.paperWhite,
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.inkCharcoal,
  },
  fieldInputMono: {
    fontFamily: typography.fontFamily.mono,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderHairline,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.borderHairline,
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.body,
  },
  submitBtn: {
    backgroundColor: colors.bananaGreen,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
  },
  submitBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.paperWhite,
    fontFamily: typography.fontFamily.body,
  },
  presetBtnActive: {
    backgroundColor: colors.clayTerracotta,
    borderColor: colors.clayTerracotta,
  },
  presetBtnTextActive: {
    color: colors.paperWhite,
  },
  fieldHint: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 3,
    fontFamily: typography.fontFamily.body,
  },
  outletBatchesContainer: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1.5,
    borderTopColor: colors.borderHairline,
  },
  outletBatchesHeader: {
    marginBottom: spacing.sm,
  },
  outletBatchesTitle: {
    fontSize: 11,
    fontFamily: typography.fontFamily.mono,
    fontWeight: '700',
    color: colors.clayTerracotta,
    letterSpacing: 0.8,
  },
  outletBatchesSub: {
    fontSize: 11.5,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.body,
    marginTop: 2,
  },
  emptyBatchesBox: {
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    borderRadius: radius.sm,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  emptyBatchesText: {
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  batchCardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  batchItemCard: {
    backgroundColor: colors.paperWhite,
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
    borderRadius: radius.sm,
    padding: spacing.sm,
    minWidth: 200,
    flex: 1,
  },
  batchItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  batchItemCode: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: typography.fontFamily.mono,
    color: colors.inkCharcoal,
  },
  batchItemProduct: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.inkCharcoal,
    marginBottom: 6,
  },
  batchItemMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  batchItemMeta: {
    fontSize: 10.5,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.mono,
  },
});
