import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../store/authStore';
import { useBatchStore } from '../../store/batchStore';
import { usePredictionStore } from '../../store/predictionStore';
import { StatCard } from '../../components/StatCard';

export const VendorHomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { vendor_id, shop_name, logout } = useAuthStore();
  const { batches, fetchBatches } = useBatchStore();
  const { fetchVendorForecast, vendorForecast } = usePredictionStore();

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    if (vendor_id) {
      await Promise.all([
        fetchBatches(vendor_id),
        fetchVendorForecast(vendor_id),
      ]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [vendor_id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const assignedCount = batches.filter((b) => b.status === 'assigned').length;
  const receivedCount = batches.filter((b) => b.status === 'received').length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>B2P Vendor Portal</Text>
          <Text style={styles.headerVendor}>{shop_name || vendor_id}</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4ecca3" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* Welcome Card */}
          <View style={styles.welcomeBanner}>
            <Text style={styles.welcomeTitle}>Welcome back, {shop_name || vendor_id}!</Text>
            <Text style={styles.welcomeDesc}>
              Track batter deliveries, confirm receipt of incoming batches, check spoilage risk,
              and review AI demand forecasts.
            </Text>
          </View>

          {/* Stats Grid */}
          <Text style={styles.sectionTitle}>Overview & Delivery Pipeline</Text>
          <View style={styles.grid}>
            <StatCard
              title="Awaiting Receipt"
              value={assignedCount}
              color="#f39c12"
              onPress={() => navigation.navigate('My Batches')}
            />
            <StatCard
              title="Received Batches"
              value={receivedCount}
              color="#27ae60"
              onPress={() => navigation.navigate('My Batches')}
            />
            <StatCard
              title="Total Batches"
              value={batches.length}
              color="#1a1a2e"
              onPress={() => navigation.navigate('My Batches')}
            />
            <StatCard
              title="Demand Forecast"
              value={vendorForecast?.predictedDemand ?? '-'}
              color="#3498db"
              subtitle="predicted units"
              onPress={() => navigation.navigate('Demand Forecast')}
            />
          </View>

          {/* Quick Actions / Shortcuts */}
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('My Batches')}
          >
            <View style={styles.actionIcon}>
              <Text style={styles.actionIconText}>B</Text>
            </View>
            <View style={styles.actionTextContainer}>
              <Text style={styles.actionTitle}>Review Incoming Batches</Text>
              <Text style={styles.actionDesc}>
                Confirm physical delivery and register batches into active store inventory.
              </Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('Demand Forecast')}
          >
            <View style={styles.actionIcon}>
              <Text style={styles.actionIconText}>D</Text>
            </View>
            <View style={styles.actionTextContainer}>
              <Text style={styles.actionTitle}>View AI Sales Forecast</Text>
              <Text style={styles.actionDesc}>
                See recommended restock dispatch quantity for tomorrow based on your sales.
              </Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f0f2f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#1a1a2e',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
  },
  headerVendor: {
    fontSize: 12,
    color: '#4ecca3',
    fontWeight: '600',
    marginTop: 2,
  },
  logoutBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  logoutText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  welcomeBanner: {
    backgroundColor: '#4ecca3',
    borderRadius: 14,
    padding: 20,
    marginBottom: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  welcomeTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1a1a2e',
  },
  welcomeDesc: {
    fontSize: 13,
    color: '#0f3460',
    marginTop: 6,
    lineHeight: 18,
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 6,
    marginBottom: 10,
    marginLeft: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
    marginBottom: 16,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
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
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f0fdf4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  actionIconText: {
    fontSize: 22,
  },
  actionTextContainer: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  actionDesc: {
    fontSize: 12,
    color: '#666',
    marginTop: 3,
    lineHeight: 16,
  },
  arrow: {
    fontSize: 22,
    color: '#aaa',
    marginLeft: 8,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
