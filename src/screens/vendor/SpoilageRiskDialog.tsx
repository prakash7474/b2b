import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { Batch } from '../../types/batch';
import { BatchSpoilageResult } from '../../types/prediction';
import { colors, typography } from '../../theme';

interface SpoilageRiskDialogProps {
  visible: boolean;
  batch: Batch | null;
  spoilage: BatchSpoilageResult | null;
  loading: boolean;
  onClose: () => void;
}

export const SpoilageRiskDialog: React.FC<SpoilageRiskDialogProps> = ({
  visible,
  batch,
  spoilage,
  loading,
  onClose,
}) => {
  if (!visible) return null;

  const riskLabel = (spoilage?.mlRiskLabel || spoilage?.riskLabel || 'Low') as 'Low' | 'Medium' | 'High';

  const getRiskColors = (risk: 'Low' | 'Medium' | 'High') => {
    switch (risk) {
      case 'High':
        return {
          bg: colors.dangerBg,
          text: colors.rustRed,
          border: colors.rustRed,
          action: 'High spoilage risk. Recommend immediate stock clearance, discounted sale, or notifying kitchen admin.',
          actionGlyph: '✗',
        };
      case 'Medium':
        return {
          bg: colors.warningBg,
          text: colors.turmericGold,
          border: colors.turmericGold,
          action: 'Moderate fermentation aging. Prioritize early-day sales and ensure cold storage (below 5°C).',
          actionGlyph: '▲',
        };
      case 'Low':
      default:
        return {
          bg: colors.successBg,
          text: colors.bananaGreen,
          border: colors.bananaGreen,
          action: 'Batter is biochemically fresh. Continue normal sales pace with standard refrigeration.',
          actionGlyph: '✓',
        };
    }
  };

  const riskMeta = getRiskColors(riskLabel);
  const compositeRiskPct = Math.round(((spoilage?.riskScore ?? 0.15)) * 100);
  const confidencePct = Math.round(((spoilage?.confidence ?? spoilage?.mlConfidence ?? 0.9)) * (spoilage?.confidence && spoilage.confidence <= 1 ? 100 : 1));

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <SafeAreaView style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Biochemical Spoilage Assessment</Text>
              <Text style={styles.headerSubtitle}>
                Batch #{batch?.batch_id || spoilage?.batch_id} • {batch?.product_name || spoilage?.product_name || 'Idli Batter'}
              </Text>
            </View>
            <TouchableOpacity style={styles.closeHeaderBtn} onPress={onClose}>
              <Text style={styles.closeHeaderBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.clayTerracotta} />
              <Text style={styles.loadingText}>Running Random Forest Biochemical Classifier...</Text>
            </View>
          ) : spoilage ? (
            <View style={styles.body}>
              {/* Risk Badge & Score Banner */}
              <View style={[styles.riskBanner, { backgroundColor: riskMeta.bg, borderColor: riskMeta.border }]}>
                <View style={styles.riskBadgeCol}>
                  <Text style={[styles.riskGlyph, { color: riskMeta.text }]}>{riskMeta.actionGlyph}</Text>
                  <View>
                    <Text style={[styles.riskLabelText, { color: riskMeta.text }]}>
                      {riskLabel.toUpperCase()} RISK
                    </Text>
                    <Text style={styles.riskSubText}>
                      Composite Risk Score: {compositeRiskPct}%
                    </Text>
                  </View>
                </View>
                <View style={styles.confidenceCol}>
                  <Text style={styles.confidenceVal}>{confidencePct}%</Text>
                  <Text style={styles.confidenceLbl}>Model Confidence</Text>
                </View>
              </View>

              {/* Metrics Ledger Box */}
              <View style={styles.metricsBox}>
                <View style={styles.metricRow}>
                  <Text style={styles.metricLbl}>Hours Since Milling</Text>
                  <Text style={styles.metricVal}>{spoilage.hoursSinceManufacture} hrs</Text>
                </View>
                <View style={styles.dividerLine} />
                <View style={styles.metricRow}>
                  <Text style={styles.metricLbl}>Safe Remaining Shelf Life</Text>
                  <Text style={[styles.metricVal, { color: colors.clayTerracotta }]}>
                    ~{spoilage.hoursToExpiry} hrs
                  </Text>
                </View>
                <View style={styles.dividerLine} />
                <View style={styles.metricRow}>
                  <Text style={styles.metricLbl}>Sell-Through Velocity</Text>
                  <Text style={styles.metricVal}>{spoilage.sellThroughRate} units/hr</Text>
                </View>
              </View>

              {/* Suggested Action Box */}
              <View style={styles.actionBox}>
                <Text style={styles.actionBoxTitle}>Recommended Operational Action</Text>
                <Text style={styles.actionBoxDesc}>{riskMeta.action}</Text>
              </View>

              {/* Action Button */}
              <TouchableOpacity style={styles.dismissBtn} onPress={onClose}>
                <Text style={styles.dismissBtnText}>Acknowledge & Close</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>Unable to load spoilage risk data for this batch.</Text>
              <TouchableOpacity style={styles.dismissBtn} onPress={onClose}>
                <Text style={styles.dismissBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          )}
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
  closeHeaderBtn: {
    padding: 4,
    paddingHorizontal: 8,
  },
  closeHeaderBtnText: {
    fontSize: 18,
    color: colors.inkCharcoal,
    fontWeight: '700',
  },
  loadingContainer: {
    padding: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  body: {
    padding: 16,
  },
  riskBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1.5,
    borderRadius: 4,
    marginBottom: 14,
  },
  riskBadgeCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  riskGlyph: {
    fontSize: 24,
    fontWeight: '900',
  },
  riskLabelText: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  riskSubText: {
    fontSize: 11,
    color: colors.inkCharcoal,
    marginTop: 2,
    fontWeight: '600',
  },
  confidenceCol: {
    alignItems: 'flex-end',
    paddingLeft: 8,
  },
  confidenceVal: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.inkCharcoal,
  },
  confidenceLbl: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  metricsBox: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 4,
    paddingVertical: 4,
    marginBottom: 14,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  metricLbl: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  metricVal: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.inkCharcoal,
  },
  dividerLine: {
    height: 1,
    backgroundColor: colors.borderHairline,
  },
  actionBox: {
    backgroundColor: colors.backgroundAlt,
    borderLeftWidth: 3,
    borderLeftColor: colors.clayTerracotta,
    padding: 12,
    marginBottom: 16,
    borderRadius: 2,
  },
  actionBoxTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.clayTerracotta,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  actionBoxDesc: {
    fontSize: 13,
    color: colors.inkCharcoal,
    lineHeight: 18,
    fontWeight: '500',
  },
  dismissBtn: {
    backgroundColor: colors.clayTerracotta,
    paddingVertical: 12,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
    alignItems: 'center',
  },
  dismissBtnText: {
    color: colors.textInverse,
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.3,
  },
  errorContainer: {
    padding: 24,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 13,
    color: colors.rustRed,
    marginBottom: 14,
    textAlign: 'center',
  },
});
