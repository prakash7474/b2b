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
import { batchService } from '../../services/batchService';
import { colors, typography } from '../../theme';

interface ReportIssueModalProps {
  visible: boolean;
  batch: Batch | null;
  onClose: () => void;
  onSuccess: () => void;
}

const ISSUE_OPTIONS = [
  { id: 'damaged', label: 'Damaged Container' },
  { id: 'wrong_product', label: 'Wrong Product' },
  { id: 'quantity_mismatch', label: 'Quantity Mismatch' },
  { id: 'bad_smell', label: 'Off Odor / Leaking' },
  { id: 'other', label: 'Other' },
];

export const ReportIssueModal: React.FC<ReportIssueModalProps> = ({
  visible,
  batch,
  onClose,
  onSuccess,
}) => {
  const [selectedIssue, setSelectedIssue] = useState('damaged');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  if (!visible || !batch) return null;

  const handleSubmit = async () => {
    if (!description.trim()) {
      Alert.alert('Details Required', 'Please provide a brief description of the issue.');
      return;
    }

    setLoading(true);
    try {
      const res = await batchService.reportIssue(
        batch.batch_id,
        selectedIssue,
        description.trim()
      );
      setLoading(false);
      if (res.ok) {
        Alert.alert(
          'Issue Reported',
          `Incident report logged for Batch #${batch.batch_id}. Central kitchen operations team has been notified.`,
          [{ text: 'OK', onPress: onSuccess }]
        );
      } else {
        Alert.alert('Error', res.message || 'Failed to submit issue report.');
      }
    } catch (err: any) {
      setLoading(false);
      Alert.alert('Submission Error', err.response?.data?.error || err.message || 'Error reporting issue.');
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <SafeAreaView style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Report Batch Incident</Text>
              <Text style={styles.headerSubtitle}>
                Batch #{batch.batch_id} • {batch.product_name} ({batch.volume_kg} kg)
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} disabled={loading}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <Text style={styles.sectionLabel}>Select Incident Category</Text>
            <View style={styles.chipRow}>
              {ISSUE_OPTIONS.map((opt) => {
                const isSelected = selectedIssue === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.chip, isSelected && styles.chipSelected]}
                    onPress={() => setSelectedIssue(opt.id)}
                  >
                    <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.sectionLabel}>Incident Observations & Notes</Text>
            <TextInput
              style={styles.textArea}
              value={description}
              onChangeText={setDescription}
              placeholder="Detail container status, seal condition, missing volume, or driver handoff notes..."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

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
                  <Text style={styles.submitBtnText}>Submit Report</Text>
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
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.inkCharcoal,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surfaceElevated,
  },
  chipSelected: {
    borderColor: colors.clayTerracotta,
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1.5,
  },
  chipText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: colors.clayTerracotta,
    fontWeight: '800',
  },
  textArea: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    borderRadius: 4,
    padding: 12,
    fontSize: 13,
    color: colors.inkCharcoal,
    minHeight: 90,
    marginBottom: 18,
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
  submitBtn: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
    backgroundColor: colors.rustRed,
    minWidth: 130,
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
