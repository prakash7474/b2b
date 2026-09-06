import { useFetch } from '../hooks/useFetch';
import orderService from '../services/orderService';
import Screen from '../components/ui/Screen';
import OrderCard from '../components/cards/OrderCard';
import Loading from '../components/ui/Loading';
import EmptyState from '../components/ui/EmptyState';

export default function OrdersScreen() {
  const { data: orders, loading, error, refetch } = useFetch(() => orderService.list());

  return (
    <Screen title="Orders" onRefresh={refetch} refreshing={loading}>
      {loading ? <Loading /> : null}
      {error ? <EmptyState message={`Error: ${error}`} /> : null}
      {orders?.map((o) => <OrderCard key={o.order_id} order={o} />)}
      {orders?.length === 0 ? <EmptyState message="No orders found." /> : null}
    </Screen>
  );
}
