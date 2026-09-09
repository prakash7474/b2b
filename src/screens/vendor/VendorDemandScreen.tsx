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
import { useAuthStore } from '../../store/authStore';
import { usePredictionStore } from '../../store/predictionStore';

export const VendorDemandScreen: React.FC = () => {
  const { vendor_id, shop_name } = useAuthStore();
  const { fetchVendorForecast, vendorForecast, isLoading, error } = usePredictionStore();
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    if (vendor_id) {
      await fetchVendorForecast(vendor_id);
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>My Sales & Demand Forecast</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.banner}>
          <Text style={styles.bannerShop}>{shop_name || vendor_id}</Text>
          <Text style={styles.bannerDesc}>
            AI-driven demand prediction and restock recommendations derived directly from your past
            POS and order volumes.
          </Text>
        </View>

        {isLoading && !refreshing ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#4ecca3" />
            <Text style={styles.loadingText}>Running XGBoost forecast model...</Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {vendorForecast ? (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.cardHeaderTitle}>Upcoming Dispatch Recommendation</Text>
              <Text style={styles.productTag}>{vendorForecast.product}</Text>
            </View>

            <View style={styles.primaryMetricGrid}>
              <View style={styles.primaryMetric}>
                <Text style={styles.primaryVal}>{vendorForecast.predictedDemand}</Text>
                <Text style={styles.primaryLbl}>Predicted Sales (units)</Text>
              </View>
              <View style={styles.primaryMetric}>
                <Text style={[styles.primaryVal, { color: '#27ae60' }]}>
                  {vendorForecast.recommendedDispatch} kg
                </Text>
                <Text style={styles.primaryLbl}>Recommended Restock</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <Text style={styles.sectionTitle}>Inventory Stock Balance</Text>
            <View style={styles.stockRow}>
              <View style={styles.stockCol}>
                <Text style={styles.stockNum}>{vendorForecast.availableStock} kg</Text>
                <Text style={styles.stockLbl}>Current Available</Text>
              </View>
              <View style={styles.stockCol}>
                <Text style={styles.stockNum}>{vendorForecast.minimumStock} kg</Text>
                <Text style={styles.stockLbl}>Min Threshold</Text>
              </View>
              <View style={styles.stockCol}>
                <Text style={styles.stockNum}>{vendorForecast.safetyStock} kg</Text>
                <Text style={styles.stockLbl}>Safety Reserve</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <Text style={styles.sectionTitle}>Recent Sales Performance</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statTile}>
                <Text style={styles.statLbl}>Yesterday's Sales (Lag 1)</Text>
                <Text style={styles.statVal}>{vendorForecast.featuresUsed?.lag1 ?? '-'} units</Text>
              </View>
              <View style={styles.statTile}>
                <Text style={styles.statLbl}>Same Day Last Wk (Lag 7)</Text>
                <Text style={styles.statVal}>{vendorForecast.featuresUsed?.lag7 ?? '-'} units</Text>
              </View>
              <View style={styles.statTile}>
                <Text style={styles.statLbl}>7-Day Daily Average</Text>
                <Text style={styles.statVal}>
                  {vendorForecast.featuresUsed?.rolling_7d_mean ?? '-'} units
                </Text>
              </View>
              <View style={styles.statTile}>
                <Text style={styles.statLbl}>4-Week Slot Trend</Text>
                <Text style={styles.statVal}>
                  {vendorForecast.featuresUsed?.same_slot_4wk ?? '-'} units
                </Text>
              </View>
            </View>

            <TouchableOpacity style={styles.refreshBtn} onPress={loadData}>
              <Text style={styles.refreshBtnText}>↻ Refresh Forecast Data</Text>
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
  banner: {
    backgroundColor: '#1a1a2e',
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
  },
  bannerShop: {
    fontSize: 18,
    fontWeight: '800',
    color: '#4ecca3',
  },
  bannerDesc: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.75)',
    marginTop: 4,
    lineHeight: 18,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e8eaed',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  productTag: {
    backgroundColor: '#e3f2fd',
    color: '#1976d2',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  primaryMetricGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 12,
  },
  primaryMetric: {
    alignItems: 'center',
  },
  primaryVal: {
    fontSize: 32,
    fontWeight: '900',
    color: '#1a1a2e',
  },
  primaryLbl: {
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
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 12,
  },
  stockRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  stockCol: {
    alignItems: 'center',
  },
  stockNum: {
    fontSize: 17,
    fontWeight: '800',
    color: '#222',
  },
  stockLbl: {
    fontSize: 10,
    color: '#888',
    marginTop: 2,
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
  statLbl: {
    fontSize: 10,
    color: '#777',
    fontWeight: '600',
  },
  statVal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1a1a2e',
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
