import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { colors, radius, typography, spacing } from '../../theme';

export type LogType = 'all' | 'activity' | 'alert' | 'system';
export type LogSeverity = 'info' | 'warning' | 'critical';

interface FilterBarProps {
  search: string;
  onSearchChange: (val: string) => void;
  selectedType: LogType;
  onTypeChange: (type: LogType) => void;
  selectedSeverities: LogSeverity[];
  onToggleSeverity: (sev: LogSeverity) => void;
  onExportCsv?: () => void;
}

const TYPES: { label: string; value: LogType }[] = [
  { label: 'All', value: 'all' },
  { label: 'Activity', value: 'activity' },
  { label: 'Alerts', value: 'alert' },
  { label: 'System', value: 'system' },
];

const SEVERITIES: { label: string; value: LogSeverity; dotColor: string }[] = [
  { label: 'Info', value: 'info', dotColor: colors.textMuted },
  { label: 'Warning', value: 'warning', dotColor: colors.turmericGold },
  { label: 'Critical', value: 'critical', dotColor: colors.rustRed },
];

export const FilterBar: React.FC<FilterBarProps> = ({
  search,
  onSearchChange,
  selectedType,
  onTypeChange,
  selectedSeverities,
  onToggleSeverity,
  onExportCsv,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={onSearchChange}
          placeholder="Filter logs by keyword, event, or entity..."
          placeholderTextColor={colors.textMuted}
        />
        {onExportCsv ? (
          <TouchableOpacity
            style={styles.exportBtn}
            onPress={onExportCsv}
            activeOpacity={0.7}
          >
            <Text style={styles.exportText}>Export CSV</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.controlsRow}>
        {/* Type Segmented Control */}
        <View style={styles.segmentedWrap}>
          {TYPES.map((t) => {
            const active = selectedType === t.value;
            return (
              <TouchableOpacity
                key={t.value}
                style={[styles.segment, active && styles.segmentActive]}
                onPress={() => onTypeChange(t.value)}
                activeOpacity={0.8}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Severity Multi-select Chips */}
        <View style={styles.severityWrap}>
          <Text style={styles.filterLabel}>Severity:</Text>
          {SEVERITIES.map((s) => {
            const active = selectedSeverities.includes(s.value);
            return (
              <TouchableOpacity
                key={s.value}
                style={[styles.sevChip, active && styles.sevChipActive]}
                onPress={() => onToggleSeverity(s.value)}
                activeOpacity={0.7}
              >
                <View style={[styles.sevDot, { backgroundColor: s.dotColor }]} />
                <Text style={[styles.sevText, active && styles.sevTextActive]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.paperWhite,
    borderWidth: 1.5,
    borderTopWidth: 2.5,
    borderColor: colors.inkCharcoal,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
    marginBottom: spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm + 2,
    flexWrap: 'wrap',
  },
  searchInput: {
    flex: 1,
    minWidth: 220,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.inkCharcoal,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.textPrimary,
  },
  exportBtn: {
    backgroundColor: colors.paperWhite,
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  exportText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inkCharcoal,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  segmentedWrap: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.inkCharcoal,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  segment: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRightWidth: 1,
    borderRightColor: colors.borderLight,
  },
  segmentActive: {
    backgroundColor: colors.clayTerracotta,
  },
  segmentText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.inkCharcoal,
  },
  segmentTextActive: {
    color: colors.paperWhite,
  },
  severityWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  filterLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginRight: 2,
  },
  sevChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.background,
  },
  sevChipActive: {
    borderColor: colors.inkCharcoal,
    backgroundColor: colors.paperWhite,
  },
  sevDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  sevText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  sevTextActive: {
    color: colors.inkCharcoal,
    fontWeight: '700',
  },
});
