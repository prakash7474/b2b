import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
  SafeAreaView,
} from 'react-native';
import { Batch } from '../types/batch';
import { BatchStatusBadge } from './BatchStatusBadge';
import { colors, radius, shadows, spacing } from '../theme';

interface BatchPickerProps {
  batches: Batch[];
  selectedBatchId: string;
  onSelect: (batchId: string) => void;
  label?: string;
}

export const BatchPicker: React.FC<BatchPickerProps> = ({
  batches,
  selectedBatchId,
  onSelect,
  label = 'Select Batch',
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [search, setSearch] = useState('');

  const selectedBatch = batches.find((b) => b.batch_id === selectedBatchId);

  const filtered = batches.filter(
    (b) =>
      b.batch_id.toLowerCase().includes(search.toLowerCase()) ||
      b.product_name.toLowerCase().includes(search.toLowerCase()) ||
      (b.batch_number && b.batch_number.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TouchableOpacity
        style={styles.pickerButton}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}
      >
        <Text style={[styles.pickerText, !selectedBatch && styles.pickerPlaceholder]}>
          {selectedBatch
            ? `${selectedBatch.batch_id} • ${selectedBatch.product_name}`
            : 'Choose a batch...'}
        </Text>
        <Text style={styles.arrow}>▾</Text>
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <SafeAreaView style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalSub}>PRODUCTION TELEMETRY</Text>
                <Text style={styles.modalTitle}>Select Batter Batch</Text>
              </View>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.searchInput}
              placeholder="Search batch ID or batter type..."
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
            />

            <FlatList
              data={filtered}
              keyExtractor={(item) => item.batch_id}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const isSelected = item.batch_id === selectedBatchId;
                return (
                  <TouchableOpacity
                    style={[
                      styles.itemRow,
                      isSelected && styles.selectedItemRow,
                    ]}
                    onPress={() => {
                      onSelect(item.batch_id);
                      setModalVisible(false);
                    }}
                  >
                    <View style={styles.itemInfo}>
                      <View style={styles.itemTitleRow}>
                        <Text style={[styles.itemTitle, isSelected && styles.selectedItemTitle]}>
                          {item.batch_id}
                        </Text>
                        <BatchStatusBadge status={item.status} />
                      </View>
                      <Text style={styles.itemSubtitle}>
                        {item.product_name} • {item.volume_kg || item.quantity_kg || 0} kg
                        {item.fermentationHours ? ` • ${item.fermentationHours}h ferment` : ''}
                      </Text>
                    </View>
                    {isSelected ? (
                      <View style={styles.checkBadge}>
                        <Text style={styles.checkMark}>✓</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No matching batches found</Text>
              }
            />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.4,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  pickerButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    ...shadows.soft,
  },
  pickerText: {
    fontSize: 14.5,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  pickerPlaceholder: {
    color: colors.textMuted,
    fontWeight: '400',
  },
  arrow: {
    fontSize: 16,
    color: colors.brownMedium,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(45, 37, 30, 0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.md,
    maxHeight: '80%',
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  modalSub: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: colors.brownPrimary,
    marginBottom: 2,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.backgroundAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 13.5,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.sm + 4,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginBottom: spacing.xs + 2,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  selectedItemRow: {
    backgroundColor: colors.greenLight,
    borderColor: colors.greenBorder,
  },
  itemInfo: {
    flex: 1,
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 3,
  },
  itemTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  selectedItemTitle: {
    color: colors.greenDark,
  },
  itemSubtitle: {
    fontSize: 11.5,
    color: colors.textMuted,
  },
  checkBadge: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.greenPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    color: colors.textInverse,
    fontSize: 13,
    fontWeight: '800',
  },
  emptyText: {
    textAlign: 'center',
    paddingVertical: spacing.xl,
    color: colors.textMuted,
    fontSize: 13,
  },
});
