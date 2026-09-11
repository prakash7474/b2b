import React, { useState, useEffect } from 'react';
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
import { inventoryService } from '../../services/inventoryService';
import { colors, typography } from '../../theme';

interface UpdateStockModalProps {
  visible: boolean;
  vendorId: string;
  currentStock: number;
  minimumStock?: number;
  onClose: () => void;
  onSuccess: (result: { below_minimum: boolean; is_stockout: boolean; remaining_quantity_kg: number }) => void;
}

export const UpdateStockModal: React.FC<UpdateStockModalProps> = ({
  visible,
  vendorId,
  currentStock,
  minimumStock = 10,
  onClose,
  onSuccess,
}) => {
  const [quantityStr, setQuantityStr] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      setQuantityStr(String(currentStock));
    }
  }, [visible, currentStock]);

  if (!visible) return null;

  const handleSubmit = async () => {
    const qty = parseFloat(quantityStr);
    if (isNaN(qty) || qty < 0) {
      Alert.alert('Invalid Volume', 'Please enter a valid remaining quantity in kilograms.');
      return;
    }

    if (qty > currentStock) {
      Alert.alert('Invalid Quantity', 'Cannot be higher than current stock');
      return;
    }

    setLoading(true);
    try {
      const res = await inventoryService.vendorUpdateStock(vendorId, qty);
      setLoading(false);
      onSuccess(res);
    } catch (err: any) {
      setLoading(false);
      Alert.alert('Update Failed', err.response?.data?.error || err.message || 'Error updating stock.');
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <SafeAreaView style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Update Current Stock</Text>
              <Text style={styles.headerSubtitle}>
                Shop ID: {vendorId}
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} disabled={loading}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <View style={styles.productRow}>
              <Text style={styles.fieldLabel}>Current Recorded Stock:</Text>
              <View style={styles.productChip}>
                <Text style={styles.productChipText}>{currentStock} kg</Text>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Remaining Quantity (kg)</Text>
              <View style={styles.qtyInputRow}>
                <TextInput
                  style={styles.qtyInput}
                  value={quantityStr}
                  onChangeText={setQuantityStr}
                  keyboardType="numeric"
                  placeholder="e.g. 5"
                  placeholderTextColor={colors.textMuted}
                />
                <Text style={styles.unitSuffix}>Kilograms (KG)</Text>
              </View>
              <Text style={styles.hintText}>
                {parseFloat(quantityStr) > currentStock ? "Cannot be higher than current stock" : `Minimum required: ${minimumStock} kg`}
              </Text>
            </View>

            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={loading}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.submitBtn, loading && styles.disabledBtn]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <Text style={styles.submitBtnText}>Update Stock</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(43, 36, 30, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  container: {
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
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.inkCharcoal,
    fontFamily: typography.heading,
  },
  headerSubtitle: {
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
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderHairline,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.inkCharcoal,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  productChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surfaceElevated,
  },
  productChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.clayTerracotta,
  },
  inputGroup: {
    marginBottom: 14,
  },
  qtyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  qtyInput: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '800',
    color: colors.inkCharcoal,
  },
  unitSuffix: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  hintText: {
    fontSize: 11,
    color: colors.rustRed,
    fontWeight: '600',
    marginTop: 4,
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 6,
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
  submitBtn: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
    backgroundColor: colors.clayTerracotta,
    minWidth: 170,
    alignItems: 'center',
  },
  disabledBtn: {
    opacity: 0.6,
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textInverse,
    letterSpacing: 0.3,
  },
});
