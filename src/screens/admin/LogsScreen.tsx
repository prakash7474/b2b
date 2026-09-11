import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  useWindowDimensions,
} from 'react-native';
import { colors, radius, typography, spacing } from '../../theme';
import {
  LedgerPanel,
  FilterBar,
  LogType,
  LogSeverity,
  EmptyState,
  Skeleton,
} from '../../components/ledger';
import { logService, LogItem } from '../../services/logService';

export const LogsScreen: React.FC = () => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [logs, setLogs] = useState<LogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<LogType>('all');
  const [selectedSeverities, setSelectedSeverities] = useState<LogSeverity[]>([
    'info',
    'warning',
    'critical',
  ]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = async () => {
    try {
      setIsLoading(true);
      const data = await logService.getLogs({
        type: selectedType,
        severity: selectedSeverities,
        search,
      });
      setLogs(data);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [selectedType, selectedSeverities]);

  const handleToggleSeverity = (sev: LogSeverity) => {
    if (selectedSeverities.includes(sev)) {
      if (selectedSeverities.length > 1) {
        setSelectedSeverities(selectedSeverities.filter((s) => s !== sev));
      }
    } else {
      setSelectedSeverities([...selectedSeverities, sev]);
    }
  };

  const handleExportCsv = () => {
    logService.exportLogsCsv(logs);
  };

  const formatTimestamp = (ts: string) => {
    try {
      const d = new Date(ts);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hour = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day} ${hour}:${min}`;
    } catch {
      return ts;
    }
  };

  const renderTypeBadge = (type: string) => {
    let badgeStyle = styles.typeActivity;
    let textStyle = styles.typeTextActivity;
    let label = 'Activity';

    if (type === 'alert') {
      badgeStyle = styles.typeAlert;
      textStyle = styles.typeTextAlert;
      label = 'Alert';
    } else if (type === 'system') {
      badgeStyle = styles.typeSystem;
      textStyle = styles.typeTextSystem;
      label = 'System';
    }

    return (
      <View style={[styles.typeBadge, badgeStyle]}>
        <Text style={[styles.typeText, textStyle]}>{label}</Text>
      </View>
    );
  };

  const renderSeverityDot = (sev: string) => {
    let dotColor = colors.textMuted;
    if (sev === 'warning') dotColor = colors.turmericGold;
    if (sev === 'critical') dotColor = colors.rustRed;

    return <View style={[styles.severityDot, { backgroundColor: dotColor }]} />;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.pageHeader}>
          <View>
            <Text style={styles.headerSub}>AUDIT & SECURITY TRAIL</Text>
            <Text style={styles.headerTitle}>Logs</Text>
          </View>
          <Text style={styles.headerCount}>{logs.length} Entries Recorded</Text>
        </View>

        {/* Filter Controls */}
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          selectedType={selectedType}
          onTypeChange={setSelectedType}
          selectedSeverities={selectedSeverities}
          onToggleSeverity={handleToggleSeverity}
          onExportCsv={handleExportCsv}
        />

        {/* Log Entries Table / Feed */}
        <LedgerPanel title="System & Activity Feed" noPadding>
          {isLoading ? (
            <View style={styles.loadingBox}>
              <Skeleton height={36} style={{ marginBottom: 8 }} />
              <Skeleton height={36} style={{ marginBottom: 8 }} />
              <Skeleton height={36} style={{ marginBottom: 8 }} />
              <Skeleton height={36} />
            </View>
          ) : logs.length === 0 ? (
            <EmptyState
              message="No logs match these filters"
              subtext="Try adjusting the keyword, type filter, or severity options."
              actionLabel="Clear Filters"
              onAction={() => {
                setSearch('');
                setSelectedType('all');
                setSelectedSeverities(['info', 'warning', 'critical']);
              }}
            />
          ) : (
            <View style={styles.tableContainer}>
              {/* Desktop Header Row */}
              {!isMobile ? (
                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.th, styles.colTimestamp]}>Timestamp</Text>
                  <Text style={[styles.th, styles.colType]}>Type</Text>
                  <Text style={[styles.th, styles.colSev]}>Sev</Text>
                  <Text style={[styles.th, styles.colActor]}>Actor</Text>
                  <Text style={[styles.th, styles.colEvent]}>Event</Text>
                  <Text style={[styles.th, styles.colRelated]}>Related To</Text>
                </View>
              ) : null}

              {/* Rows */}
              {logs.map((item, index) => {
                const isExpanded = expandedId === (item._id || String(index));
                const key = item._id || String(index);

                return (
                  <View key={key} style={styles.rowWrap}>
                    <TouchableOpacity
                      style={[
                        styles.logRow,
                        isMobile && styles.logRowMobile,
                        index % 2 === 1 && styles.rowAlt,
                      ]}
                      onPress={() => setExpandedId(isExpanded ? null : key)}
                      activeOpacity={0.7}
                    >
                      {!isMobile ? (
                        <>
                          <Text style={[styles.tdTimestamp, styles.colTimestamp]}>
                            {formatTimestamp(item.timestamp)}
                          </Text>
                          <View style={styles.colType}>{renderTypeBadge(item.type)}</View>
                          <View style={styles.colSev}>{renderSeverityDot(item.severity)}</View>
                          <Text style={[styles.tdActor, styles.colActor]}>{item.actor}</Text>
                          <Text style={[styles.tdEvent, styles.colEvent]} numberOfLines={2}>
                            {item.event}
                          </Text>
                          <View style={styles.colRelated}>
                            {item.related_to?.name || item.related_to?.id ? (
                              <View style={styles.entityChip}>
                                <Text style={styles.entityChipText} numberOfLines={1}>
                                  {item.related_to.name || item.related_to.id}
                                </Text>
                              </View>
                            ) : (
                              <Text style={styles.tdMuted}>—</Text>
                            )}
                          </View>
                        </>
                      ) : (
                        /* Mobile Card Layout */
                        <View style={styles.mobileCard}>
                          <View style={styles.mobileTop}>
                            <Text style={styles.tdTimestamp}>{formatTimestamp(item.timestamp)}</Text>
                            <View style={styles.mobileBadges}>
                              {renderSeverityDot(item.severity)}
                              {renderTypeBadge(item.type)}
                            </View>
                          </View>
                          <Text style={styles.mobileEvent}>{item.event}</Text>
                          <View style={styles.mobileBottom}>
                            <Text style={styles.mobileActor}>Actor: {item.actor}</Text>
                            {item.related_to?.name || item.related_to?.id ? (
                              <View style={styles.entityChip}>
                                <Text style={styles.entityChipText}>
                                  {item.related_to.name || item.related_to.id}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      )}
                    </TouchableOpacity>

                    {/* Accordion Expandable Metadata */}
                    {isExpanded ? (
                      <View style={styles.metadataBox}>
                        <Text style={styles.metadataTitle}>Entry Details & Metadata:</Text>
                        <Text style={styles.metadataText}>Actor: {item.actor}</Text>
                        <Text style={styles.metadataText}>Event: {item.event}</Text>
                        {item.related_to ? (
                          <Text style={styles.metadataText}>
                            Related: {item.related_to.type} ({item.related_to.id} - {item.related_to.name})
                          </Text>
                        ) : null}
                        {item.metadata && Object.keys(item.metadata).length > 0 ? (
                          <View style={styles.metadataJson}>
                            <Text style={styles.jsonText}>
                              {JSON.stringify(item.metadata, null, 2)}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </LedgerPanel>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.batterCream,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
  },
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.md,
  },
  headerSub: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.clayTerracotta,
    fontFamily: typography.mono,
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.inkCharcoal,
    fontFamily: typography.heading,
  },
  headerCount: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    fontFamily: typography.mono,
  },
  loadingBox: {
    padding: spacing.md,
  },
  tableContainer: {
    width: '100%',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundAlt,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.inkCharcoal,
    alignItems: 'center',
  },
  th: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontFamily: typography.mono,
  },
  colTimestamp: { width: 130 },
  colType: { width: 85 },
  colSev: { width: 45, alignItems: 'center' },
  colActor: { width: 90 },
  colEvent: { flex: 1, paddingHorizontal: 6 },
  colRelated: { width: 140 },

  rowWrap: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  logRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.paperWhite,
  },
  logRowMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    padding: spacing.sm + 4,
  },
  rowAlt: {
    backgroundColor: '#FAF5EC',
  },
  tdTimestamp: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: typography.mono,
  },
  tdActor: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.inkCharcoal,
  },
  tdEvent: {
    fontSize: 12.5,
    color: colors.textPrimary,
    lineHeight: 18,
  },
  tdMuted: {
    fontSize: 12,
    color: colors.textMuted,
  },
  typeBadge: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  typeActivity: {
    backgroundColor: colors.backgroundAlt,
    borderColor: colors.borderLight,
  },
  typeTextActivity: {
    color: colors.textSecondary,
  },
  typeAlert: {
    backgroundColor: colors.warningBg,
    borderColor: colors.turmericGold,
  },
  typeTextAlert: {
    color: colors.turmericGold,
  },
  typeSystem: {
    backgroundColor: colors.paperWhite,
    borderColor: colors.inkCharcoal,
  },
  typeTextSystem: {
    color: colors.inkCharcoal,
  },
  typeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  severityDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  entityChip: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
    maxWidth: 130,
  },
  entityChipText: {
    fontSize: 10.5,
    fontFamily: typography.mono,
    color: colors.textSecondary,
  },
  metadataBox: {
    backgroundColor: colors.backgroundAlt,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  metadataTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.inkCharcoal,
    fontFamily: typography.mono,
    marginBottom: 4,
  },
  metadataText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  metadataJson: {
    backgroundColor: colors.paperWhite,
    padding: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginTop: 6,
  },
  jsonText: {
    fontSize: 11,
    fontFamily: typography.mono,
    color: colors.inkCharcoal,
  },

  // Mobile layout styles
  mobileCard: {
    width: '100%',
  },
  mobileTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  mobileBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mobileEvent: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.inkCharcoal,
    marginBottom: 6,
    lineHeight: 18,
  },
  mobileBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mobileActor: {
    fontSize: 11,
    color: colors.textMuted,
  },
});
