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

interface ReceiveBatchModalProps {
  visible: boolean;
  batch: Batch;
  onClose: () => void;
  onSuccess: () => void;
}

export const ReceiveBatchModal: React.FC<ReceiveBatchModalProps> = ({
  visible,
  batch,
  onClose,
  onSuccess,
}) => {
  const { receiveBatch } = useBatchStore();
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    const ok = await receiveBatch(batch.batch_id, notes.trim());
    setLoading(false);

    if (ok) {
      Alert.alert(
        'Receipt Confirmed',
        `Batch ${batch.batch_id} (${batch.product_name}) received and added to active inventory!`,
        [{ text: 'OK', onPress: onSuccess }]
      );
    } else {
      Alert.alert('Error', 'Failed to confirm receipt of batch.');
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <SafeAreaView style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Confirm Batch Delivery</Text>
          <Text style={styles.subtitle}>
            You are confirming receipt for {batch.batch_id} ({batch.product_name} • {batch.volume_kg}kg)
          </Text>

          <View style={styles.infoBox}>
            <Text style={styles.infoLine}>Initial pH: {batch.initialPH}</Text>
            <Text style={styles.infoLine}>Delivery Temp: {batch.temperatureC}°C</Text>
            <Text style={styles.infoLine}>Manufacturer: {batch.manufacturer}</Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Delivery Notes (Optional)</Text>
            <TextInput
              style={styles.textArea}
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. Delivered in chilled cooler box, condition intact..."
              placeholderTextColor="#999"
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={loading}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.confirmBtn, loading && styles.disabledBtn]}
              onPress={handleConfirm}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmBtnText}>✓ Confirm Receipt</Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  subtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
    marginBottom: 14,
  },
  infoBox: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginBottom: 14,
    gap: 4,
  },
  infoLine: {
    fontSize: 12,
    color: '#444',
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  textArea: {
    backgroundColor: '#fafafa',
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f0f2f5',
  },
  cancelBtnText: {
    color: '#555',
    fontWeight: '600',
    fontSize: 14,
  },
  confirmBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#27ae60',
  },
  disabledBtn: {
    opacity: 0.6,
  },
  confirmBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
});
