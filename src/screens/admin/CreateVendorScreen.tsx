import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useVendorStore } from '../../store/vendorStore';
import { colors, radius, shadows, spacing } from '../../theme';

const LOCALITY_TIERS = [
  { label: 'Residential Budget', value: 'residential_budget' },
  { label: 'Commercial Offices', value: 'commercial_offices' },
  { label: 'Residential Premium', value: 'residential_premium' },
  { label: 'Institutional', value: 'institutional' },
  { label: 'Mixed', value: 'mixed' },
];

const STORAGE_TYPES = [
  { label: 'Refrigerated Cellar', value: 'refrigerated' },
  { label: 'Ambient Cool', value: 'ambient_cool' },
  { label: 'Room Temperature', value: 'room_temp' },
];

export const CreateVendorScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { addVendor, isLoading, error } = useVendorStore();

  const [vendorId, setVendorId] = useState('');
  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [localityTier, setLocalityTier] = useState('residential_budget');
  const [hotspotDensityScore, setHotspotDensityScore] = useState('33');
  const [hasRefrigerator, setHasRefrigerator] = useState(true);
  const [storageType, setStorageType] = useState('refrigerated');
  const [fridgeTemp, setFridgeTemp] = useState('4.0');
  const [rating, setRating] = useState('4.5');

  const handleSubmit = async () => {
    if (!vendorId.trim() || !shopName.trim() || !ownerName.trim()) {
      Alert.alert('Missing Details', 'Please fill in Vendor ID, Shop Name, and Owner Name.');
      return;
    }

    const payload = {
      vendor_id: vendorId.trim().toUpperCase(),
      shop_name: shopName.trim(),
      owner_name: ownerName.trim(),
      phone: phone.trim() || undefined,
      address: address.trim() || undefined,
      localityTier,
      hotspotDensityScore: parseFloat(hotspotDensityScore) || 30,
      hasRefrigerator,
      storageType,
      fridgeTemperatureC: hasRefrigerator ? parseFloat(fridgeTemp) || 4.0 : undefined,
      rating: parseFloat(rating) || 4.5,
    };

    const success = await addVendor(payload);
    if (success) {
      Alert.alert('Success', `${shopName} registered successfully!`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } else {
      Alert.alert('Error', error || 'Failed to register vendor partner.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>Shop Information</Text>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Vendor ID *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. V105"
              placeholderTextColor={colors.textMuted}
              value={vendorId}
              onChangeText={setVendorId}
              autoCapitalize="characters"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Shop Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Sri Murugan Tiffin Centre"
              placeholderTextColor={colors.textMuted}
              value={shopName}
              onChangeText={setShopName}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Owner Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. K. Sundaram"
              placeholderTextColor={colors.textMuted}
              value={ownerName}
              onChangeText={setOwnerName}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Phone Number</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 9876543210"
              placeholderTextColor={colors.textMuted}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Address / Landmark</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="e.g. 14 South Mada St, Mylapore, Chennai"
              placeholderTextColor={colors.textMuted}
              value={address}
              onChangeText={setAddress}
              multiline
              numberOfLines={3}
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionHeader}>Locality & Storage Profile</Text>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Locality Classification</Text>
            <View style={styles.chipRow}>
              {LOCALITY_TIERS.map((tier) => {
                const active = localityTier === tier.value;
                return (
                  <TouchableOpacity
                    key={tier.value}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setLocalityTier(tier.value)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {tier.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Storage Condition</Text>
            <View style={styles.chipRow}>
              {STORAGE_TYPES.map((type) => {
                const active = storageType === type.value;
                return (
                  <TouchableOpacity
                    key={type.value}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setStorageType(type.value)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {type.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.switchRow}>
            <View>
              <Text style={styles.switchLabel}>Refrigerator Available</Text>
              <Text style={styles.switchSubLabel}>
                Shop has dedicated cold storage for batter
              </Text>
            </View>
            <Switch
              value={hasRefrigerator}
              onValueChange={setHasRefrigerator}
              trackColor={{ false: colors.borderLight, true: colors.greenLight }}
              thumbColor={hasRefrigerator ? colors.greenPrimary : colors.borderStrong}
            />
          </View>

          {hasRefrigerator && (
            <View style={styles.formGroup}>
              <Text style={styles.label}>Fridge Operating Temp (°C)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 4.0"
                placeholderTextColor={colors.textMuted}
                value={fridgeTemp}
                onChangeText={setFridgeTemp}
                keyboardType="numeric"
              />
            </View>
          )}

          <View style={styles.formGroup}>
            <Text style={styles.label}>Hotspot Density Score (1–100)</Text>
            <TextInput
              style={styles.input}
              placeholder="33"
              placeholderTextColor={colors.textMuted}
              value={hotspotDensityScore}
              onChangeText={setHotspotDensityScore}
              keyboardType="numeric"
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, isLoading && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={styles.submitBtnText}>Register Vendor Partner</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.soft,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.brownPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.md,
  },
  formGroup: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
  },
  textArea: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  chipActive: {
    backgroundColor: colors.greenLight,
    borderColor: colors.greenBorder,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.greenDark,
    fontWeight: '700',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingVertical: 6,
  },
  switchLabel: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  switchSubLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  submitBtn: {
    backgroundColor: colors.greenPrimary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.sm,
    ...shadows.soft,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: colors.textInverse,
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
