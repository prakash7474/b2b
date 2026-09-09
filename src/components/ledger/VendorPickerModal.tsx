import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  TouchableWithoutFeedback,
} from 'react-native';
import { colors, radius, typography, spacing } from '../../theme';
import { Vendor } from '../../types/vendor';

interface VendorPickerModalProps {
  visible: boolean;
  vendors: Vendor[];
  currentVendorId?: string;
  onSelect: (vendorId: string) => void;
  onClose: () => void;
}

export const VendorPickerModal: React.FC<VendorPickerModalProps> = ({
  visible,
  vendors,
  currentVendorId,
  onSelect,
  onClose,
}) => {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(currentVendorId || '');

  const filtered = vendors.filter((v) => {
    const q = search.toLowerCase();
    return (
      v.shop_name?.toLowerCase().includes(q) ||
      v.vendor_id?.toLowerCase().includes(q) ||
      v.address?.toLowerCase().includes(q)
    );
  });

  const handleConfirm = () => {
    if (selectedId) {
      onSelect(selectedId);
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.modalBox}>
              <View style={styles.header}>
                <Text style={styles.title}>Assign Batch to Vendor</Text>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                  <Text style={styles.closeText}>[Close]</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.searchBar}>
                <TextInput
                  style={styles.searchInput}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Filter active vendors by name, ID, or area..."
                  placeholderTextColor={colors.textMuted}
                />
              </View>

              <FlatList
                data={filtered}
                keyExtractor={(item) => item.vendor_id}
                style={styles.list}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => {
                  const isSelected = selectedId === item.vendor_id;
                  return (
                    <TouchableOpacity
                      style={[styles.vendorRow, isSelected && styles.vendorRowSelected]}
                      onPress={() => setSelectedId(item.vendor_id)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.vendorInfo}>
                        <Text style={styles.shopName}>{item.shop_name}</Text>
                        <Text style={styles.vendorMeta}>
                          {item.vendor_id} • {item.address || 'Address not listed'}
                        </Text>
                        <Text style={styles.vendorSub}>
                          Storage: {item.storageType || (item.hasRefrigerator ? 'Fridge' : 'Shelf')} • Rating: {item.rating || 4.0}/5
                        </Text>
                      </View>
                      <View style={[styles.radio, isSelected && styles.radioSelected]}>
                        {isSelected ? <View style={styles.radioInner} /> : null}
                      </View>
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.empty}>
                    <Text style={styles.emptyText}>No vendors match your search.</Text>
                  </View>
                }
              />

              <View style={styles.actions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmBtn, !selectedId && styles.disabledBtn]}
                  onPress={handleConfirm}
                  disabled={!selectedId}
                >
                  <Text style={styles.confirmText}>Confirm Assignment</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(43, 36, 30, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  modalBox: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '85%',
    backgroundColor: colors.paperWhite,
    borderWidth: 1.5,
    borderTopWidth: 2.5,
    borderColor: colors.inkCharcoal,
    borderRadius: radius.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.inkCharcoal,
    fontFamily: typography.heading,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  closeText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
  },
  searchBar: {
    padding: spacing.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.backgroundAlt,
  },
  searchInput: {
    backgroundColor: colors.paperWhite,
    borderWidth: 1,
    borderColor: colors.inkCharcoal,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.textPrimary,
  },
  list: {
    maxHeight: 320,
  },
  listContent: {
    padding: spacing.sm,
  },
  vendorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.sm + 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: spacing.xs + 2,
    backgroundColor: colors.paperWhite,
  },
  vendorRowSelected: {
    borderColor: colors.clayTerracotta,
    backgroundColor: '#F7EFE9',
  },
  vendorInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  shopName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.inkCharcoal,
  },
  vendorMeta: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: typography.mono,
    marginTop: 2,
  },
  vendorSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.clayTerracotta,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.clayTerracotta,
  },
  empty: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    backgroundColor: colors.backgroundAlt,
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.inkCharcoal,
    backgroundColor: colors.paperWhite,
  },
  cancelText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inkCharcoal,
  },
  confirmBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.sm,
    backgroundColor: colors.clayTerracotta,
    borderWidth: 1,
    borderColor: colors.inkCharcoal,
  },
  confirmText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.paperWhite,
  },
  disabledBtn: {
    opacity: 0.5,
  },
});
