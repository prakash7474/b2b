import { useFetch } from '../hooks/useFetch';
import inventoryService from '../services/inventoryService';
import Screen from '../components/ui/Screen';
import InventoryCard from '../components/cards/InventoryCard';
import Loading from '../components/ui/Loading';
import EmptyState from '../components/ui/EmptyState';

export default function InventoryScreen() {
  const { data: items, loading, error, refetch } = useFetch(() => inventoryService.list());

  return (
    <Screen title="Inventory" onRefresh={refetch} refreshing={loading}>
      {loading ? <Loading /> : null}
      {error ? <EmptyState message={`Error: ${error}`} /> : null}
      {items?.map((item) => <InventoryCard key={item.inventory_id} item={item} />)}
      {items?.length === 0 ? <EmptyState message="No inventory items." /> : null}
    </Screen>
  );
}
