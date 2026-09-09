import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  SafeAreaView,
} from 'react-native';
import { Batch } from '../../types/batch';
import { useVendorStore } from '../../store/vendorStore';
import { useBatchStore } from '../../store/batchStore';
import { VendorPicker } from '../../components/VendorPicker';
import { colors, radius, shadows, spacing } from '../../theme';

interface AssignBatchModalProps {
  visible: boolean;
  batch: Batch;
  onClose: () => void;
  onSuccess?: () => void;
  onAssigned?: () => void;
}

export const AssignBatchModal: React.FC<AssignBatchModalProps> = ({
  visible,
  batch,
  onClose,
  onSuccess,
  onAssigned,
}) => {
  const { vendors } = useVendorStore();
  const { assignBatch } = useBatchStore();

  const [selectedVendorId, setSelectedVendorId] = useState<string>(
    vendors.length > 0 ? vendors[0].vendor_id : ''
  );
  const [loading, setLoading] = useState(false);

  const handleAssign = async () => {
    if (!selectedVendorId) {
      Alert.alert('Select Vendor', 'Please pick a vendor partner to receive this batch.');
      return;
    }

    setLoading(true);
    const ok = await assignBatch(batch.batch_id, selectedVendorId);
    setLoading(false);

    if (ok) {
      Alert.alert(
        'Batch Dispatched',
        `Batch ${batch.batch_id} (${batch.product_name}) has been dispatched to vendor ${selectedVendorId}!`,
        [
          {
            text: 'OK',
            onPress: () => {
              if (onAssigned) onAssigned();
              if (onSuccess) onSuccess();
            },
          },
        ]
      );
    } else {
      Alert.alert('Error', 'Failed to assign batch.');
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <SafeAreaView style={styles.overlay}>
        <View style={styles.modalCard}>
          <View style={styles.header}>
            <View>
              <Text style={styles.subTitle}>LOGISTICS DISPATCH</Text>
              <Text style={styles.title}>Assign Batch to Vendor</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.batchInfoCard}>
            <Text style={styles.batchIdTag}>{batch.batch_id}</Text>
            <Text style={styles.productName}>{batch.product_name}</Text>
            <Text style={styles.batchSub}>
              Volume: {batch.volume_kg || batch.quantity_kg || 0} kg • pH: {batch.initialPH ?? 4.4} • Temp: {batch.temperatureC ?? 26}°C
            </Text>
          </View>

          <VendorPicker
            vendors={vendors}
            selectedVendorId={selectedVendorId}
            onSelect={setSelectedVendorId}
            label="Destination Partner Shop"
          />

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              disabled={loading}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.confirmBtn, loading && styles.confirmBtnDisabled]}
              onPress={handleAssign}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.textInverse} />
              ) : (
                <Text style={styles.confirmBtnText}>Confirm Dispatch →</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(45, 37, 30, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  modalCard: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  subTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: colors.brownPrimary,
    marginBottom: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.backgroundAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '700',
  },
  batchInfoCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderLeftWidth: 4,
    borderLeftColor: colors.greenPrimary,
  },
  batchIdTag: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.brownPrimary,
    letterSpacing: 0.6,
  },
  productName: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 1,
  },
  batchSub: {
    fontSize: 11.5,
    color: colors.textSecondary,
    marginTop: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: colors.brownDark,
    fontSize: 13,
    fontWeight: '700',
  },
  confirmBtn: {
    flex: 2,
    backgroundColor: colors.greenPrimary,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },
  confirmBtnDisabled: {
    opacity: 0.6,
  },
  confirmBtnText: {
    color: colors.textInverse,
    fontSize: 13,
    fontWeight: '700',
  },
});
