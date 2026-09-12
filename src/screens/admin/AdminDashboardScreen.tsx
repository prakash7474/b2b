import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  SafeAreaView,
  useWindowDimensions,
  Modal,
  TouchableWithoutFeedback,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, radius, typography, spacing } from '../../theme';
import {
  LedgerPanel,
  StatRow,
  GhostLinkButton,
  AcceptButton,
  RejectButton,
  ConfirmDialog,
  EmptyState,
  Skeleton,
} from '../../components/ledger';
import { inventoryService } from '../../services/inventoryService';
import { vendorService } from '../../services/vendorService';
import { batchService } from '../../services/batchService';
import { RestockRequest, Batch } from '../../types/batch';

export const AdminDashboardScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Requisitions & Restock action state
  const [rejectingVendor, setRejectingVendor] = useState<any | null>(null);
  const [rejectingRequest, setRejectingRequest] = useState<RestockRequest | null>(null);
  const [fulfillingRequest, setFulfillingRequest] = useState<RestockRequest | null>(null);
  const [availableCreatedBatches, setAvailableCreatedBatches] = useState<Batch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [isFulfilling, setIsFulfilling] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [inspectingCert, setInspectingCert] = useState<any | null>(null);
  const [restockRequests, setRestockRequests] = useState<RestockRequest[]>([]);

  const loadDashboard = async () => {
    try {
      setIsLoading(true);
      const [res, restockRes] = await Promise.all([
        inventoryService.getDashboardSummary().catch((err) => {
          console.warn('getDashboardSummary error:', err);
          return null;
        }),
        inventoryService.getRestockRequests({ status: 'pending' }).catch((err) => {
          console.warn('getRestockRequests error:', err);
          return [];
        }),
      ]);

      if (res) setData(res);

      const reqList = (Array.isArray(restockRes) && restockRes.length > 0)
        ? restockRes
        : (Array.isArray(res?.restockRequests) ? res.restockRequests : []);

      setRestockRequests(reqList);
    } catch (err) {
      console.error('Failed to load dashboard summary:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboard();
  };

  const handleAcceptRequisition = async (vendor: any) => {
    try {
      setActionLoadingId(vendor.vendor_id);
      await vendorService.updateVendor(vendor.vendor_id, { verificationStatus: 'active' });
      // Remove from local list immediately
      setData((prev: any) => ({
        ...prev,
        requisitions: (prev.requisitions || []).filter(
          (r: any) => r.vendor_id !== vendor.vendor_id
        ),
        fleet: {
          ...prev.fleet,
          totalActiveVendors: (prev.fleet?.totalActiveVendors || 0) + 1,
        },
      }));
    } catch (err) {
      console.error('Failed to accept vendor requisition:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectingVendor) return;
    try {
      setActionLoadingId(rejectingVendor.vendor_id);
      await vendorService.updateVendor(rejectingVendor.vendor_id, {
        verificationStatus: 'rejected',
      });
      setData((prev: any) => ({
        ...prev,
        requisitions: (prev.requisitions || []).filter(
          (r: any) => r.vendor_id !== rejectingVendor.vendor_id
        ),
      }));
    } catch (err) {
      console.error('Failed to reject vendor requisition:', err);
    } finally {
      setActionLoadingId(null);
      setRejectingVendor(null);
    }
  };

  const handleStartFulfill = async (request: RestockRequest) => {
    const reqId = request.request_id || request.linked_order_id;
    try {
      setActionLoadingId(reqId);
      const batches = await batchService.getAvailableBatches();
      setActionLoadingId(null);
      if (!batches || batches.length === 0) {
        Alert.alert(
          'Cannot Fulfill Requisition',
          'There are NO unassigned batches in the Created list in Central Kitchen inventory.\n\nOnly if an unassigned batch exists in the batch list can requisition requests be fulfilled. Please produce a new batch in the Batches tab first.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Create Batch →', onPress: () => navigation.navigate('Batches') }
          ]
        );
        return;
      }
      setAvailableCreatedBatches(batches);
      const match = request.requested_batch_id && batches.find(b => b.batch_id === request.requested_batch_id);
      setSelectedBatchId(match ? match.batch_id : batches[0].batch_id);
      setFulfillingRequest(request);
    } catch (err: any) {
      setActionLoadingId(null);
      Alert.alert('Error', err?.message || 'Failed to check available kitchen batches.');
    }
  };

  const handleConfirmFulfill = async () => {
    if (!fulfillingRequest || !selectedBatchId) return;
    setIsFulfilling(true);
    const reqId = fulfillingRequest.request_id || fulfillingRequest.linked_order_id;
    try {
      const ok = await batchService.assignBatch(selectedBatchId, fulfillingRequest.vendor_id, reqId);
      if (ok) {
        setFulfillingRequest(null);
        await loadDashboard();
        Alert.alert(
          'Requisition Fulfilled',
          `Batch #${selectedBatchId} has been dispatched to ${fulfillingRequest.vendor_name || fulfillingRequest.vendor_id}!\n\nAny older active batch at this outlet has been archived.`
        );
      } else {
        Alert.alert('Error', 'Failed to assign batch.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || err?.message || 'Failed to assign batch.');
    } finally {
      setIsFulfilling(false);
    }
  };

  const fleet = data?.fleet || {};
  const inventory = data?.inventory || {};
  const demandTrends = data?.demandTrends || [];
  const topSpikeVendors = data?.topSpikeVendors || [];
  const spoilage = data?.spoilageDistribution || { green: 5, amber: 2, red: 1 };
  const requisitions = data?.requisitions || [];

  const totalSpoilageBatches = spoilage.green + spoilage.amber + spoilage.red || 1;
  const greenPct = Math.round((spoilage.green / totalSpoilageBatches) * 100);
  const amberPct = Math.round((spoilage.amber / totalSpoilageBatches) * 100);
  const redPct = 100 - greenPct - amberPct;

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
        {/* Page Title */}
        <View style={styles.pageHeader}>
          <Text style={styles.headerSub}>CENTRAL KITCHEN COMMAND</Text>
          <Text style={styles.headerTitle}>Operations Ledger</Text>
        </View>

        {/* 4.1 Top Row: Two Ledger Panels Side by Side (Stacked on mobile) */}
        <View style={[styles.topRow, isMobile && styles.topRowMobile]}>
          {/* Left Panel — Fleet Overview */}
          <View style={[styles.topCol, isMobile && styles.colFull]}>
            <LedgerPanel
              title="Fleet Overview"
              subtitle="LOGISTICS TELEMETRY"
              headerRight={
                <Text style={styles.activePill}>
                  {isLoading ? '...' : `${fleet.totalActiveVendors ?? 0} ACTIVE`}
                </Text>
              }
            >
              {isLoading ? (
                <View>
                  <Skeleton height={24} style={{ marginBottom: 8 }} />
                  <Skeleton height={24} style={{ marginBottom: 8 }} />
                  <Skeleton height={24} style={{ marginBottom: 8 }} />
                  <Skeleton height={24} />
                </View>
              ) : (
                <View>
                  <StatRow
                    label="Total Active Vendors"
                    value={fleet.totalActiveVendors ?? 0}
                  />
                  <StatRow
                    label="Total Batches (All Runs)"
                    value={fleet.totalBatches ?? 0}
                  />
                  <StatRow
                    label="Delivered Batches"
                    value={fleet.deliveredBatches ?? 0}
                  />
                  <StatRow
                    label="Batches in Transit"
                    value={fleet.batchesInTransit ?? 0}
                    borderBottom={false}
                    highlight={fleet.batchesInTransit > 0}
                  />

                  <View style={styles.linkBar}>
                    <GhostLinkButton
                      label="View vendor list"
                      onPress={() => navigation.navigate('Vendors')}
                    />
                    <GhostLinkButton
                      label="View batch list"
                      onPress={() => navigation.navigate('Batches')}
                    />
                  </View>
                </View>
              )}
            </LedgerPanel>
          </View>

          {/* Right Panel — Inventory Snapshot */}
          <View style={[styles.topCol, isMobile && styles.colFull]}>
            <LedgerPanel
              title="Inventory Snapshot"
              subtitle="CENTRAL & PARTNER RESERVES"
              headerRight={
                <Text style={styles.monoStockTag}>
                  {isLoading ? '...' : `${inventory.currentStockKg ?? 0} KG TOTAL`}
                </Text>
              }
            >
              {isLoading ? (
                <View>
                  <Skeleton height={24} style={{ marginBottom: 8 }} />
                  <Skeleton height={24} style={{ marginBottom: 8 }} />
                </View>
              ) : (
                <View>
                  <StatRow
                    label="Central Kitchen (Unassigned)"
                    value={inventory.centralStockKg ?? 0}
                    unit="kg"
                  />
                  <StatRow
                    label="Partner Stores (In Field)"
                    value={inventory.partnerStockKg ?? inventory.currentStockKg ?? 0}
                    unit="kg"
                  />
                  <StatRow
                    label="Shops with low stock"
                    value={inventory.lowStockShops ?? 0}
                    borderBottom={false}
                    highlight={inventory.lowStockShops > 0}
                  />

                  <View style={styles.linkBar}>
                    <GhostLinkButton
                      label="Redirect to stocks"
                      onPress={() => navigation.navigate('Stock')}
                    />
                  </View>
                </View>
              )}
            </LedgerPanel>
          </View>
        </View>

        {/* 4.2 Demand Trends & Predictions Panel (3 Widgets) */}
        <LedgerPanel
          title="Demand Trends & Predictions"
          subtitle="MACHINE LEARNING INFERENCE FEEDS"
        >
          {isLoading ? (
            <Skeleton height={140} />
          ) : (
            <View style={[styles.widgetsRow, isMobile && styles.widgetsRowMobile]}>
              {/* Widget 1: 7-day Demand Trend */}
              <View style={[styles.widgetBox, isMobile && styles.widgetBoxMobile]}>
                <Text style={styles.widgetHeading}>7-Day Fleet Demand</Text>
                <Text style={styles.widgetSub}>Predicted vs Actual (kg)</Text>
                <View style={styles.chartBars}>
                  {(() => {
                    const maxVal = Math.max(
                      1,
                      ...demandTrends.map((d: any) => Math.max(Number(d.predicted) || 0, Number(d.actual) || 0, 40))
                    );
                    const MAX_BAR_HEIGHT = 44;
                    return demandTrends.map((d: any, idx: number) => {
                      const predH = Math.max(4, Math.round(((Number(d.predicted) || 0) / maxVal) * MAX_BAR_HEIGHT));
                      const actH = Math.max(4, Math.round(((Number(d.actual) || 0) / maxVal) * MAX_BAR_HEIGHT));
                      return (
                        <View key={idx} style={styles.chartCol}>
                          <View style={styles.barPair}>
                            <View
                              style={[
                                styles.predBar,
                                { height: predH },
                              ]}
                            />
                            <View
                              style={[
                                styles.actBar,
                                { height: actH },
                              ]}
                            />
                          </View>
                          <Text style={styles.chartDayText}>{d.day}</Text>
                        </View>
                      );
                    });
                  })()}
                </View>
                <View style={styles.legendRow}>
                  <View style={styles.legendItem}>
                    <View style={styles.predDot} />
                    <Text style={styles.legendText}>Predicted</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={styles.actDot} />
                    <Text style={styles.legendText}>Actual</Text>
                  </View>
                </View>
              </View>

              {/* Widget 2: Top Vendors by Demand Spike */}
              <View style={[styles.widgetBox, isMobile && styles.widgetBoxMobile]}>
                <Text style={styles.widgetHeading}>Top Demand Spikes</Text>
                <Text style={styles.widgetSub}>Projected % surge vs trailing avg</Text>
                <View style={styles.spikeList}>
                  {topSpikeVendors.slice(0, 5).map((v: any, idx: number) => (
                    <View key={v.vendor_id || idx} style={styles.spikeRow}>
                      <Text style={styles.spikeRank}>{idx + 1}.</Text>
                      <Text style={styles.spikeName} numberOfLines={1}>
                        {v.shop_name}
                      </Text>
                      <Text style={styles.spikePct}>+{v.spikePct}%</Text>
                      <Text style={styles.spikeKg}>({v.predictedKg} kg)</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Widget 3: Fleet Spoilage Risk Distribution */}
              <View style={[styles.widgetBox, isMobile && styles.widgetBoxMobile]}>
                <Text style={styles.widgetHeading}>Spoilage Risk Spread</Text>
                <Text style={styles.widgetSub}>Active batch risk classification</Text>
                <View style={styles.distBarWrap}>
                  <View style={[styles.distSegment, { flex: Math.max(1, greenPct), backgroundColor: colors.bananaGreen }]} />
                  <View style={[styles.distSegment, { flex: Math.max(1, amberPct), backgroundColor: colors.turmericGold }]} />
                  <View style={[styles.distSegment, { flex: Math.max(1, redPct), backgroundColor: colors.rustRed }]} />
                </View>

                <View style={styles.spoilageBreakdown}>
                  <View style={styles.spoilageItem}>
                    <Text style={[styles.spoilageVal, { color: colors.bananaGreen }]}>
                      {spoilage.green}
                    </Text>
                    <Text style={styles.spoilageLbl}>Good (&lt;30%)</Text>
                  </View>
                  <View style={styles.spoilageItem}>
                    <Text style={[styles.spoilageVal, { color: colors.turmericGold }]}>
                      {spoilage.amber}
                    </Text>
                    <Text style={styles.spoilageLbl}>Attention (30-70%)</Text>
                  </View>
                  <View style={styles.spoilageItem}>
                    <Text style={[styles.spoilageVal, { color: colors.rustRed }]}>
                      {spoilage.red}
                    </Text>
                    <Text style={styles.spoilageLbl}>Critical (&gt;70%)</Text>
                  </View>
                </View>
              </View>
            </View>
          )}
        </LedgerPanel>

        {/* 4.3 Vendor Requisitions Panel */}
        <LedgerPanel
          title="Vendor Requisitions"
          subtitle="PENDING REGISTRATION APPLICATIONS"
          noPadding
        >
          {isLoading ? (
            <View style={{ padding: spacing.md }}>
              <Skeleton height={48} style={{ marginBottom: 8 }} />
              <Skeleton height={48} />
            </View>
          ) : requisitions.length === 0 ? (
            <EmptyState message="No vendor requests waiting" />
          ) : (
            <View style={styles.reqList}>
              {requisitions.map((v: any, index: number) => {
                const isOperating = actionLoadingId === v.vendor_id;
                return (
                  <View
                    key={v.vendor_id}
                    style={[
                      styles.reqRow,
                      index % 2 === 1 && styles.rowAlt,
                      isMobile && styles.reqRowMobile,
                    ]}
                  >
                    <View style={styles.reqInfo}>
                      <Text style={styles.reqShopName}>{v.shop_name}</Text>
                      <Text style={styles.reqDetails}>
                        Owner: {v.owner_name} • Phone: {v.phone}
                      </Text>
                      <Text style={styles.reqAddress}>{v.address}</Text>

                      {v.fssai_cert ? (
                        <TouchableOpacity
                          style={styles.certChip}
                          onPress={() => setInspectingCert(v)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.certText}>
                            Certification: {v.fssai_cert} [Inspect]
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>

                    <View style={styles.reqActions}>
                      <AcceptButton
                        label="Accept"
                        onPress={() => handleAcceptRequisition(v)}
                        isLoading={isOperating}
                        disabled={isOperating}
                      />
                      <RejectButton
                        label="Reject"
                        onPress={() => setRejectingVendor(v)}
                        disabled={isOperating}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </LedgerPanel>

        {/* 4.4 Restock Requests Panel */}
        <LedgerPanel
          title="Restock Requests"
          subtitle={`PENDING RESTOCK REQUESTS (${restockRequests.length})`}
          noPadding
        >
          {isLoading ? (
            <View style={{ padding: spacing.md }}>
              <Skeleton height={48} style={{ marginBottom: 8 }} />
              <Skeleton height={48} />
            </View>
          ) : restockRequests.length === 0 ? (
            <EmptyState message="No pending restock requests" />
          ) : (
            <View style={styles.reqList}>
              {restockRequests.map((request, index) => {
                const isOperating = actionLoadingId === request.request_id;
                return (
                  <View
                    key={request.request_id}
                    style={[
                      styles.reqRow,
                      index % 2 === 1 && styles.rowAlt,
                      isMobile && styles.reqRowMobile,
                    ]}
                  >
                    <View style={styles.reqInfo}>
                      <Text style={styles.reqShopName}>{request.vendor_name || request.vendor_id || 'Partner Shop'}</Text>
                      <Text style={styles.reqDetails}>
                        Product: {request.product_name} • Requested: {request.requested_quantity_kg} kg
                      </Text>
                      <Text style={styles.reqAddress}>
                        Current Stock: {request.current_stock_kg ?? 0} kg • Notes: {request.notes || 'None'}
                      </Text>
                      <Text style={styles.reqAddress}>
                        Requested At: {request.created_at ? new Date(request.created_at).toLocaleString() : 'Just now'}
                      </Text>
                      {request.requested_batch_id ? (
                        <Text style={[styles.reqDetails, { color: colors.clayTerracotta, fontWeight: '700' }]}>
                          Vendor Selected Batch: #{request.requested_batch_id}
                        </Text>
                      ) : null}
                    </View>

                    <View style={styles.reqActions}>
                      <AcceptButton
                        label="Fulfill & Assign"
                        onPress={() => handleStartFulfill(request)}
                        isLoading={isOperating}
                        disabled={isOperating}
                      />
                      <RejectButton
                        label="Reject"
                        onPress={() => setRejectingRequest(request)}
                        disabled={isOperating}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </LedgerPanel>

        {/* Fulfill Requisition Modal - Assigns from Created list */}
        <Modal
          visible={!!fulfillingRequest}
          transparent
          animationType="fade"
          onRequestClose={() => setFulfillingRequest(null)}
        >
          <TouchableWithoutFeedback onPress={() => setFulfillingRequest(null)}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.fulfillModalBox}>
                  <View style={styles.fulfillHeader}>
                    <Text style={styles.modalTitle}>Fulfill Requisition & Dispatch</Text>
                    <Text style={styles.fulfillSub}>
                      Partner: {fulfillingRequest?.vendor_name || fulfillingRequest?.vendor_id} • Requested: {fulfillingRequest?.requested_quantity_kg} kg {fulfillingRequest?.product_name}
                    </Text>
                  </View>

                  <Text style={styles.fulfillSectionTitle}>
                    Select Created Batch to Assign ({availableCreatedBatches.length} Available):
                  </Text>

                  <ScrollView style={styles.fulfillBatchList} showsVerticalScrollIndicator={false}>
                    {availableCreatedBatches.map((b) => {
                      const isSel = selectedBatchId === b.batch_id;
                      const isVendorPref = fulfillingRequest?.requested_batch_id === b.batch_id;
                      return (
                        <TouchableOpacity
                          key={b.batch_id}
                          style={[
                            styles.fulfillBatchCard,
                            isSel && styles.fulfillBatchCardActive,
                          ]}
                          onPress={() => setSelectedBatchId(b.batch_id)}
                        >
                          <View style={styles.fulfillCardRow}>
                            <Text style={[styles.fulfillCardId, isSel && styles.fulfillCardIdActive]}>
                              #{b.batch_id}
                            </Text>
                            <View style={styles.fulfillCardBadgeRow}>
                              {isVendorPref && (
                                <View style={styles.prefBadge}>
                                  <Text style={styles.prefBadgeText}>Vendor Choice</Text>
                                </View>
                              )}
                              <Text style={[styles.fulfillCardVol, isSel && styles.fulfillCardVolActive]}>
                                {b.volume_kg || b.quantity_kg || 15} kg
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.fulfillCardSub}>
                            pH: {b.initialPH ?? 4.4} • Temp: {b.temperatureC ?? 26}°C • {b.manufacturer || 'B2P Central Kitchen'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  <Text style={styles.fulfillArchiveNotice}>
                    * Assigning this batch automatically archives any older active batch at the shop so it moves to log history and does not affect spoilage predictions.
                  </Text>

                  <View style={styles.fulfillActions}>
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      onPress={() => setFulfillingRequest(null)}
                      disabled={isFulfilling}
                    >
                      <Text style={styles.cancelBtnText}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.fulfillConfirmBtn, isFulfilling && { opacity: 0.6 }]}
                      onPress={handleConfirmFulfill}
                      disabled={isFulfilling || !selectedBatchId}
                    >
                      <Text style={styles.fulfillConfirmText}>
                        {isFulfilling ? 'Assigning...' : 'Assign & Dispatch Batch →'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* Restock Rejection Confirmation Dialog */}
        <ConfirmDialog
          visible={!!rejectingRequest}
          title="Reject Restock Request"
          message={`Reject restock requisition of ${rejectingRequest?.requested_quantity_kg} kg ${rejectingRequest?.product_name} for ${rejectingRequest?.vendor_name || rejectingRequest?.vendor_id}?`}
          confirmLabel="Reject Request"
          cancelLabel="Keep Pending"
          isDestructive
          onConfirm={async () => {
            if (!rejectingRequest) return;
            const reqId = rejectingRequest.request_id || rejectingRequest.linked_order_id;
            try {
              setActionLoadingId(reqId);
              await inventoryService.rejectRestockRequest(reqId, 'Rejected by Admin');
              setRejectingRequest(null);
              await loadDashboard();
            } catch (e: any) {
              Alert.alert('Error', e?.response?.data?.error || 'Failed to reject request');
            } finally {
              setActionLoadingId(null);
            }
          }}
          onCancel={() => setRejectingRequest(null)}
        />

        {/* Rejection Confirmation Dialog */}
        <ConfirmDialog
          visible={!!rejectingVendor}
          title="Reject Vendor Requisition"
          message={`Reject ${rejectingVendor?.shop_name}'s application? This action cannot be undone.`}
          confirmLabel="Reject Application"
          cancelLabel="Keep Under Review"
          isDestructive
          onConfirm={handleConfirmReject}
          onCancel={() => setRejectingVendor(null)}
        />

        {/* Certification Inspection Modal */}
        <Modal
          visible={!!inspectingCert}
          transparent
          animationType="fade"
          onRequestClose={() => setInspectingCert(null)}
        >
          <TouchableWithoutFeedback onPress={() => setInspectingCert(null)}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.certModalBox}>
                  <Text style={styles.modalTitle}>FSSAI Food Safety Record</Text>
                  <Text style={styles.modalShop}>{inspectingCert?.shop_name}</Text>
                  <View style={styles.divider} />
                  <Text style={styles.modalField}>
                    License / Cert No:{' '}
                    <Text style={styles.monoText}>{inspectingCert?.fssai_cert}</Text>
                  </Text>
                  <Text style={styles.modalField}>
                    Premises Address: {inspectingCert?.address}
                  </Text>
                  <Text style={styles.modalField}>
                    Storage Facilities:{' '}
                    {inspectingCert?.hasRefrigerator
                      ? `Refrigerated (${inspectingCert?.fridgeTemperatureC || 4}°C)`
                      : 'Ambient Counter'}
                  </Text>
                  <TouchableOpacity
                    style={styles.modalCloseBtn}
                    onPress={() => setInspectingCert(null)}
                  >
                    <Text style={styles.modalCloseText}>Dismiss Inspection</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
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
  pageHeader: {
    marginBottom: spacing.md,
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
  topRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  topRowMobile: {
    flexDirection: 'column',
    gap: 0,
  },
  topCol: {
    flex: 1,
  },
  colFull: {
    width: '100%',
  },
  activePill: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.bananaGreen,
    fontFamily: typography.mono,
  },
  monoStockTag: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.clayTerracotta,
    fontFamily: typography.mono,
  },
  linkBar: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: spacing.md,
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    flexWrap: 'wrap',
  },
  widgetsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  widgetsRowMobile: {
    flexDirection: 'column',
    gap: spacing.md,
  },
  widgetBox: {
    flex: 1,
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.sm,
    padding: spacing.sm + 4,
  },
  widgetBoxMobile: {
    width: '100%',
  },
  widgetHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.inkCharcoal,
    fontFamily: typography.heading,
  },
  widgetSub: {
    fontSize: 10.5,
    color: colors.textMuted,
    fontFamily: typography.mono,
    marginBottom: spacing.sm,
  },
  chartBars: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 75,
    paddingTop: 4,
    paddingBottom: 2,
    marginTop: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  chartCol: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  barPair: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 48,
    gap: 2,
  },
  predBar: {
    width: 6,
    backgroundColor: colors.clayTerracotta,
    borderRadius: 1,
  },
  actBar: {
    width: 6,
    backgroundColor: colors.inkCharcoal,
    borderRadius: 1,
  },
  chartDayText: {
    fontSize: 9,
    fontFamily: typography.mono,
    color: colors.textMuted,
    marginTop: 4,
  },
  legendRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: 6,
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  predDot: {
    width: 7,
    height: 7,
    backgroundColor: colors.clayTerracotta,
  },
  actDot: {
    width: 7,
    height: 7,
    backgroundColor: colors.inkCharcoal,
  },
  legendText: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: typography.mono,
  },
  spikeList: {
    gap: 6,
  },
  spikeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  spikeRank: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    width: 18,
    fontFamily: typography.mono,
  },
  spikeName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: colors.inkCharcoal,
  },
  spikePct: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.bananaGreen,
    fontFamily: typography.mono,
    marginLeft: 6,
  },
  spikeKg: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: typography.mono,
    marginLeft: 4,
  },
  distBarWrap: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 2,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.inkCharcoal,
    marginVertical: spacing.sm,
  },
  distSegment: {
    height: '100%',
  },
  spoilageBreakdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  spoilageItem: {
    alignItems: 'center',
  },
  spoilageVal: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: typography.mono,
  },
  spoilageLbl: {
    fontSize: 9.5,
    color: colors.textMuted,
    fontFamily: typography.mono,
    marginTop: 2,
  },
  reqList: {
    width: '100%',
  },
  reqRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.paperWhite,
  },
  reqRowMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: spacing.sm,
  },
  rowAlt: {
    backgroundColor: '#FAF5EC',
  },
  reqInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  reqShopName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.inkCharcoal,
  },
  reqDetails: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  reqAddress: {
    fontSize: 11.5,
    color: colors.textMuted,
    marginTop: 2,
  },
  certChip: {
    marginTop: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignSelf: 'flex-start',
  },
  certText: {
    fontSize: 11,
    fontFamily: typography.mono,
    color: colors.clayTerracotta,
    fontWeight: '600',
  },
  reqActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(43, 36, 30, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  certModalBox: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.paperWhite,
    borderWidth: 1.5,
    borderTopWidth: 2.5,
    borderColor: colors.inkCharcoal,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.inkCharcoal,
    fontFamily: typography.heading,
  },
  modalShop: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.clayTerracotta,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.sm,
  },
  modalField: {
    fontSize: 12.5,
    color: colors.textSecondary,
    marginBottom: 6,
    lineHeight: 18,
  },
  monoText: {
    fontFamily: typography.mono,
    fontWeight: '700',
    color: colors.inkCharcoal,
  },
  modalCloseBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.inkCharcoal,
    borderRadius: radius.sm,
    paddingVertical: 8,
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inkCharcoal,
  },
  fulfillModalBox: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '85%',
    backgroundColor: colors.paperWhite,
    borderWidth: 1.5,
    borderTopWidth: 2.5,
    borderColor: colors.inkCharcoal,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  fulfillHeader: {
    marginBottom: spacing.xs,
  },
  fulfillSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  fulfillSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inkCharcoal,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  fulfillBatchList: {
    maxHeight: 220,
    marginVertical: spacing.xs,
  },
  fulfillBatchCard: {
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.sm,
    backgroundColor: colors.backgroundAlt,
    marginBottom: spacing.xs,
  },
  fulfillBatchCardActive: {
    borderColor: colors.clayTerracotta,
    backgroundColor: colors.paperWhite,
    borderWidth: 1.5,
  },
  fulfillCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fulfillCardId: {
    fontFamily: typography.mono,
    fontWeight: '700',
    fontSize: 13,
    color: colors.inkCharcoal,
  },
  fulfillCardIdActive: {
    color: colors.clayTerracotta,
  },
  fulfillCardBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  prefBadge: {
    backgroundColor: colors.bananaGreen,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  prefBadgeText: {
    color: colors.paperWhite,
    fontSize: 10,
    fontWeight: '700',
  },
  fulfillCardVol: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.inkCharcoal,
  },
  fulfillCardVolActive: {
    color: colors.clayTerracotta,
  },
  fulfillCardSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 3,
  },
  fulfillArchiveNotice: {
    fontSize: 11,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginVertical: spacing.xs,
    lineHeight: 15,
  },
  fulfillActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  fulfillConfirmBtn: {
    backgroundColor: colors.clayTerracotta,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.inkCharcoal,
  },
  fulfillConfirmText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.paperWhite,
  },
});
