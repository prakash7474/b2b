import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../store/authStore';
import { useBatchStore } from '../../store/batchStore';
import { Batch } from '../../types/batch';
import { BatchStatusBadge } from '../../components/BatchStatusBadge';
import { ReceiveBatchModal } from './ReceiveBatchModal';

export const VendorBatchListScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { vendor_id } = useAuthStore();
  const { batches, fetchBatches, isLoading } = useBatchStore();

  const [filter, setFilter] = useState<'all' | 'assigned' | 'received'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [receiveBatchTarget, setReceiveBatchTarget] = useState<Batch | null>(null);

  const loadData = async () => {
    if (vendor_id) {
      await fetchBatches(vendor_id);
    }
  };

  useEffect(() => {
    loadData();
  }, [vendor_id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const vendorBatches = batches.filter((b) => {
    if (filter === 'all') return true;
    return b.status === filter;
  });

  const renderItem = ({ item }: { item: Batch }) => (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.batchId}>{item.batch_id}</Text>
          <Text style={styles.productName}>{item.product_name}</Text>
        </View>
        <BatchStatusBadge status={item.status} />
      </View>

      <View style={styles.metaGrid}>
        <View style={styles.metaItem}>
          <Text style={styles.metaLbl}>Volume</Text>
          <Text style={styles.metaVal}>{item.volume_kg} kg</Text>
        </View>
        <View style={styles.metaItem}>
          <Text style={styles.metaLbl}>Initial pH</Text>
          <Text style={styles.metaVal}>{item.initialPH}</Text>
        </View>
        <View style={styles.metaItem}>
          <Text style={styles.metaLbl}>Mfg Temp</Text>
          <Text style={styles.metaVal}>{item.temperatureC}°C</Text>
        </View>
        <View style={styles.metaItem}>
          <Text style={styles.metaLbl}>Batch No</Text>
          <Text style={styles.metaVal}>{item.batch_number || item.batch_id}</Text>
        </View>
      </View>

      {item.notes ? (
        <View style={styles.notesBox}>
          <Text style={styles.notesText}>Notes: {item.notes}</Text>
        </View>
      ) : null}

      <View style={styles.actionRow}>
        {item.status === 'assigned' ? (
          <TouchableOpacity
            style={styles.receiveBtn}
            onPress={() => setReceiveBatchTarget(item)}
          >
            <Text style={styles.receiveBtnText}>✓ Confirm Receipt</Text>
          </TouchableOpacity>
        ) : null}

        {item.status === 'received' ? (
          <TouchableOpacity
            style={styles.spoilageBtn}
            onPress={() =>
              navigation.navigate('BatchSpoilage', { batchId: item.batch_id })
            }
          >
            <Text style={styles.spoilageBtnText}>Check Spoilage Risk →</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topBar}>
        <Text style={styles.title}>My Batches ({vendorBatches.length})</Text>
      </View>

      <View style={styles.filterRow}>
        {(['all', 'assigned', 'received'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.filterChip, filter === tab && styles.filterChipActive]}
            onPress={() => setFilter(tab)}
          >
            <Text
              style={[styles.filterText, filter === tab && styles.filterTextActive]}
            >
              {tab === 'all'
                ? 'All'
                : tab === 'assigned'
                ? 'Awaiting Receipt'
                : 'Received'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading && !refreshing && batches.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4ecca3" />
        </View>
      ) : (
        <FlatList
          data={vendorBatches}
          keyExtractor={(item) => item.batch_id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No batches found</Text>
              <Text style={styles.emptySub}>
                When the central kitchen assigns batter to your shop, it will appear here.
              </Text>
            </View>
          }
        />
      )}

      {receiveBatchTarget ? (
        <ReceiveBatchModal
          visible={!!receiveBatchTarget}
          batch={receiveBatchTarget}
          onClose={() => setReceiveBatchTarget(null)}
          onSuccess={() => {
            setReceiveBatchTarget(null);
            loadData();
          }}
        />
      ) : null}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f0f2f5',
  },
  topBar: {
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
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f0f2f5',
  },
  filterChipActive: {
    backgroundColor: '#1a1a2e',
  },
  filterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  filterTextActive: {
    color: '#ffffff',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e8eaed',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  batchId: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  productName: {
    fontSize: 14,
    color: '#555',
    fontWeight: '600',
    marginTop: 2,
  },
  metaGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#f8f9fa',
  },
  metaItem: {
    alignItems: 'center',
  },
  metaLbl: {
    fontSize: 10,
    color: '#888',
    textTransform: 'uppercase',
  },
  metaVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#333',
    marginTop: 2,
  },
  notesBox: {
    backgroundColor: '#fdfbf7',
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
  },
  notesText: {
    fontSize: 12,
    color: '#7f6000',
  },
  actionRow: {
    flexDirection: 'row',
    marginTop: 12,
  },
  receiveBtn: {
    backgroundColor: '#4ecca3',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
  },
  receiveBtnText: {
    color: '#1a1a2e',
    fontWeight: '800',
    fontSize: 13,
  },
  spoilageBtn: {
    backgroundColor: '#3498db',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  spoilageBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  empty: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#999',
  },
  emptySub: {
    fontSize: 13,
    color: '#aaa',
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
