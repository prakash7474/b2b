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
import { useBatchStore } from '../../store/batchStore';
import { useVendorStore } from '../../store/vendorStore';
import { Batch, BatchStatus } from '../../types/batch';
import { predictionService } from '../../services/predictionService';
import {
  LedgerPanel,
  RiskBadge,
  VendorPickerModal,
  ConfirmDialog,
  Skeleton,
  EmptyState,
} from '../../components/ledger';
import { colors, radius, typography, spacing } from '../../theme';

interface SpoilageCacheItem {
  riskScore: number;
  riskLabel: string;
  confidence: number;
  hoursToExpiry: number;
  loading: boolean;
  error?: string;
}

export const BatchListScreen: React.FC = () => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const { batches, fetchBatches, addBatch, assignBatch, receiveBatch, removeBatch, isLoading } = useBatchStore();
  const { vendors, fetchVendors } = useVendorStore();

  const [statusFilter, setStatusFilter] = useState<BatchStatus | 'all' | 'archived'>('all');
  const [assigningBatch, setAssigningBatch] = useState<Batch | null>(null);
  const [detailBatch, setDetailBatch] = useState<Batch | null>(null);
  const [batchToDelete, setBatchToDelete] = useState<Batch | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [receivingBatchId, setReceivingBatchId] = useState<string | null>(null);

  // New Batch Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newBatchId, setNewBatchId] = useState('');
  const [newVolumeKg, setNewVolumeKg] = useState('15.0');
  const [newInitialPH, setNewInitialPH] = useState('4.40');
  const [newTemperatureC, setNewTemperatureC] = useState('26.5');
  const [newFermentationHours, setNewFermentationHours] = useState('8.0');
  const [newNotes, setNewNotes] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Per-batch Spoilage ML Cache
  const [spoilageCache, setSpoilageCache] = useState<Record<string, SpoilageCacheItem>>({});

  useEffect(() => {
    fetchBatches();
    fetchVendors();
  }, []);

  const openAddModal = () => {
    // Generate clean system-assigned batch ID
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    setNewBatchId(`BATCH-${randomNum}`);
    setNewVolumeKg('15.0');
    setNewInitialPH('4.40');
    setNewTemperatureC('26.5');
    setNewFermentationHours('8.0');
    setNewNotes('');
    setCreateError('');
    setShowAddModal(true);
  };

  const handleCreateBatch = async () => {
    if (!newVolumeKg || isNaN(parseFloat(newVolumeKg))) {
      setCreateError('Please enter a valid batch volume in kg.');
      return;
    }
    setIsCreating(true);
    setCreateError('');

    const payload = {
      batch_id: newBatchId.trim(),
      product_name: 'Idly Batter', // Single product constraint
      manufacturer: 'B2P Central Kitchen',
      batch_number: newBatchId.trim(),
      volume_kg: parseFloat(newVolumeKg) || 15.0,
      initialPH: parseFloat(newInitialPH) || 4.4,
      temperatureC: parseFloat(newTemperatureC) || 26.5,
      humidityPct: 58.0,
      fermentationHours: parseFloat(newFermentationHours) || 8.0,
      notes: newNotes.trim() || undefined,
    };

    const ok = await addBatch(payload);
    setIsCreating(false);
    if (ok) {
      setShowAddModal(false);
      fetchBatches();
    } else {
      setCreateError('Failed to register batch. Please verify inputs.');
    }
  };

  const handlePredictSpoilage = async (batchId: string) => {
    setSpoilageCache((prev) => ({
      ...prev,
      [batchId]: {
        riskScore: 0,
        riskLabel: '',
        confidence: 0,
        hoursToExpiry: 0,
        loading: true,
      },
    }));

    try {
      const res = await predictionService.getBatchSpoilageRisk(batchId);
      const score = res.riskScore !== undefined
        ? res.riskScore
        : (res.freshnessScore !== undefined ? res.freshnessScore : (res.riskLabel === 'High' ? 0.85 : res.riskLabel === 'Medium' ? 0.5 : 0.15));
      const label = res.riskLabel || res.mlRiskLabel || res.freshnessRisk || 'Good';
      const conf = res.confidence || res.mlConfidence || 90;
      const expiry = res.hoursToExpiry !== undefined ? res.hoursToExpiry : 0;

      setSpoilageCache((prev) => ({
        ...prev,
        [batchId]: {
          riskScore: score,
          riskLabel: label,
          confidence: conf,
          hoursToExpiry: expiry,
          loading: false,
        },
      }));
    } catch (err) {
      setSpoilageCache((prev) => ({
        ...prev,
        [batchId]: {
          riskScore: 0,
          riskLabel: '',
          confidence: 0,
          hoursToExpiry: 0,
          loading: false,
          error: 'Could not evaluate risk score',
        },
      }));
    }
  };

  const handleAssignVendorConfirm = async (vendorId: string) => {
    if (!assigningBatch) return;
    const ok = await assignBatch(assigningBatch.batch_id, vendorId);
    if (ok) {
      setAssigningBatch(null);
      fetchBatches();
    }
  };

  const handleConfirmReceipt = async (batchId: string) => {
    setReceivingBatchId(batchId);
    const ok = await receiveBatch(batchId);
    setReceivingBatchId(null);
    if (ok) {
      if (detailBatch && detailBatch.batch_id === batchId) {
        setDetailBatch(null);
      }
      fetchBatches();
    }
  };

  const handleDeleteBatch = async () => {
    if (!batchToDelete) return;
    setIsDeleting(true);
    const ok = await removeBatch(batchToDelete.batch_id);
    setIsDeleting(false);
    setBatchToDelete(null);
    if (ok) {
      fetchBatches();
    }
  };

  const parseSafeDate = (ts?: string | Date | null): Date | null => {
    if (!ts) return null;
    if (ts instanceof Date) return isNaN(ts.getTime()) ? null : ts;
    let s = String(ts).trim();
    if (!s) return null;
    if (s.includes('T') && !s.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(s)) {
      s += 'Z';
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  };

  const getBatchAge = (mfgTimestamp?: string | Date) => {
    const d = parseSafeDate(mfgTimestamp);
    if (!d) return '0m';
    const mfg = d.getTime();
    const now = Date.now();
    const diffHours = Math.max(0, (now - mfg) / (1000 * 60 * 60));
    if (diffHours < 1) {
      const mins = Math.max(0, Math.round(diffHours * 60));
      return `${mins}m`;
    }
    return `${diffHours.toFixed(1)}h`;
  };

  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      if (statusFilter === 'all') return b.status !== 'archived';
      if (statusFilter === 'assigned') return b.status === 'assigned';
      if (statusFilter === 'received') return b.status === 'received';
      if (statusFilter === 'created') return b.status === 'created';
      if (statusFilter === 'archived') return b.status === 'archived';
      return true;
    });
  }, [batches, statusFilter]);

  const activeVendorsList = useMemo(() => {
    return vendors.filter((v) => v.verificationStatus !== 'rejected' && v.verificationStatus !== 'terminated');
  }, [vendors]);

  return (
    <ScrollView style={styles.scrollArea} contentContainerStyle={styles.contentContainer}>
      <View style={[styles.mainWrapper, { maxWidth: 1280 }]}>
        {/* Header Bar */}
        <View style={[styles.headerBar, isMobile && styles.headerBarMobile]}>
          <View>
            <Text style={styles.headerSubtitle}>CENTRAL PRODUCTION REGISTER</Text>
            <Text style={styles.headerTitle}>Batch List</Text>
            <Text style={styles.headerProductNotice}>
              Recipe: <Text style={styles.headerProductBold}>Idly Batter</Text> (Single Product Central Specification)
            </Text>
          </View>
          <TouchableOpacity
            style={styles.newBatchButton}
            onPress={openAddModal}
            activeOpacity={0.8}
          >
            <Text style={styles.newBatchButtonText}>+ Add new batch</Text>
          </TouchableOpacity>
        </View>

        {/* Filter Bar */}
        <View style={styles.filterSection}>
          <View style={styles.tabSegments}>
            {(['all', 'created', 'assigned', 'received', 'archived'] as const).map((st) => {
              const active = statusFilter === st;
              const labels: Record<string, string> = {
                all: 'All Batches',
                created: 'Created',
                assigned: 'Assigned',
                received: 'Received',
                archived: 'Archived',
              };
              return (
                <TouchableOpacity
                  key={st}
                  style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                  onPress={() => setStatusFilter(st)}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {labels[st]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.filterCounter}>
            Showing <Text style={styles.monoCount}>{filteredBatches.length}</Text> of {batches.length} batches
          </Text>
        </View>

        {/* Batch Rows / Cards */}
        {isLoading && batches.length === 0 ? (
          <View style={styles.loadingContainer}>
            <Skeleton width="100%" height={100} style={{ marginBottom: 12 }} />
            <Skeleton width="100%" height={100} style={{ marginBottom: 12 }} />
            <Skeleton width="100%" height={100} />
          </View>
        ) : filteredBatches.length === 0 ? (
          <LedgerPanel title="Production Records">
            <EmptyState
              title="No Batches Found"
              subtitle={`No batches match status filter "${statusFilter}".`}
              actionLabel="+ Produce First Batch"
              onAction={openAddModal}
            />
          </LedgerPanel>
        ) : (
          <View style={styles.batchList}>
            {filteredBatches.map((batch) => {
              const prediction = spoilageCache[batch.batch_id];
              const isAssigned = !!batch.vendor_id;
              const assignedVendorName = batch.vendor_name || batch.vendor_id;
              const ageStr = getBatchAge(batch.mfg_timestamp || batch.created_at);

              return (
                <View key={batch.batch_id} style={[styles.batchCard, batch.status === 'archived' && { opacity: 0.65 }]}>
                  <View style={styles.batchTopRule} />

                  {/* Card Header */}
                  <View style={[styles.cardHeaderRow, isMobile && styles.cardHeaderRowMobile]}>
                    <View style={styles.batchIdGroup}>
                      <Text style={styles.batchIdMono}>{batch.batch_id}</Text>
                      <View style={styles.productBadge}>
                        <Text style={styles.productBadgeText}>Idly Batter</Text>
                      </View>
                      <View
                        style={[
                          styles.statusPill,
                          batch.status === 'received' && styles.statusReceived,
                          batch.status === 'assigned' && styles.statusAssigned,
                          batch.status === 'created' && styles.statusCreated,
                        ]}
                      >
                        <Text style={styles.statusPillText}>
                          {batch.status === 'received'
                            ? 'Received'
                            : batch.status === 'assigned'
                            ? 'Assigned'
                            : 'Created'}
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={styles.deleteLink}
                      onPress={() => setBatchToDelete(batch)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.deleteLinkText}>[ Delete ]</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Parameters Table Grid */}
                  <View style={[styles.paramGrid, isMobile && styles.paramGridMobile]}>
                    <View style={styles.paramBox}>
                      <Text style={styles.paramLabel}>VOLUME</Text>
                      <Text style={styles.paramValueMono}>
                        {batch.volume_kg || batch.quantity_kg || 15} kg
                      </Text>
                    </View>

                    <View style={styles.paramBox}>
                      <Text style={styles.paramLabel}>INITIAL PH</Text>
                      <Text style={styles.paramValueMono}>
                        {Number(batch.initialPH ?? 4.4).toFixed(2)}
                      </Text>
                    </View>

                    <View style={styles.paramBox}>
                      <Text style={styles.paramLabel}>TEMP / ACIDITY</Text>
                      <Text style={styles.paramValueMono}>
                        {batch.temperatureC ?? 26.5}°C
                      </Text>
                    </View>

                    <View style={styles.paramBox}>
                      <Text style={styles.paramLabel}>BATTER AGE</Text>
                      <Text style={styles.paramValueMono}>{ageStr}</Text>
                    </View>

                    <View style={[styles.paramBox, styles.paramBoxVendor]}>
                      <Text style={styles.paramLabel}>DESTINATION SHOP</Text>
                      {isAssigned ? (
                        <Text style={styles.assignedVendorName} numberOfLines={1}>
                          {assignedVendorName}
                        </Text>
                      ) : (
                        <View style={styles.unassignedChip}>
                          <Text style={styles.unassignedText}>Unassigned</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Actions & ML Row */}
                  <View style={[styles.cardFooter, isMobile && styles.cardFooterMobile]}>
                    {/* Inline Spoilage ML Section */}
                    <View style={styles.mlArea}>
                      {prediction?.loading ? (
                        <View style={styles.mlLoadingRow}>
                          <ActivityIndicator size="small" color={colors.clayTerracotta} />
                          <Text style={styles.mlLoadingText}>Assessing spoilage risk...</Text>
                        </View>
                      ) : prediction?.riskLabel ? (
                        <View style={styles.mlResultRow}>
                          <RiskBadge score={prediction.riskScore} />
                          <TouchableOpacity
                            style={styles.reRunBtn}
                            onPress={() => handlePredictSpoilage(batch.batch_id)}
                          >
                            <Text style={styles.reRunText}>↺ Re-run</Text>
                          </TouchableOpacity>
                          {prediction.hoursToExpiry !== undefined ? (
                            <Text
                              style={[
                                styles.expiryNote,
                                prediction.hoursToExpiry <= 0 && styles.expiredNote,
                              ]}
                            >
                              {prediction.hoursToExpiry <= 0
                                ? 'Expired (0h shelf life)'
                                : `~${prediction.hoursToExpiry.toFixed(0)}h shelf life`}
                            </Text>
                          ) : null}
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.predictButton}
                          onPress={() => handlePredictSpoilage(batch.batch_id)}
                        >
                          <Text style={styles.predictButtonText}>Predict Risk Score</Text>
                        </TouchableOpacity>
                      )}
                      {prediction?.error ? (
                        <Text style={styles.mlErrorText}>{prediction.error}</Text>
                      ) : null}
                    </View>

                    {/* Destination Assignment / View Details / Confirm Receipt */}
                    <View style={styles.actionButtonsArea}>
                      {batch.status === 'assigned' ? (
                        <>
                          <TouchableOpacity
                            style={styles.receiveBtn}
                            onPress={() => handleConfirmReceipt(batch.batch_id)}
                            disabled={receivingBatchId === batch.batch_id}
                          >
                            {receivingBatchId === batch.batch_id ? (
                              <ActivityIndicator size="small" color={colors.paperWhite} />
                            ) : (
                              <Text style={styles.receiveBtnText}>Confirm Receipt ✓</Text>
                            )}
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.viewDetailsButton}
                            onPress={() => setDetailBatch(batch)}
                          >
                            <Text style={styles.viewDetailsText}>View details →</Text>
                          </TouchableOpacity>
                        </>
                      ) : isAssigned ? (
                        <TouchableOpacity
                          style={styles.viewDetailsButton}
                          onPress={() => setDetailBatch(batch)}
                        >
                          <Text style={styles.viewDetailsText}>View details →</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={styles.assignVendorButton}
                          onPress={() => setAssigningBatch(batch)}
                        >
                          <Text style={styles.assignVendorText}>Assign vendor →</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* Add New Batch Modal */}
      <Modal visible={showAddModal} transparent animationType="fade" onRequestClose={() => setShowAddModal(false)}>
        <TouchableWithoutFeedback onPress={() => setShowAddModal(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalCard, { width: isMobile ? '92%' : 540 }]}>
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalHeaderSub}>PRODUCTION REGISTER ENTRY</Text>
                    <Text style={styles.modalHeaderTitle}>Add New Batter Batch</Text>
                  </View>
                  <TouchableOpacity onPress={() => setShowAddModal(false)}>
                    <Text style={styles.modalCloseText}>[ ✕ ]</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.modalNoticeBanner}>
                  <Text style={styles.modalNoticeTitle}>Single Product Formulation</Text>
                  <Text style={styles.modalNoticeBody}>
                    Batter-to-Platter standardized recipe: <Text style={styles.boldUnderline}>Idly Batter</Text>. Central stone-ground production record.
                  </Text>
                </View>

                {createError ? (
                  <View style={styles.modalErrorBox}>
                    <Text style={styles.modalErrorText}>{createError}</Text>
                  </View>
                ) : null}

                <View style={styles.formGrid}>
                  <View style={styles.formRowHalf}>
                    <Text style={styles.fieldLabel}>BATCH ID (SYSTEM ASSIGNED)</Text>
                    <TextInput
                      style={[styles.fieldInput, styles.fieldInputMono, styles.readOnlyInput]}
                      value={newBatchId}
                      editable={false}
                    />
                  </View>

                  <View style={styles.formRowHalf}>
                    <Text style={styles.fieldLabel}>VOLUME (KG) *</Text>
                    <TextInput
                      style={[styles.fieldInput, styles.fieldInputMono]}
                      value={newVolumeKg}
                      onChangeText={setNewVolumeKg}
                      keyboardType="numeric"
                      placeholder="15.0"
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                </View>

                <View style={styles.formGrid}>
                  <View style={styles.formRowHalf}>
                    <Text style={styles.fieldLabel}>INITIAL PH</Text>
                    <TextInput
                      style={[styles.fieldInput, styles.fieldInputMono]}
                      value={newInitialPH}
                      onChangeText={setNewInitialPH}
                      keyboardType="numeric"
                      placeholder="4.40"
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>

                  <View style={styles.formRowHalf}>
                    <Text style={styles.fieldLabel}>TEMPERATURE (°C)</Text>
                    <TextInput
                      style={[styles.fieldInput, styles.fieldInputMono]}
                      value={newTemperatureC}
                      onChangeText={setNewTemperatureC}
                      keyboardType="numeric"
                      placeholder="26.5"
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.fieldLabel}>FERMENTATION DURATION (HOURS)</Text>
                  <TextInput
                    style={[styles.fieldInput, styles.fieldInputMono]}
                    value={newFermentationHours}
                    onChangeText={setNewFermentationHours}
                    keyboardType="numeric"
                    placeholder="8.0"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.fieldLabel}>PRODUCTION NOTES</Text>
                  <TextInput
                    style={[styles.fieldInput, styles.textAreaInput]}
                    value={newNotes}
                    onChangeText={setNewNotes}
                    placeholder="Batch grind notes, ingredient source, etc."
                    placeholderTextColor={colors.textMuted}
                    multiline
                    numberOfLines={2}
                  />
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => setShowAddModal(false)}
                    disabled={isCreating}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.submitBtn}
                    onPress={handleCreateBatch}
                    disabled={isCreating}
                  >
                    {isCreating ? (
                      <ActivityIndicator size="small" color={colors.paperWhite} />
                    ) : (
                      <Text style={styles.submitBtnText}>✓ Register Batch</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Batch Details Modal */}
      {detailBatch ? (
        <Modal visible={true} transparent animationType="fade" onRequestClose={() => setDetailBatch(null)}>
          <TouchableWithoutFeedback onPress={() => setDetailBatch(null)}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View style={[styles.modalCard, { width: isMobile ? '92%' : 540 }]}>
                  <View style={styles.modalHeader}>
                    <View>
                      <Text style={styles.modalHeaderSub}>DISPATCH & SPECIFICATION RECORD</Text>
                      <Text style={styles.modalHeaderTitle}>{detailBatch.batch_id}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setDetailBatch(null)}>
                      <Text style={styles.modalCloseText}>[ ✕ ]</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.detailStatsContainer}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Product:</Text>
                      <Text style={styles.detailValue}>Idly Batter</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Batch Volume:</Text>
                      <Text style={[styles.detailValue, styles.fontMono]}>
                        {detailBatch.volume_kg || detailBatch.quantity_kg || 15} kg
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Acidity / Initial pH:</Text>
                      <Text style={[styles.detailValue, styles.fontMono]}>
                        {detailBatch.initialPH ?? 4.4}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Ambient Temperature:</Text>
                      <Text style={[styles.detailValue, styles.fontMono]}>
                        {detailBatch.temperatureC ?? 26.5}°C
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Fermentation:</Text>
                      <Text style={[styles.detailValue, styles.fontMono]}>
                        {detailBatch.fermentationHours ? `${detailBatch.fermentationHours} hrs` : '8.0 hrs'}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Current Status:</Text>
                      <Text style={styles.detailValue}>
                        {detailBatch.status.toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Assigned Vendor Shop:</Text>
                      <Text style={[styles.detailValue, { color: colors.clayTerracotta, fontWeight: '700' }]}>
                        {detailBatch.vendor_name || detailBatch.vendor_id || 'Unassigned'}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Manufactured At:</Text>
                      <Text style={[styles.detailValue, styles.fontMono]}>
                        {parseSafeDate(detailBatch.mfg_timestamp || detailBatch.created_at)?.toLocaleString() || 'N/A'}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Assigned Timestamp:</Text>
                      <Text style={[styles.detailValue, styles.fontMono]}>
                        {detailBatch.assigned_at
                          ? parseSafeDate(detailBatch.assigned_at)?.toLocaleString() || 'Pending'
                          : 'Pending'}
                      </Text>
                    </View>
                    {detailBatch.received_at ? (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Received Timestamp:</Text>
                        <Text style={[styles.detailValue, styles.fontMono]}>
                          {parseSafeDate(detailBatch.received_at)?.toLocaleString() || 'Pending'}
                        </Text>
                      </View>
                    ) : null}
                    {detailBatch.notes ? (
                      <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
                        <Text style={styles.detailLabel}>Production Notes:</Text>
                        <Text style={styles.detailNotes}>{detailBatch.notes}</Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.modalActions}>
                    {detailBatch.status === 'assigned' ? (
                      <TouchableOpacity
                        style={styles.modalReceiveBtn}
                        onPress={() => handleConfirmReceipt(detailBatch.batch_id)}
                        disabled={receivingBatchId === detailBatch.batch_id}
                      >
                        {receivingBatchId === detailBatch.batch_id ? (
                          <ActivityIndicator size="small" color={colors.paperWhite} />
                        ) : (
                          <Text style={styles.modalReceiveBtnText}>
                            Confirm Receipt & Stock into Outlet ✓
                          </Text>
                        )}
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={styles.closeOnlyBtn}
                      onPress={() => setDetailBatch(null)}
                    >
                      <Text style={styles.closeOnlyBtnText}>Close Record</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      ) : null}

      {/* Vendor Picker Modal */}
      {assigningBatch ? (
        <VendorPickerModal
          visible={!!assigningBatch}
          vendors={activeVendorsList}
          currentVendorId={assigningBatch.vendor_id || undefined}
          onSelect={handleAssignVendorConfirm}
          onClose={() => setAssigningBatch(null)}
        />
      ) : null}

      {/* Delete Batch Confirmation */}
      <ConfirmDialog
        visible={!!batchToDelete}
        title="Delete Batch Record"
        message={`Delete production record for batch ${batchToDelete?.batch_id}? This operation removes central traceability history.`}
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete Batch'}
        cancelLabel="Keep Batch"
        isDestructive={true}
        onConfirm={handleDeleteBatch}
        onCancel={() => setBatchToDelete(null)}
      />
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: colors.paperWhite,
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
    borderTopWidth: 3,
    borderTopColor: colors.clayTerracotta,
    marginBottom: spacing.md,
  },
  headerBarMobile: {
    flexDirection: 'column',
    gap: spacing.sm,
    alignItems: 'stretch',
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
  headerProductNotice: {
    fontSize: 12,
    fontFamily: typography.fontFamily.body,
    color: colors.textSecondary,
    marginTop: 2,
  },
  headerProductBold: {
    color: colors.bananaGreen,
    fontWeight: '700',
  },
  newBatchButton: {
    backgroundColor: colors.bananaGreen,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
    alignItems: 'center',
  },
  newBatchButtonText: {
    color: colors.paperWhite,
    fontSize: 13,
    fontWeight: '700',
    fontFamily: typography.fontFamily.body,
  },
  filterSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  tabSegments: {
    flexDirection: 'row',
    backgroundColor: colors.paperWhite,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
    overflow: 'hidden',
  },
  segmentBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRightWidth: 1,
    borderRightColor: colors.borderHairline,
  },
  segmentBtnActive: {
    backgroundColor: colors.clayTerracotta,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inkCharcoal,
    fontFamily: typography.fontFamily.body,
  },
  segmentTextActive: {
    color: colors.paperWhite,
  },
  filterCounter: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.body,
  },
  monoCount: {
    fontFamily: typography.fontFamily.mono,
    fontWeight: '700',
    color: colors.inkCharcoal,
  },
  loadingContainer: {
    width: '100%',
    paddingVertical: spacing.lg,
  },
  batchList: {
    width: '100%',
    gap: spacing.md,
  },
  batchCard: {
    backgroundColor: colors.paperWhite,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
    padding: spacing.md,
    overflow: 'hidden',
  },
  batchTopRule: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2.5,
    backgroundColor: colors.clayTerracotta,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderHairline,
    marginBottom: spacing.sm,
  },
  cardHeaderRowMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 6,
  },
  batchIdGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  batchIdMono: {
    fontFamily: typography.fontFamily.mono,
    fontSize: 15,
    fontWeight: '700',
    color: colors.inkCharcoal,
    letterSpacing: 0.5,
  },
  productBadge: {
    backgroundColor: colors.batterCream,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderHairline,
  },
  productBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.inkCharcoal,
    fontFamily: typography.fontFamily.body,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.inkCharcoal,
  },
  statusCreated: {
    backgroundColor: '#EAE5DB',
  },
  statusAssigned: {
    backgroundColor: '#F7E7CD',
  },
  statusReceived: {
    backgroundColor: '#DEEBDA',
  },
  statusPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    fontFamily: typography.fontFamily.mono,
    color: colors.inkCharcoal,
  },
  deleteLink: {
    paddingVertical: 2,
  },
  deleteLinkText: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: typography.fontFamily.mono,
  },
  paramGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.batterCream,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    gap: 12,
  },
  paramGridMobile: {
    flexDirection: 'column',
    gap: 8,
  },
  paramBox: {
    minWidth: 90,
  },
  paramBoxVendor: {
    flex: 1,
    minWidth: 140,
  },
  paramLabel: {
    fontSize: 9.5,
    fontFamily: typography.fontFamily.mono,
    color: colors.textSecondary,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  paramValueMono: {
    fontSize: 13,
    fontFamily: typography.fontFamily.mono,
    fontWeight: '700',
    color: colors.inkCharcoal,
  },
  assignedVendorName: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.clayTerracotta,
    fontFamily: typography.fontFamily.body,
  },
  unassignedChip: {
    backgroundColor: '#EAE5DB',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.borderHairline,
  },
  unassignedText: {
    fontSize: 11,
    fontFamily: typography.fontFamily.mono,
    color: colors.textMuted,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.xs,
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cardFooterMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  mlArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  predictButton: {
    backgroundColor: colors.paperWhite,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
  },
  predictButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inkCharcoal,
    fontFamily: typography.fontFamily.body,
  },
  mlLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mlLoadingText: {
    fontSize: 12,
    fontFamily: typography.fontFamily.mono,
    color: colors.clayTerracotta,
  },
  mlResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  reRunBtn: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    backgroundColor: colors.paperWhite,
  },
  reRunText: {
    fontSize: 11,
    fontFamily: typography.fontFamily.mono,
    color: colors.textSecondary,
  },
  expiryNote: {
    fontSize: 11,
    fontFamily: typography.fontFamily.mono,
    color: colors.textSecondary,
  },
  expiredNote: {
    color: colors.rustRed,
    fontWeight: '700',
  },
  mlErrorText: {
    fontSize: 11,
    color: colors.rustRed,
    fontFamily: typography.fontFamily.body,
  },
  actionButtonsArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  assignVendorButton: {
    backgroundColor: colors.clayTerracotta,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
  },
  assignVendorText: {
    color: colors.paperWhite,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: typography.fontFamily.body,
  },
  receiveBtn: {
    backgroundColor: colors.bananaGreen,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
  },
  receiveBtnText: {
    color: colors.paperWhite,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: typography.fontFamily.body,
  },
  modalReceiveBtn: {
    backgroundColor: colors.bananaGreen,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
  },
  modalReceiveBtnText: {
    color: colors.paperWhite,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: typography.fontFamily.body,
  },
  viewDetailsButton: {
    backgroundColor: colors.batterCream,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
  },
  viewDetailsText: {
    color: colors.inkCharcoal,
    fontSize: 12,
    fontWeight: '700',
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
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: spacing.sm,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.inkCharcoal,
    marginBottom: spacing.md,
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
  modalNoticeBanner: {
    backgroundColor: colors.batterCream,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    borderLeftWidth: 3,
    borderLeftColor: colors.bananaGreen,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  modalNoticeTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.bananaGreen,
    fontFamily: typography.fontFamily.body,
    marginBottom: 2,
  },
  modalNoticeBody: {
    fontSize: 11.5,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.body,
  },
  boldUnderline: {
    fontWeight: '700',
    color: colors.inkCharcoal,
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
  formGrid: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  formRowHalf: {
    flex: 1,
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
    fontSize: 13,
    color: colors.inkCharcoal,
    minHeight: 38,
  },
  fieldInputMono: {
    fontFamily: typography.fontFamily.mono,
  },
  readOnlyInput: {
    backgroundColor: colors.batterCream,
    color: colors.textSecondary,
  },
  textAreaInput: {
    minHeight: 60,
    textAlignVertical: 'top',
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
  detailStatsContainer: {
    backgroundColor: colors.batterCream,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    padding: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderHairline,
  },
  detailLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.body,
  },
  detailValue: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.inkCharcoal,
  },
  fontMono: {
    fontFamily: typography.fontFamily.mono,
  },
  detailNotes: {
    fontSize: 12,
    color: colors.inkCharcoal,
    fontFamily: typography.fontFamily.body,
    maxWidth: '65%',
    textAlign: 'right',
  },
  closeOnlyBtn: {
    backgroundColor: colors.inkCharcoal,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.sm,
  },
  closeOnlyBtnText: {
    color: colors.paperWhite,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: typography.fontFamily.body,
  },
});
