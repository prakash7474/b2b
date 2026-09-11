import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useVendorStore } from '../../store/vendorStore';
import { useBatchStore } from '../../store/batchStore';
import { BatchStatusBadge } from '../../components/BatchStatusBadge';
import { colors, radius, shadows, spacing } from '../../theme';

export const VendorDetailScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { vendorId } = route.params || {};

  const { fetchVendor, currentVendor, isLoading } = useVendorStore();
  const { batches, fetchBatches } = useBatchStore();

  useEffect(() => {
    if (vendorId) {
      fetchVendor(vendorId);
      fetchBatches(vendorId);
    }
  }, [vendorId]);

  if (isLoading && !currentVendor) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.greenPrimary} />
        </View>
      </SafeAreaView>
    );
  }

  const vendorBatches = batches.filter((b) => b.vendor_id === vendorId);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile Header Card */}
        <View style={styles.card}>
          <View style={styles.profileHeader}>
            <View style={styles.profileTitleCol}>
              <Text style={styles.vendorIdTag}>{currentVendor?.vendor_id}</Text>
              <Text style={styles.shopTitle}>{currentVendor?.shop_name}</Text>
            </View>
            <View style={styles.ratingBadge}>
              <Text style={styles.ratingText}>Rating: {currentVendor?.rating ?? 4.5}/5</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Owner Name</Text>
              <Text style={styles.infoVal}>{currentVendor?.owner_name || '—'}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Phone Contact</Text>
              <Text style={styles.infoVal}>{currentVendor?.phone || 'Not provided'}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Locality Tier</Text>
              <Text style={styles.infoVal}>{currentVendor?.localityTier || 'Residential'}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Hotspot Score</Text>
              <Text style={styles.infoVal}>{currentVendor?.hotspotDensityScore ?? 33}/100</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Cold Storage</Text>
              <Text style={styles.infoVal}>
                {currentVendor?.hasRefrigerator ? `Chilled (${currentVendor.fridgeTemperatureC ?? 4}°C)` : 'Ambient Only'}
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Storage Method</Text>
              <Text style={styles.infoVal}>{currentVendor?.storageType || 'Ambient Cool'}</Text>
            </View>
          </View>

          {currentVendor?.address ? (
            <View style={styles.addressBox}>
              <Text style={styles.addressLabel}>Address / Landmark</Text>
              <Text style={styles.addressVal}>{currentVendor.address}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() =>
              navigation.navigate('PerVendorForecast', { vendorId: currentVendor?.vendor_id })
            }
          >
            <Text style={styles.actionBtnText}>Run Automated Demand Forecast →</Text>
          </TouchableOpacity>
        </View>

        {/* Batches Assigned to this Vendor */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>
            Assigned Batches ({vendorBatches.length})
          </Text>
        </View>

        {vendorBatches.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No batter batches currently assigned to this shop.</Text>
          </View>
        ) : (
          vendorBatches.map((batch) => (
            <View key={batch.batch_id} style={styles.batchCard}>
              <View style={styles.batchTop}>
                <View>
                  <Text style={styles.batchId}>{batch.batch_id}</Text>
                  <Text style={styles.batchProduct}>{batch.product_name}</Text>
                </View>
                <BatchStatusBadge status={batch.status} />
              </View>

              <View style={styles.batchStats}>
                <View style={styles.batchStatItem}>
                  <Text style={styles.batchStatLbl}>Volume</Text>
                  <Text style={styles.batchStatVal}>{batch.volume_kg || batch.quantity_kg || 0} kg</Text>
                </View>
                <View style={styles.batchStatItem}>
                  <Text style={styles.batchStatLbl}>Acidity</Text>
                  <Text style={styles.batchStatVal}>pH {batch.initialPH ?? 4.4}</Text>
                </View>
                <View style={styles.batchStatItem}>
                  <Text style={styles.batchStatLbl}>Temp</Text>
                  <Text style={styles.batchStatVal}>{batch.temperatureC ?? 26}°C</Text>
                </View>
              </View>

              {batch.status === 'received' ? (
                <TouchableOpacity
                  style={styles.spoilageBtn}
                  onPress={() =>
                    navigation.navigate('PerBatchSpoilage', { batchId: batch.batch_id })
                  }
                >
                  <Text style={styles.spoilageBtnText}>Assess Spoilage Risk →</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.soft,
  },
  profileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  profileTitleCol: {
    flex: 1,
  },
  vendorIdTag: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: colors.brownPrimary,
    marginBottom: 2,
  },
  shopTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  ratingBadge: {
    backgroundColor: colors.accentOat,
    borderColor: colors.border,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brownDark,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.md,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.md,
  },
  infoItem: {
    width: '50%',
  },
  infoLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 3,
  },
  infoVal: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  addressBox: {
    backgroundColor: colors.backgroundAlt,
    padding: spacing.sm + 2,
    borderRadius: radius.sm,
    marginTop: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.brownPrimary,
  },
  addressLabel: {
    fontSize: 10.5,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: 2,
  },
  addressVal: {
    fontSize: 12.5,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  actionBtn: {
    backgroundColor: colors.greenPrimary,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  actionBtnText: {
    color: colors.textInverse,
    fontSize: 13.5,
    fontWeight: '700',
  },
  sectionHeaderRow: {
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.brownDark,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  batchCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.soft,
  },
  batchTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  batchId: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  batchProduct: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  batchStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  batchStatItem: {
    flex: 1,
  },
  batchStatLbl: {
    fontSize: 10.5,
    color: colors.textMuted,
  },
  batchStatVal: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 2,
  },
  spoilageBtn: {
    backgroundColor: colors.greenLight,
    borderWidth: 1,
    borderColor: colors.greenBorder,
    borderRadius: radius.sm,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  spoilageBtnText: {
    color: colors.greenDark,
    fontSize: 12,
    fontWeight: '700',
  },
});
