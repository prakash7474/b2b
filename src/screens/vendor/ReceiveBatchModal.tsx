// ════════════════════════════════════════════════════════════════════════════
// 📌 VENDOR RECEIVE BATCH MODAL (src/screens/vendor/ReceiveBatchModal.tsx)
// ════════════════════════════════════════════════════════════════════════════
// 💡 WHAT THIS FILE DOES (EXPLAIN THIS TO THE INSTRUCTOR):
//    This modal handles the digital handoff when the delivery van arrives at a shop.
//    The vendor inspects the batch quality metrics, verifies container seal, and confirms receipt.
//
//    Inspection Metrics Displayed:
//    - Initial pH (acidity level at milling time, ideally 4.2 - 4.6).
//    - Delivery Temperature (°C during cold transit).
//    - Central Kitchen origin / manufacturer.
//
//    What happens when "Confirm Receipt" is pressed:
//    1. Calls `batchStore.receiveBatch(batch.batch_id, notes)`.
//    2. Backend updates batch status: `'assigned'` ➔ `'received'`.
//    3. Records delivery timestamp in the database.
//    4. Automatically adds the batch volume (e.g. +20kg) to the vendor's active stock ledger!
// ════════════════════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  SafeAreaView,
} from 'react-native';
import { Batch } from '../../types/batch';
import { useBatchStore } from '../../store/batchStore';
import { colors, typography } from '../../theme';

// ── Props passed from VendorBatchListScreen ─────────────────────────────────
interface ReceiveBatchModalProps {
  visible: boolean;        // Whether modal is visible
  batch: Batch;            // The batch being received
  onClose: () => void;     // Close button handler
  onSuccess: () => void;   // Success callback to refresh vendor batch list & home
}

export const ReceiveBatchModal: React.FC<ReceiveBatchModalProps> = ({
  visible,
  batch,
  onClose,
  onSuccess,
}) => {
  // Pull receiveBatch action from Zustand batch store
  const { receiveBatch } = useBatchStore();
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  // ── Handle Confirm Receipt ────────────────────────────────────────────────
  const handleConfirm = async () => {
    setLoading(true);
    const ok = await receiveBatch(batch.batch_id, notes.trim());
    setLoading(false);

    if (ok) {
      Alert.alert(
        'Receipt Confirmed',
        `Batch #${batch.batch_id} (${batch.product_name}) received and added to active store inventory!`,
        [{ text: 'OK', onPress: onSuccess }]
      );
    } else {
      Alert.alert('Error', 'Failed to confirm receipt of batch.');
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <SafeAreaView style={styles.overlay}>
        <View style={styles.card}>
          {/* ── Modal Header ──────────────────────────────────────────────── */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Confirm Batch Delivery</Text>
              <Text style={styles.subtitle}>
                Batch #{batch.batch_id} • {batch.product_name} ({batch.volume_kg} kg)
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} disabled={loading}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* ── Batch Quality Verification Summary ────────────────────────── */}
          <View style={styles.body}>
            <View style={styles.infoBox}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Initial pH:</Text>
                <Text style={styles.infoValue}>{batch.initialPH}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Delivery Temp:</Text>
                <Text style={styles.infoValue}>{batch.temperatureC}°C</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Manufacturer:</Text>
                <Text style={styles.infoValue}>{batch.manufacturer || 'Central Kitchen'}</Text>
              </View>
            </View>

            {/* Optional Handoff Notes */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Delivery Handoff Notes (Optional)</Text>
              <TextInput
                style={styles.textArea}
                value={notes}
                onChangeText={setNotes}
                placeholder="e.g. Received intact in insulated cold tote, seal unbroken..."
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            {/* ── Action Buttons ───────────────────────────────────────────── */}
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={loading}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              {/* Confirm Receipt Action Button */}
              <TouchableOpacity
                style={[styles.confirmBtn, loading && styles.disabledBtn]}
                onPress={handleConfirm}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <Text style={styles.confirmBtnText}>✓ Confirm Receipt</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

// ── Stylesheet ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(43, 36, 30, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: colors.paperWhite,
    borderWidth: 1.5,
    borderTopWidth: 3.5,
    borderColor: colors.inkCharcoal,
    borderRadius: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.inkCharcoal,
    backgroundColor: colors.backgroundAlt,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.inkCharcoal,
    fontFamily: typography.heading,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    fontWeight: '600',
  },
  closeBtn: {
    padding: 4,
  },
  closeBtnText: {
    fontSize: 18,
    color: colors.inkCharcoal,
    fontWeight: '700',
  },
  body: {
    padding: 16,
  },
  infoBox: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 4,
    padding: 10,
    marginBottom: 14,
    gap: 4,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.inkCharcoal,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.inkCharcoal,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  textArea: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    borderRadius: 4,
    padding: 10,
    fontSize: 13,
    color: colors.inkCharcoal,
    minHeight: 70,
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.backgroundAlt,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  confirmBtn: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
    backgroundColor: colors.bananaGreen,
    alignItems: 'center',
  },
  disabledBtn: {
    opacity: 0.6,
  },
  confirmBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textInverse,
    letterSpacing: 0.3,
  },
});

