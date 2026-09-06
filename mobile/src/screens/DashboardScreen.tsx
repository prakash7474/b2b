import { View, Text, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useFetch } from '../hooks/useFetch';
import dashboardService from '../services/dashboardService';
import Screen from '../components/ui/Screen';
import StatCard from '../components/ui/StatCard';
import Loading from '../components/ui/Loading';
import EmptyState from '../components/ui/EmptyState';
import { colors } from '../theme';

export default function DashboardScreen() {
  const { user } = useAuth();
  const { data: stats, loading, error, refetch } = useFetch(() => dashboardService.get());

  return (
    <Screen
      title="Dashboard"
      onRefresh={refetch}
      refreshing={loading}
    >
      <View style={styles.greeting}>
        <Text style={styles.hello}>Hello, {user?.username || user?.shop_name || 'User'} 👋</Text>
        <Text style={styles.role}>{user?.role === 'admin' ? 'Admin Dashboard' : 'Vendor Dashboard'}</Text>
      </View>

      {loading ? <Loading /> : null}
      {error ? <EmptyState message={`Error: ${error}`} /> : null}

      {stats ? (
        <View style={styles.grid}>
          <StatCard icon="🏪" label="Total Vendors" value={stats.totalVendors} color={colors.primary} />
          <StatCard icon="📦" label="Total Batches" value={stats.totalBatches} color={colors.info} />
          <StatCard icon="📋" label="Inventory Items" value={stats.totalInventoryItems} color={colors.success} />
          <StatCard icon="🛒" label="Total Stock" value={stats.totalStockQuantity} color={colors.warning} />
          <StatCard icon="⚠️" label="Low Stock Items" value={stats.lowStockItems} color={colors.danger} />
          <StatCard icon="🌡️" label="High Freshness Risk" value={stats.highFreshnessRisk} color={colors.danger} />
          <StatCard icon="📝" label="Total Orders" value={stats.totalOrders} color={colors.primary} />
          <StatCard icon="⏳" label="Pending Orders" value={stats.pendingOrders} color={colors.warning} />
          <StatCard icon="🤖" label="ML Predictions" value={stats.totalPredictions} color={colors.info} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  greeting: { marginBottom: 16 },
  hello: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  role: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
  grid: {},
});
