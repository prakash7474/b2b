// ════════════════════════════════════════════════════════════════════════════
// 📌 VENDOR BATCH LEDGER SCREEN (VendorBatchListScreen.tsx)
// WHAT THIS SCREEN DOES:
//   1. Outlet Batch Tracking: Shows all batter batches associated with this vendor.
//   2. Filter Categories:
//      - "All"              : All current batches.
//      - "Awaiting Receipt" : Dispatched from kitchen (status "assigned"), vendor must click "Confirm Receipt".
//      - "In Store"         : Actively stocked & selling (status "received").
//      - "Stocked Out"      : Finished / sold out.
//      - "Archived"         : Replaced / older batches.
//   3. Actions Available:
//      - "Confirm Receipt"  : Sets status to "received" and updates store inventory.
//      - "Check Spoilage"   : Runs ML model on this specific batch's pH and shelf time.
//      - "Mark Stocked Out" : When batter container is empty.
//      - "Report Issue"     : Reports physical defect, sourness, or leakage.
// ════════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useAuthStore } from '../../store/authStore';
import { useBatchStore } from '../../store/batchStore';
import { usePredictionStore } from '../../store/predictionStore';
import { Batch } from '../../types/batch';
import { BatchStatusBadge } from '../../components/BatchStatusBadge';
import { ReceiveBatchModal } from './ReceiveBatchModal';
import { SpoilageRiskDialog } from './SpoilageRiskDialog';
import { ReportIssueModal } from './ReportIssueModal';
import { ConfirmDialog } from '../../components/ledger';
import { batchService } from '../../services/batchService';
import { colors, typography } from '../../theme';

