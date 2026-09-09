import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { usePredictionStore } from '../../store/predictionStore';
import { PredictionHistoryItem } from '../../types/prediction';
import { RiskBadge } from '../../components/RiskBadge';
import { colors, radius, shadows, spacing } from '../../theme';

const formatPct = (val?: number) => {
  if (val === undefined || val === null) return '0%';
  const num = typeof val === 'number' ? val : parseFloat(String(val)) || 0;
  const pct = num > 1 ? num : num * 100;
  return `${Math.round(pct)}%`;
};

export const PredictionHistoryScreen: React.FC = () => {
  const { history, stats, fetchHistory, fetchStats, isLoading } = usePredictionStore();
  const [filterType, setFilterType] = useState<'all' | 'demand' | 'spoilage'>('all');
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async (type?: string) => {
    await Promise.all([
      fetchHistory(type === 'all' ? undefined : type),
      fetchStats(),
    ]);
  };

  useEffect(() => {
    loadData(filterType);
  }, [filterType]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData(filterType);
    setRefreshing(false);
  };

  const renderItem = ({ item }: { item: PredictionHistoryItem }) => {
    const isDemand = item.predictionType === 'demand';
    const dateStr = item.generatedAt ? new Date(item.generatedAt).toLocaleString() : 'Recent';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.typeBadge, isDemand ? styles.demandBadge : styles.spoilageBadge]}>
            <Text style={[styles.typeText, isDemand ? styles.demandText : styles.spoilageText]}>
              {isDemand ? 'Demand Forecast' : 'Spoilage Risk'}
            </Text>
          </View>
          <Text style={styles.dateText}>{dateStr}</Text>
        </View>

        <View style={styles.cardBody}>
          {isDemand ? (
            <View style={styles.detailsRow}>
              <View style={styles.detailCol}>
                <Text style={styles.valText}>{item.predictedValue ?? '-'}</Text>
                <Text style={styles.lblText}>Projected Demand (kg)</Text>
              </View>
              <View style={[styles.detailCol, styles.detailColHighlight]}>
                <Text style={[styles.valText, { color: colors.greenPrimary }]}>
                  {item.recommendedDispatch ?? '-'}
                </Text>
                <Text style={[styles.lblText, { color: colors.greenDark }]}>Suggested Dispatch (kg)</Text>
              </View>
            </View>
          ) : (
            <View style={styles.detailsRow}>
              <View style={styles.detailCol}>
                <RiskBadge risk={item.riskLabel || 'Low'} />
                <Text style={styles.lblText}>Predicted Risk</Text>
              </View>
              <View style={styles.detailCol}>
                <Text style={styles.valText}>
                  {item.confidence ? formatPct(item.confidence) : '-'}
                </Text>
                <Text style={styles.lblText}>Model Confidence</Text>
              </View>
            </View>
          )}

          <View style={styles.targetRow}>
            {item.vendorId ? (
              <Text style={styles.targetText}>
                Partner: <Text style={styles.targetBold}>{item.vendorId}</Text>
              </Text>
            ) : null}
            {item.batchId ? (
              <Text style={styles.targetText}>
                Batch: <Text style={styles.targetBold}>{item.batchId}</Text>
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.headerSub}>AUDIT & INFERENCE LOGS</Text>
          <Text style={styles.title}>Prediction History</Text>
        </View>
      </View>

      {/* Summary Header */}
      {stats ? (
        <View style={styles.statsBar}>
          <View style={styles.statTile}>
            <Text style={styles.statNum}>{stats.total ?? 0}</Text>
            <Text style={styles.statLbl}>Total Logs</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statTile}>
            <Text style={[styles.statNum, { color: colors.greenPrimary }]}>{stats.demand ?? 0}</Text>
            <Text style={styles.statLbl}>Demand</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statTile}>
            <Text style={[styles.statNum, { color: colors.brownPrimary }]}>{stats.spoilage ?? 0}</Text>
            <Text style={styles.statLbl}>Spoilage</Text>
          </View>
        </View>
      ) : null}

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {(['all', 'demand', 'spoilage'] as const).map((type) => (
          <TouchableOpacity
            key={type}
            style={[styles.filterBtn, filterType === type && styles.filterBtnActive]}
            onPress={() => setFilterType(type)}
            activeOpacity={0.7}
          >
            <Text
              style={[styles.filterText, filterType === type && styles.filterTextActive]}
            >
              {type === 'all' ? 'All Inferences' : type === 'demand' ? 'Demand Forecasts' : 'Spoilage Tests'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading && !refreshing && history.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.greenPrimary} />
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item, idx) => item._id || String(idx)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.greenPrimary}
              colors={[colors.greenPrimary]}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>—</Text>
              <Text style={styles.emptyText}>No prediction logs recorded yet</Text>
              <Text style={styles.emptySub}>Inferences run across vendors and batches will appear here</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm + 4,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  headerSub: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.brownMedium,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  statTile: {
    alignItems: 'center',
    flex: 1,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.borderLight,
  },
  statNum: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  statLbl: {
    fontSize: 10,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontWeight: '700',
    marginTop: 2,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: spacing.xs + 2,
  },
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  filterBtnActive: {
    backgroundColor: colors.brownPrimary,
    borderColor: colors.brownPrimary,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterTextActive: {
    color: colors.textInverse,
    fontWeight: '700',
  },
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm + 4,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.card,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  demandBadge: {
    backgroundColor: colors.greenLight,
    borderColor: colors.greenBorder,
  },
  spoilageBadge: {
    backgroundColor: colors.statusFermentingBg,
    borderColor: colors.statusFermentingBorder,
  },
  typeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  demandText: {
    color: colors.greenDark,
  },
  spoilageText: {
    color: colors.statusFermenting,
  },
  dateText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  cardBody: {
    marginTop: 2,
  },
  detailsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  detailCol: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.backgroundAlt,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  detailColHighlight: {
    backgroundColor: colors.greenLight,
    borderColor: colors.greenBorder,
  },
  valText: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  lblText: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginTop: 3,
  },
  targetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.xs + 4,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  targetText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  targetBold: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  empty: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  emptySub: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
});
