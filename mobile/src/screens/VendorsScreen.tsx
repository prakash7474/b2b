import { useNavigation } from '@react-navigation/native';
import { useFetch } from '../hooks/useFetch';
import vendorService from '../services/vendorService';
import type { RootNavigation } from '../navigation/types';
import Screen from '../components/ui/Screen';
import VendorCard from '../components/cards/VendorCard';
import Loading from '../components/ui/Loading';
import EmptyState from '../components/ui/EmptyState';

export default function VendorsScreen() {
  const navigation = useNavigation<RootNavigation>();
  const { data: vendors, loading, error, refetch } = useFetch(() => vendorService.list());

  return (
    <Screen title="Vendors" onRefresh={refetch} refreshing={loading}>
      {loading ? <Loading /> : null}
      {error ? <EmptyState message={`Error: ${error}`} /> : null}
      {vendors?.map((v) => (
        <VendorCard
          key={v.vendor_id}
          vendor={v}
          onPress={() => navigation.navigate('VendorDetail', { id: v.vendor_id })}
        />
      ))}
      {vendors?.length === 0 ? <EmptyState message="No vendors found." /> : null}
    </Screen>
  );
}