export const VendorBatchListScreen: React.FC = () => {
  const { vendor_id } = useAuthStore();
  const { batches, fetchBatches, stockoutBatch, isLoading } = useBatchStore();
  const { fetchBatchSpoilage, batchSpoilage } = usePredictionStore();

  // ── Filter State ─────────────────────────────────────────────────────────
  const [filter, setFilter] = useState<'all' | 'assigned' | 'received' | 'stockout' | 'archived'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [receiveBatchTarget, setReceiveBatchTarget] = useState<Batch | null>(null);
  const [reportIssueTarget, setReportIssueTarget] = useState<Batch | null>(null);
  const [stockoutTarget, setStockoutTarget] = useState<Batch | null>(null);
  const [spoilageTarget, setSpoilageTarget] = useState<Batch | null>(null);
  const [spoilageLoading, setSpoilageLoading] = useState(false);
  const [archivedBatches, setArchivedBatches] = useState<Batch[]>([]);

  const loadData = async () => {
    if (vendor_id) {
      await fetchBatches(vendor_id);
      try {
        const history = await batchService.getVendorBatchHistory(vendor_id);
        setArchivedBatches(history);
      } catch (err) {
        console.warn('Failed to load archived batches', err);
      }
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

  const handleCheckSpoilage = async (batch: Batch) => {
    setSpoilageTarget(batch);
    setSpoilageLoading(true);
    try {
      await fetchBatchSpoilage(batch.batch_id);
    } catch (err) {
      console.warn('fetchBatchSpoilage error:', err);
    } finally {
      setSpoilageLoading(false);
    }
  };

  const handleStockoutConfirm = (batch: Batch) => {
    setStockoutTarget(batch);
  };

  const handleExecuteStockout = async () => {
    if (!stockoutTarget) return;
    try {
      const ok = await stockoutBatch(stockoutTarget.batch_id);
      if (ok) {
        setStockoutTarget(null);
        await loadData();
      }
    } catch (err) {
      console.error('Failed to stock out batch:', err);
    } finally {
      setStockoutTarget(null);
    }
  };

  const uniqueBatchMap = new Map<string, Batch>();
  batches.forEach((b) => uniqueBatchMap.set(b.batch_id, b));
  archivedBatches.forEach((b) => uniqueBatchMap.set(b.batch_id, b));
  const allBatches = Array.from(uniqueBatchMap.values());
  const activeBatches = allBatches.filter((b) => b.status !== 'archived' && b.status !== 'stockout');

  const vendorBatches = allBatches.filter((b) => {
    if (filter === 'all') return b.status !== 'archived' && b.status !== 'stockout';
    if (filter === 'archived' || filter === 'stockout') return b.status === 'archived' || b.status === 'stockout';
    return b.status === filter;
  });

  const formatMfgDate = (dateStr?: string) => {
    if (!dateStr) return 'Recently milled';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const renderItem = ({ item }: { item: Batch }) => {
    const isAssigned = item.status === 'assigned';
    const isReceived = item.status === 'received';
    const mfgDisplay = formatMfgDate(item.mfgTimestamp || item.mfg_timestamp || item.created_at);

    return (
      <View style={styles.card}>
        {/* Top Header */}
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <View style={styles.batchIdRow}>
              <Text style={styles.batchId}>Batch #{item.batch_id}</Text>
              <Text style={styles.mfgSubText}>• Milled: {mfgDisplay}</Text>
            </View>
            <Text style={styles.productName}>{item.product_name || 'Idli Batter'}</Text>
          </View>
          <BatchStatusBadge status={item.status} />
        </View>

        {/* Technical Ledger Row */}
        <View style={styles.metaGrid}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLbl}>Dispatched Volume</Text>
            <Text style={styles.metaVal}>{item.volume_kg} kg</Text>
          </View>
          <View style={styles.verticalDivider} />
          <View style={styles.metaItem}>
            <Text style={styles.metaLbl}>Initial pH</Text>
            <Text style={styles.metaVal}>{item.initialPH}</Text>
          </View>
          <View style={styles.verticalDivider} />
          <View style={styles.metaItem}>
            <Text style={styles.metaLbl}>Dispatch Temp</Text>
            <Text style={styles.metaVal}>{item.temperatureC}°C</Text>
          </View>
          <View style={styles.verticalDivider} />
          <View style={styles.metaItem}>
            <Text style={styles.metaLbl}>Ferment Age</Text>
            <Text style={styles.metaVal}>{item.fermentationHours}h</Text>
          </View>
        </View>

        {item.notes ? (
          <View style={styles.notesBox}>
            <Text style={styles.notesText}>Kitchen Notes: {item.notes}</Text>
          </View>
        ) : null}

        {/* Action Button Row */}
        <View style={styles.actionRow}>
          {isAssigned && (
            <TouchableOpacity
              style={styles.receiveBtn}
              onPress={() => setReceiveBatchTarget(item)}
            >
              <Text style={styles.receiveBtnText}>✓ Confirm Delivery Receipt</Text>
            </TouchableOpacity>
          )}

          {isReceived && (
            <>
              <TouchableOpacity
                style={styles.spoilageBtn}
                onPress={() => handleCheckSpoilage(item)}
              >
                <Text style={styles.spoilageBtnText}>Check Spoilage Risk & Action →</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.stockoutBtn}
                onPress={() => handleStockoutConfirm(item)}
              >
                <Text style={styles.stockoutBtnText}>✕ Mark Stock Out (Remove)</Text>
              </TouchableOpacity>
            </>
          )}

          {item.status === 'stockout' && (
            <View style={styles.stockoutBadgeBox}>
              <Text style={styles.stockoutBadgeText}>✓ Stock Out — Depleted & removed from store</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.reportIssueBtn}
            onPress={() => setReportIssueTarget(item)}
          >
            <Text style={styles.reportIssueBtnText}>Report Incident</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Assigned & Received Batches</Text>
        <Text style={styles.subtitle}>
          Track incoming dispatch batches, confirm store delivery, inspect spoilage risks, and remove depleted batches upon stock out.
        </Text>
      </View>

      {/* Filter Chips Bar */}
      <View style={styles.filterRow}>
        {(['all', 'assigned', 'received', 'stockout', 'archived'] as const).map((tab) => {
          const isSelected = filter === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.filterChip, isSelected && styles.filterChipActive]}
              onPress={() => setFilter(tab)}
            >
              <Text style={[styles.filterText, isSelected && styles.filterTextActive]}>
                {tab === 'all'
                  ? `All Active (${activeBatches.length})`
                  : tab === 'assigned'
                  ? `Awaiting (${allBatches.filter((b) => b.status === 'assigned').length})`
                  : tab === 'received'
                  ? `In Store (${allBatches.filter((b) => b.status === 'received').length})`
                  : tab === 'archived'
                  ? `Archived (${allBatches.filter((b) => b.status === 'archived').length})`
                  : `Stock Out (${allBatches.filter((b) => b.status === 'stockout').length})`}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading && !refreshing && batches.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.clayTerracotta} />
          <Text style={styles.loadingText}>Loading assigned batches...</Text>
        </View>
      ) : (
        <FlatList
          data={vendorBatches}
          keyExtractor={(item) => item.batch_id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.clayTerracotta}
              colors={[colors.clayTerracotta]}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyGlyph}>•</Text>
              <Text style={styles.emptyText}>No batches in this view</Text>
              <Text style={styles.emptySub}>
                When central kitchen assigns batter batches to your shop, they will automatically appear here for delivery receipt.
              </Text>
            </View>
          }
        />
      )}

      {/* Confirm Receipt Modal */}
      {receiveBatchTarget ? (
        <ReceiveBatchModal
          visible={!!receiveBatchTarget}
          batch={receiveBatchTarget}
          onClose={() => setReceiveBatchTarget(null)}
          onSuccess={() => {
            setReceiveBatchTarget(null);
            loadData();
          }}
        />
      ) : null}

      {/* Spoilage Risk Dialog */}
      <SpoilageRiskDialog
        visible={!!spoilageTarget}
        batch={spoilageTarget}
        spoilage={batchSpoilage}
        loading={spoilageLoading}
        onClose={() => setSpoilageTarget(null)}
        onStockout={handleStockoutConfirm}
      />

      {/* Report Incident Modal */}
      <ReportIssueModal
        visible={!!reportIssueTarget}
        batch={reportIssueTarget}
        onClose={() => setReportIssueTarget(null)}
        onSuccess={() => {
          setReportIssueTarget(null);
          loadData();
        }}
      />

      {/* Confirm Stock Out Dialog */}
      <ConfirmDialog
        visible={!!stockoutTarget}
        title="Confirm Stock Out"
        message={`Mark Batch #${stockoutTarget?.batch_id} (${stockoutTarget?.product_name}) as Stock Out?\n\nThis will record the batch as depleted, remove it from your active In Store page, and archive it.`}
        confirmLabel="Mark Stock Out"
        cancelLabel="Cancel"
        isDestructive
        onConfirm={handleExecuteStockout}
        onCancel={() => setStockoutTarget(null)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.batterCream,
  },
  topBar: {
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
    lineHeight: 16,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.surfaceElevated,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.backgroundAlt,
  },
  filterChipActive: {
    backgroundColor: colors.clayTerracotta,
    borderColor: colors.inkCharcoal,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  filterTextActive: {
    color: colors.textInverse,
  },
  listContent: {
    padding: 12,
    paddingBottom: 48,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  card: {
    backgroundColor: colors.paperWhite,
    borderRadius: 4,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1.5,
    borderTopWidth: 3,
    borderColor: colors.inkCharcoal,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  batchIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  batchId: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.inkCharcoal,
  },
  mfgSubText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  productName: {
    fontSize: 13,
    color: colors.clayTerracotta,
    fontWeight: '700',
    marginTop: 2,
  },
  metaGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 4,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  metaItem: {
    flex: 1,
    alignItems: 'center',
  },
  metaLbl: {
    fontSize: 9,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  metaVal: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.inkCharcoal,
    marginTop: 2,
  },
  verticalDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.borderHairline,
  },
  notesBox: {
    backgroundColor: colors.backgroundAlt,
    borderLeftWidth: 3,
    borderLeftColor: colors.turmericGold,
    padding: 8,
    borderRadius: 2,
    marginTop: 10,
  },
  notesText: {
    fontSize: 12,
    color: colors.inkCharcoal,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  receiveBtn: {
    backgroundColor: colors.bananaGreen,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
  },
  receiveBtnText: {
    color: colors.textInverse,
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  spoilageBtn: {
    backgroundColor: colors.clayTerracotta,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
  },
  spoilageBtnText: {
    color: colors.textInverse,
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  stockoutBtn: {
    backgroundColor: colors.backgroundAlt,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.rustRed,
  },
  stockoutBtnText: {
    color: colors.rustRed,
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.2,
  },
  stockoutBadgeBox: {
    backgroundColor: colors.backgroundAlt,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  stockoutBadgeText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  reportIssueBtn: {
    backgroundColor: colors.backgroundAlt,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  reportIssueBtnText: {
    color: colors.rustRed,
    fontWeight: '700',
    fontSize: 12,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 10,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyGlyph: {
    fontSize: 32,
    color: colors.borderLight,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.inkCharcoal,
    fontFamily: typography.heading,
  },
  emptySub: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 18,
  },
});
