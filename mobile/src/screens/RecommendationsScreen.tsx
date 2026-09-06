import { View, Text, StyleSheet } from 'react-native';
import { useFetch } from '../hooks/useFetch';
import recommendationService from '../services/recommendationService';
import Screen from '../components/ui/Screen';
import Loading from '../components/ui/Loading';
import EmptyState from '../components/ui/EmptyState';
import { colors } from '../theme';

const RANK_COLORS = ['#F1C40F', '#95A5A6', '#CD7F32'];

export default function RecommendationsScreen() {
  const { data: recs, loading, error, refetch } = useFetch(() => recommendationService.list());

  return (
    <Screen title="Recommendations" onRefresh={refetch} refreshing={loading}>
      {loading ? <Loading /> : null}
      {error ? <EmptyState message={`Error: ${error}`} /> : null}
      {recs?.map((r) => (
        <View
          key={r.vendor_id}
          style={[styles.card, { borderLeftColor: r.recommendation_rank <= 3 ? RANK_COLORS[r.recommendation_rank - 1] : colors.border }]}
        >
          <View style={styles.head}>
            <Text style={styles.name}>
              #{r.recommendation_rank} {r.shop_name}
            </Text>
            <Text style={styles.score}>Score: {r.score}</Text>
          </View>
          <View style={styles.stats}>
            <Text style={styles.stat}>📦 Stock: {r.total_stock}</Text>
            <Text style={styles.stat}>🌿 Freshness: {(r.avg_freshness * 100).toFixed(0)}%</Text>
            <Text style={styles.stat}>⭐ Rating: {r.rating}</Text>
            <Text style={styles.stat}>📍 Hotspot: {r.hotspot_density}</Text>
          </View>
        </View>
      ))}
      {recs?.length === 0 ? <EmptyState message="No recommendations available." /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: 10, padding: 16, marginBottom: 8, borderLeftWidth: 4 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  score: { fontSize: 14, color: colors.textSecondary },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 8 },
  stat: { fontSize: 13, color: colors.textSecondary },
});
