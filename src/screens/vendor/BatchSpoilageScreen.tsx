import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../store/authStore';
import { useBatchStore } from '../../store/batchStore';
import { usePredictionStore } from '../../store/predictionStore';
import { RiskBadge } from '../../components/RiskBadge';
import { BatchPicker } from '../../components/BatchPicker';

export const BatchSpoilageScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const initialBatchId = route.params?.batchId || '';

  const { vendor_id } = useAuthStore();
  const { batches, fetchBatches } = useBatchStore();
  const { fetchBatchSpoilage, batchSpoilage, isLoading, error } = usePredictionStore();

  const [batchId, setBatchId] = useState(initialBatchId);
  const [refreshing, setRefreshing] = useState(false);

  const vendorBatches = batches.filter((b) => b.status === 'received');

  useEffect(() => {
    if (vendor_id) {
      fetchBatches(vendor_id);
    }
  }, [vendor_id]);

  useEffect(() => {
    if (vendorBatches.length > 0 && !batchId) {
      setBatchId(vendorBatches[0].batch_id);
    }
  }, [vendorBatches]);

  useEffect(() => {
    if (batchId) {
      fetchBatchSpoilage(batchId);
    }
  }, [batchId]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (batchId) await fetchBatchSpoilage(batchId);
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>Batter Spoilage Assessment</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.selectorCard}>
          <BatchPicker
            batches={vendorBatches}
            selectedBatchId={batchId}
            onSelect={setBatchId}
            label="Select Received Batch"
          />
        </View>

        {isLoading && !refreshing ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#4ecca3" />
            <Text style={styles.loadingText}>Analyzing batter biochemical status...</Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {batchSpoilage ? (
          <View style={styles.resultCard}>
            <View style={styles.topRow}>
              <View>
                <Text style={styles.batchId}>{batchSpoilage.batch_id}</Text>
                <Text style={styles.productName}>{batchSpoilage.product_name}</Text>
              </View>
              <RiskBadge
                risk={batchSpoilage.mlRiskLabel || batchSpoilage.freshnessRisk || 'Low'}
              />
            </View>

            <View style={styles.meterContainer}>
              <View style={styles.meterBox}>
                <Text style={styles.meterNum}>
                  {Math.round((batchSpoilage.freshnessScore || 0) * 100)}%
                </Text>
                <Text style={styles.meterLbl}>Freshness Health</Text>
              </View>
              <View style={styles.meterBox}>
                <Text style={[styles.meterNum, { color: '#3498db' }]}>
                  {Math.round((batchSpoilage.mlConfidence || 0) * 100)}%
                </Text>
                <Text style={styles.meterLbl}>AI Confidence</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <Text style={styles.sectionHeader}>Freshness & Expiry Progression</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statTile}>
                <Text style={styles.statLabel}>Hours Since Milling</Text>
                <Text style={styles.statValue}>{batchSpoilage.hoursSinceManufacture} hrs</Text>
              </View>
              <View style={styles.statTile}>
                <Text style={styles.statLabel}>Safe Shelf Life Remaining</Text>
                <Text style={[styles.statValue, { color: '#e67e22' }]}>
                  ~{batchSpoilage.hoursToExpiry} hrs
                </Text>
              </View>
              <View style={styles.statTile}>
                <Text style={styles.statLabel}>Sell-Through Velocity</Text>
                <Text style={styles.statValue}>{batchSpoilage.sellThroughRate} units/hr</Text>
              </View>
            </View>

            {batchSpoilage.mlProbabilities ? (
              <View style={styles.probCard}>
                <Text style={styles.probTitle}>Classifier Risk Probabilities</Text>
                <View style={styles.probRow}>
                  {Object.entries(batchSpoilage.mlProbabilities).map(([cls, p]) => (
                    <View key={cls} style={styles.probCol}>
                      <Text style={styles.probVal}>{Math.round(p * 100)}%</Text>
                      <Text style={styles.probLbl}>{cls}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            <TouchableOpacity
              style={styles.refreshBtn}
              onPress={() => batchId && fetchBatchSpoilage(batchId)}
            >
              <Text style={styles.refreshBtnText}>↻ Re-evaluate Risk</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f0f2f5',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  selectorCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e8eaed',
    marginBottom: 16,
  },
  resultCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 20,
    borderWidth: 2,
    borderColor: '#4ecca3',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  batchId: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1a1a2e',
  },
  productName: {
    fontSize: 14,
    color: '#555',
    marginTop: 2,
  },
  meterContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 10,
  },
  meterBox: {
    alignItems: 'center',
  },
  meterNum: {
    fontSize: 32,
    fontWeight: '900',
    color: '#1a1a2e',
  },
  meterLbl: {
    fontSize: 11,
    color: '#777',
    fontWeight: '600',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#f0f2f5',
    marginVertical: 16,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '800',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 10,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statTile: {
    width: '48%',
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
  },
  statLabel: {
    fontSize: 10,
    color: '#777',
    fontWeight: '600',
  },
  statValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1a1a2e',
    marginTop: 2,
  },
  probCard: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f2f5',
  },
  probTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  probRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  probCol: {
    alignItems: 'center',
  },
  probVal: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  probLbl: {
    fontSize: 10,
    color: '#666',
    marginTop: 2,
  },
  refreshBtn: {
    marginTop: 20,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#4ecca3',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  refreshBtnText: {
    color: '#0f3460',
    fontWeight: '700',
    fontSize: 14,
  },
  center: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
    fontSize: 14,
  },
  errorBox: {
    backgroundColor: '#fce4ec',
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  errorText: {
    color: '#c62828',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
