import { useNavigation } from '@react-navigation/native';
import { useFetch } from '../hooks/useFetch';
import batchService from '../services/batchService';
import type { RootNavigation } from '../navigation/types';
import Screen from '../components/ui/Screen';
import BatchCard from '../components/cards/BatchCard';
import Loading from '../components/ui/Loading';
import EmptyState from '../components/ui/EmptyState';

export default function BatchesScreen() {
  const navigation = useNavigation<RootNavigation>();
  const { data: batches, loading, error, refetch } = useFetch(() => batchService.list());

  return (
    <Screen title="Batches" onRefresh={refetch} refreshing={loading}>
      {loading ? <Loading /> : null}
      {error ? <EmptyState message={`Error: ${error}`} /> : null}
      {batches?.map((b) => (
        <BatchCard
          key={b.batch_id}
          batch={b}
          onPress={() => navigation.navigate('BatchDetail', { id: b.batch_id })}
        />
      ))}
      {batches?.length === 0 ? <EmptyState message="No batches found." /> : null}
    </Screen>
  );
}
