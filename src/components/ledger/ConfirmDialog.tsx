import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TouchableWithoutFeedback,
} from 'react-native';
import { colors, radius, typography, spacing } from '../../theme';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDestructive = false,
  onConfirm,
  onCancel,
}) => {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <TouchableWithoutFeedback onPress={onCancel}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.modalBox}>
              <View style={styles.header}>
                <Text style={styles.title}>{title}</Text>
              </View>
              <View style={styles.body}>
                <Text style={styles.message}>{message}</Text>
              </View>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={onCancel}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cancelText}>{cancelLabel}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmBtn, isDestructive && styles.destructiveBtn]}
                  onPress={onConfirm}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[styles.confirmText, isDestructive && styles.destructiveText]}
                  >
                    {confirmLabel}
                  </Text>
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
    maxWidth: 420,
    backgroundColor: colors.paperWhite,
    borderWidth: 1.5,
    borderTopWidth: 2.5,
    borderColor: colors.inkCharcoal,
    borderRadius: radius.md,
  },
  header: {
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
  body: {
    padding: spacing.md,
  },
  message: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
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
  destructiveBtn: {
    backgroundColor: colors.rustRed,
    borderColor: colors.rustRed,
  },
  destructiveText: {
    color: colors.paperWhite,
  },
});
