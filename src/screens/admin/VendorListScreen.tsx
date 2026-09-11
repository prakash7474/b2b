import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
  Modal,
  TouchableWithoutFeedback,
  useWindowDimensions,
} from 'react-native';
import { colors, radius, typography, spacing } from '../../theme';
import {
  LedgerPanel,
  PrimaryButton,
  RejectButton,
  ConfirmDialog,
  EmptyState,
  Skeleton,
} from '../../components/ledger';
import { useVendorStore } from '../../store/vendorStore';
import { vendorService } from '../../services/vendorService';
import { predictionService } from '../../services/predictionService';
import { Vendor } from '../../types/vendor';

type SortOption = 'demand' | 'name' | 'batches';

export const VendorListScreen: React.FC = () => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const { vendors, fetchVendors, isLoading } = useVendorStore();
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('demand');

  // Inline prediction cache per vendor: { [vendorId]: { demandKg: number, loading: boolean, error?: string } }
  const [predictions, setPredictions] = useState<Record<string, { demandKg: number; loading: boolean; error?: string }>>({});

  // Modal details state
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [terminatingVendor, setTerminatingVendor] = useState<Vendor | null>(null);
  const [isTerminating, setIsTerminating] = useState(false);

  useEffect(() => {
    fetchVendors();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchVendors();
    setRefreshing(false);
  };

  const handlePredictDemand = async (vendor: Vendor) => {
    const id = vendor.vendor_id;
    setPredictions((prev) => ({
      ...prev,
      [id]: { demandKg: 0, loading: true },
    }));

    try {
      const res = await predictionService.getVendorDemandForecast(id);
      const demand = res?.predictedDemand ?? Math.round(15 + (vendor.hotspotDensityScore || 30) * 0.3);
      setPredictions((prev) => ({
        ...prev,
        [id]: { demandKg: demand, loading: false },
      }));
    } catch (err) {
      setPredictions((prev) => ({
        ...prev,
        [id]: { demandKg: 0, loading: false, error: "Couldn't get prediction — try again" },
      }));
    }
  };

  const handleTerminateVendor = async () => {
    if (!terminatingVendor) return;
    try {
      setIsTerminating(true);
      await vendorService.updateVendor(terminatingVendor.vendor_id, {
        verificationStatus: 'terminated',
      });
      setSelectedVendor(null);
      setTerminatingVendor(null);
      await fetchVendors();
    } catch (err) {
      console.error('Failed to terminate vendor:', err);
    } finally {
      setIsTerminating(false);
    }
  };

  // Sort vendors
  const sortedVendors = [...vendors].sort((a, b) => {
    if (sortBy === 'name') {
      return (a.shop_name || '').localeCompare(b.shop_name || '');
    }
    if (sortBy === 'batches') {
      return (b.batch_count || 0) - (a.batch_count || 0);
    }
    // Default: by predicted demand descending
    const predA = predictions[a.vendor_id]?.demandKg ?? (a.hotspotDensityScore || 30);
    const predB = predictions[b.vendor_id]?.demandKg ?? (b.hotspotDensityScore || 30);
    return predB - predA;
  });

  const renderStarRating = (rating?: number) => {
    const count = Math.min(5, Math.max(1, Math.round(rating || 4)));
    const stars = '★'.repeat(count) + '☆'.repeat(5 - count);
    return `${stars} (${rating ?? 4.0}/5)`;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.clayTerracotta}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header with Sort Selector */}
        <View style={[styles.headerRow, isMobile && styles.headerRowMobile]}>
          <View>
            <Text style={styles.headerSub}>PARTNER OUTLET NETWORK</Text>
            <Text style={styles.headerTitle}>Vendors</Text>
          </View>

          {/* Sort Selector */}
          <View style={styles.sortBar}>
            <Text style={styles.sortLabel}>Sort by:</Text>
            <View style={styles.sortButtons}>
              {(['demand', 'name', 'batches'] as SortOption[]).map((opt) => {
                const active = sortBy === opt;
                const labelMap = {
                  demand: 'Demand (High)',
                  name: 'Shop Name',
                  batches: 'Total Batches',
                };
                return (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.sortBtn, active && styles.sortBtnActive]}
                    onPress={() => setSortBy(opt)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.sortBtnText, active && styles.sortBtnTextActive]}>
                      {labelMap[opt]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        {isLoading && vendors.length === 0 ? (
          <View>
            <Skeleton height={120} style={{ marginBottom: 12 }} />
            <Skeleton height={120} style={{ marginBottom: 12 }} />
            <Skeleton height={120} />
          </View>
        ) : sortedVendors.length === 0 ? (
          <EmptyState
            message="No active vendors registered"
            subtext="Check the Dashboard requisitions panel to approve new vendors."
          />
        ) : (
          <View style={styles.vendorGrid}>
            {sortedVendors.map((vendor) => {
              const predState = predictions[vendor.vendor_id];
              return (
                <View key={vendor.vendor_id} style={styles.vendorCardWrap}>
                  <LedgerPanel noPadding>
                    <View style={styles.cardHeader}>
                      <View style={styles.cardTitleCol}>
                        <Text style={styles.vendorIdText}>{vendor.vendor_id}</Text>
                        <Text style={styles.shopNameText}>{vendor.shop_name}</Text>
                      </View>
                      <View style={styles.batchCountBadge}>
                        <Text style={styles.batchCountNum}>
                          {vendor.batch_count ?? 0}
                        </Text>
                        <Text style={styles.batchCountLabel}>Batches Sent</Text>
                      </View>
                    </View>

                    <View style={styles.cardBody}>
                      <View style={styles.metaRow}>
                        <Text style={styles.metaLabel}>Owner / Phone:</Text>
                        <Text style={styles.metaValue}>
                          {vendor.owner_name || 'N/A'} • {vendor.phone || 'N/A'}
                        </Text>
                      </View>

                      <View style={styles.metaRow}>
                        <Text style={styles.metaLabel}>Business Area:</Text>
                        <Text style={styles.metaValue} numberOfLines={1}>
                          {vendor.address || vendor.localityTier || 'Area not listed'}
                        </Text>
                      </View>

                      {/* Inline Prediction Result Area */}
                      {predState?.loading ? (
                        <View style={styles.inlinePredBox}>
                          <Text style={styles.predLoadingText}>
                            Calculating XGBoost demand forecast...
                          </Text>
                        </View>
                      ) : predState?.error ? (
                        <View style={styles.inlinePredBoxError}>
                          <Text style={styles.predErrorText}>{predState.error}</Text>
                          <TouchableOpacity
                            style={styles.retryLink}
                            onPress={() => handlePredictDemand(vendor)}
                          >
                            <Text style={styles.retryLinkText}>Retry</Text>
                          </TouchableOpacity>
                        </View>
                      ) : predState?.demandKg !== undefined ? (
                        <View style={styles.inlinePredBoxSuccess}>
                          <View>
                            <Text style={styles.predSuccessLabel}>ML Demand Projection</Text>
                            <Text style={styles.predSuccessValue}>
                              Needs ~{predState.demandKg} kg currently
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={styles.refreshAffordance}
                            onPress={() => handlePredictDemand(vendor)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.refreshText}>[↻ Re-run]</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}

                      {/* Card Action Buttons */}
                      <View style={styles.cardActions}>
                        <PrimaryButton
                          label={predState?.demandKg !== undefined ? 'Re-predict' : 'Predict Demand'}
                          onPress={() => handlePredictDemand(vendor)}
                          isLoading={predState?.loading}
                          size="sm"
                          style={styles.actionBtn}
                        />
                        <TouchableOpacity
                          style={styles.detailsBtn}
                          onPress={() => setSelectedVendor(vendor)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.detailsBtnText}>View more details →</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </LedgerPanel>
                </View>
              );
            })}
          </View>
        )}

        {/* 5.1 View More Details Modal */}
        <Modal
          visible={!!selectedVendor}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedVendor(null)}
        >
          <TouchableWithoutFeedback onPress={() => setSelectedVendor(null)}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.detailsModalBox}>
                  <View style={styles.modalHeader}>
                    <View>
                      <Text style={styles.modalSub}>{selectedVendor?.vendor_id}</Text>
                      <Text style={styles.modalTitle}>{selectedVendor?.shop_name}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setSelectedVendor(null)}
                      style={styles.closeBtn}
                    >
                      <Text style={styles.closeText}>[Close]</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.modalBody}>
                    <View style={styles.specRow}>
                      <Text style={styles.specLabel}>Owner Contact:</Text>
                      <Text style={styles.specVal}>
                        {selectedVendor?.owner_name} ({selectedVendor?.phone})
                      </Text>
                    </View>
                    <View style={styles.specRow}>
                      <Text style={styles.specLabel}>Delivery Address:</Text>
                      <Text style={styles.specVal}>{selectedVendor?.address}</Text>
                    </View>
                    <View style={styles.specRow}>
                      <Text style={styles.specLabel}>Locality Tier:</Text>
                      <Text style={styles.specValMono}>
                        {selectedVendor?.localityTier || 'residential_budget'}
                      </Text>
                    </View>
                    <View style={styles.specRow}>
                      <Text style={styles.specLabel}>Hotspot Score:</Text>
                      <Text style={styles.specValMono}>
                        {selectedVendor?.hotspotDensityScore ?? 30}/100
                      </Text>
                    </View>

                    <View style={styles.modalDivider} />

                    <View style={styles.specRow}>
                      <Text style={styles.specLabel}>Refrigerator Equipped:</Text>
                      <Text
                        style={[
                          styles.specVal,
                          {
                            color: selectedVendor?.hasRefrigerator
                              ? colors.bananaGreen
                              : colors.textSecondary,
                            fontWeight: '700',
                          },
                        ]}
                      >
                        {selectedVendor?.hasRefrigerator ? 'Yes' : 'No'}
                      </Text>
                    </View>
                    <View style={styles.specRow}>
                      <Text style={styles.specLabel}>Storage Type:</Text>
                      <Text style={styles.specVal}>
                        {selectedVendor?.storageType || (selectedVendor?.hasRefrigerator ? 'Fridge' : 'Shelf')}
                      </Text>
                    </View>
                    <View style={styles.specRow}>
                      <Text style={styles.specLabel}>Cooling Temperature:</Text>
                      <Text style={styles.specValMono}>
                        {selectedVendor?.hasRefrigerator
                          ? `${selectedVendor?.fridgeTemperatureC ?? 4}°C`
                          : 'Ambient'}
                      </Text>
                    </View>
                    <View style={styles.specRow}>
                      <Text style={styles.specLabel}>Partner Rating:</Text>
                      <Text style={[styles.specVal, { color: colors.turmericGold }]}>
                        {renderStarRating(selectedVendor?.rating)}
                      </Text>
                    </View>

                    <View style={styles.modalDivider} />

                    {/* Terminate Relationship Section */}
                    <View style={styles.terminateSection}>
                      <Text style={styles.terminateWarning}>
                        Terminating business status removes this vendor from active dispatch lists.
                      </Text>
                      <RejectButton
                        label="Terminate Business Relationship"
                        onPress={() => setTerminatingVendor(selectedVendor)}
                      />
                    </View>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* Terminate Confirmation Dialog */}
        <ConfirmDialog
          visible={!!terminatingVendor}
          title="Terminate Vendor Relationship"
          message={`Terminate business relationship with ${terminatingVendor?.shop_name}? This removes them from active distribution lists.`}
          confirmLabel="Terminate Vendor"
          cancelLabel="Keep Active"
          isDestructive
          onConfirm={handleTerminateVendor}
          onCancel={() => setTerminatingVendor(null)}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.batterCream,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: spacing.md,
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  headerRowMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  headerSub: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.clayTerracotta,
    fontFamily: typography.mono,
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.inkCharcoal,
    fontFamily: typography.heading,
  },
  sortBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  sortLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.textMuted,
    fontFamily: typography.mono,
    textTransform: 'uppercase',
  },
  sortButtons: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.inkCharcoal,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.paperWhite,
  },
  sortBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRightWidth: 1,
    borderRightColor: colors.borderLight,
  },
  sortBtnActive: {
    backgroundColor: colors.clayTerracotta,
  },
  sortBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.inkCharcoal,
  },
  sortBtnTextActive: {
    color: colors.paperWhite,
    fontWeight: '700',
  },
  vendorGrid: {
    gap: spacing.md,
  },
  vendorCardWrap: {
    width: '100%',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.paperWhite,
  },
  cardTitleCol: {
    flex: 1,
  },
  vendorIdText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.clayTerracotta,
    fontFamily: typography.mono,
  },
  shopNameText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.inkCharcoal,
    fontFamily: typography.heading,
  },
  batchCountBadge: {
    alignItems: 'flex-end',
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  batchCountNum: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.inkCharcoal,
    fontFamily: typography.mono,
  },
  batchCountLabel: {
    fontSize: 9.5,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  cardBody: {
    padding: spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 6,
    gap: 6,
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    fontFamily: typography.mono,
    width: 110,
  },
  metaValue: {
    fontSize: 13,
    color: colors.textPrimary,
    flex: 1,
  },
  inlinePredBox: {
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginVertical: spacing.sm,
  },
  predLoadingText: {
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  inlinePredBoxError: {
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.rustRed,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginVertical: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  predErrorText: {
    fontSize: 12,
    color: colors.rustRed,
    flex: 1,
  },
  retryLink: {
    marginLeft: spacing.sm,
  },
  retryLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.rustRed,
    textDecorationLine: 'underline',
  },
  inlinePredBoxSuccess: {
    backgroundColor: colors.successBg,
    borderWidth: 1,
    borderColor: colors.bananaGreen,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginVertical: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  predSuccessLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.bananaGreen,
    textTransform: 'uppercase',
    fontFamily: typography.mono,
  },
  predSuccessValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.bananaGreen,
    fontFamily: typography.mono,
  },
  refreshAffordance: {
    padding: 4,
  },
  refreshText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.bananaGreen,
    fontFamily: typography.mono,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  actionBtn: {
    minWidth: 120,
  },
  detailsBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  detailsBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.clayTerracotta,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(43, 36, 30, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  detailsModalBox: {
    width: '100%',
    maxWidth: 500,
    backgroundColor: colors.paperWhite,
    borderWidth: 1.5,
    borderTopWidth: 2.5,
    borderColor: colors.inkCharcoal,
    borderRadius: radius.md,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  modalSub: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.clayTerracotta,
    fontFamily: typography.mono,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.inkCharcoal,
    fontFamily: typography.heading,
  },
  closeBtn: {
    padding: 4,
  },
  closeText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
  },
  modalBody: {
    padding: spacing.md,
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  specLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  specVal: {
    fontSize: 13,
    color: colors.textPrimary,
  },
  specValMono: {
    fontSize: 12.5,
    color: colors.inkCharcoal,
    fontFamily: typography.mono,
    fontWeight: '600',
  },
  modalDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.sm + 2,
  },
  terminateSection: {
    marginTop: spacing.xs,
    alignItems: 'stretch',
    gap: spacing.sm,
  },
  terminateWarning: {
    fontSize: 11.5,
    color: colors.rustRed,
    lineHeight: 16,
  },
});
