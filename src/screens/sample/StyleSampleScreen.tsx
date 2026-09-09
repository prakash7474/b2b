import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  Platform,
} from 'react-native';
import { colors, spacing, radius, shadows } from '../../theme';

interface StyleSampleScreenProps {
  onBackToApp?: () => void;
}

export default function StyleSampleScreen({ onBackToApp }: StyleSampleScreenProps) {
  const [activeTab, setActiveTab] = useState<'batches' | 'freshness' | 'demand'>('batches');
  const [sampleNote, setSampleNote] = useState('');

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Homely Brand Bar */}
        <View style={styles.brandBar}>
          <View>
            <Text style={styles.brandSubtitle}>BATTER TO PLATTER</Text>
            <Text style={styles.brandTitle}>Lakshmi Illam Kitchen</Text>
          </View>
          <View style={styles.leafTag}>
            <Text style={styles.leafTagText}>100% Fresh Daily</Text>
          </View>
        </View>

        {/* Welcome Greeting Banner */}
        <View style={styles.welcomeCard}>
          <View style={styles.welcomeTextGroup}>
            <Text style={styles.welcomeHeading}>Good Morning, Anitha</Text>
            <Text style={styles.welcomeBody}>
              Today's grind is complete. 3 morning batches dispatched to local vendors across T. Nagar.
            </Text>
          </View>
          <View style={styles.clayAccentBar} />
        </View>

        {/* Calm Uncluttered Stat Row */}
        <Text style={styles.sectionHeading}>Today's Kitchen Overview</Text>
        <View style={styles.statsRow}>
          <View style={[styles.statBox, styles.statBoxGreen]}>
            <Text style={styles.statLabel}>Fresh Batches</Text>
            <Text style={styles.statValue}>4</Text>
            <Text style={styles.statHint}>120 kg dispatched</Text>
          </View>

          <View style={[styles.statBox, styles.statBoxBrown]}>
            <Text style={styles.statLabel}>Avg. Ferment Time</Text>
            <Text style={styles.statValue}>8.2<Text style={styles.statUnit}>h</Text></Text>
            <Text style={styles.statHint}>Optimal acidity (pH 4.4)</Text>
          </View>

          <View style={[styles.statBox, styles.statBoxSand]}>
            <Text style={styles.statLabel}>Active Vendors</Text>
            <Text style={styles.statValue}>5</Text>
            <Text style={styles.statHint}>All orders received</Text>
          </View>
        </View>

        {/* Clean Pill Filter Tabs */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'batches' && styles.tabButtonActive]}
            onPress={() => setActiveTab('batches')}
          >
            <Text style={[styles.tabText, activeTab === 'batches' && styles.tabTextActive]}>
              Batch #B20004
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'freshness' && styles.tabButtonActive]}
            onPress={() => setActiveTab('freshness')}
          >
            <Text style={[styles.tabText, activeTab === 'freshness' && styles.tabTextActive]}>
              Freshness Check
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'demand' && styles.tabButtonActive]}
            onPress={() => setActiveTab('demand')}
          >
            <Text style={[styles.tabText, activeTab === 'demand' && styles.tabTextActive]}>
              Vendor Demand
            </Text>
          </TouchableOpacity>
        </View>

        {/* Sample Batter Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.cardTag}>SPECIAL IDLI & DOSA BATTER</Text>
              <Text style={styles.cardTitle}>Batch #B20004</Text>
              <Text style={styles.cardSub}>Stone ground with traditional Ponni rice & urad dal</Text>
            </View>
            <View style={styles.statusBadgeFresh}>
              <Text style={styles.statusBadgeFreshText}>● Fresh & Safe</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.paramGrid}>
            <View style={styles.paramItem}>
              <Text style={styles.paramLabel}>Storage Temp</Text>
              <Text style={styles.paramValue}>24.5 °C</Text>
            </View>
            <View style={styles.paramItem}>
              <Text style={styles.paramLabel}>Acidity</Text>
              <Text style={styles.paramValue}>pH 4.42</Text>
            </View>
            <View style={styles.paramItem}>
              <Text style={styles.paramLabel}>Humidity</Text>
              <Text style={styles.paramValue}>58 %</Text>
            </View>
            <View style={styles.paramItem}>
              <Text style={styles.paramLabel}>Volume</Text>
              <Text style={styles.paramValue}>35 kg</Text>
            </View>
          </View>

          <View style={styles.vendorCallout}>
            <Text style={styles.vendorCalloutLabel}>Assigned Destination:</Text>
            <Text style={styles.vendorCalloutName}>Lakshmi Idli Shop (V100) — T. Nagar, Chennai</Text>
          </View>
        </View>

        {/* Sample Form Field (Natural & Clean) */}
        <Text style={styles.sectionHeading}>Delivery Note / Kitchen Memo</Text>
        <View style={styles.formCard}>
          <Text style={styles.inputLabel}>Kitchen Remarks or Storage Instructions</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. Keep chilled below 25°C. Best consumed before 6 PM."
            placeholderTextColor={colors.textMuted}
            value={sampleNote}
            onChangeText={setSampleNote}
          />
        </View>

        {/* Sample Button Actions */}
        <Text style={styles.sectionHeading}>Button & Action Styles</Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.buttonPrimary}>
            <Text style={styles.buttonPrimaryText}>Confirm Batch Receipt</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.buttonSecondary}>
            <Text style={styles.buttonSecondaryText}>View Spoilage Sensor</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.buttonOutline}>
          <Text style={styles.buttonOutlineText}>Download Batch Report (PDF)</Text>
        </TouchableOpacity>

        {onBackToApp && (
          <TouchableOpacity style={styles.backButton} onPress={onBackToApp}>
            <Text style={styles.backButtonText}>← Switch Back to Current App Navigation</Text>
          </TouchableOpacity>
        )}

        <View style={styles.footerSpace} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'android' ? spacing.lg : spacing.md,
    backgroundColor: colors.background,
  },
  brandBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  brandSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: colors.brownPrimary,
    marginBottom: 2,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  leafTag: {
    backgroundColor: colors.greenLight,
    borderColor: colors.greenBorder,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  leafTagText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.greenDark,
  },
  welcomeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    flexDirection: 'row',
    overflow: 'hidden',
    ...shadows.soft,
  },
  welcomeTextGroup: {
    flex: 1,
  },
  welcomeHeading: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  welcomeBody: {
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  clayAccentBar: {
    width: 4,
    backgroundColor: colors.brownPrimary,
    borderRadius: 2,
    marginLeft: spacing.sm,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    letterSpacing: 0.2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statBox: {
    flex: 1,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
    borderWidth: 1,
  },
  statBoxGreen: {
    backgroundColor: colors.greenLight,
    borderColor: colors.greenBorder,
  },
  statBoxBrown: {
    backgroundColor: colors.brownLight,
    borderColor: colors.brownBorder,
  },
  statBoxSand: {
    backgroundColor: colors.accentOat,
    borderColor: colors.border,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  statUnit: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  statHint: {
    fontSize: 10.5,
    color: colors.textMuted,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundAlt,
    borderRadius: radius.pill,
    padding: 3,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: colors.surface,
    ...shadows.soft,
  },
  tabText: {
    fontSize: 12.5,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  tabTextActive: {
    fontWeight: '700',
    color: colors.greenDark,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTag: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: colors.brownMedium,
    marginBottom: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  cardSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
    maxWidth: 220,
  },
  statusBadgeFresh: {
    backgroundColor: colors.statusFreshBg,
    borderColor: colors.statusFreshBorder,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  statusBadgeFreshText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.statusFresh,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.md,
  },
  paramGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  paramItem: {
    flex: 1,
  },
  paramLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 2,
  },
  paramValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  vendorCallout: {
    backgroundColor: colors.backgroundAlt,
    padding: spacing.sm + 2,
    borderRadius: radius.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.greenPrimary,
  },
  vendorCalloutLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 2,
  },
  vendorCalloutName: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    ...shadows.soft,
  },
  inputLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 13.5,
    color: colors.textPrimary,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  buttonPrimary: {
    flex: 1,
    backgroundColor: colors.greenPrimary,
    paddingVertical: 13,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimaryText: {
    color: colors.textInverse,
    fontSize: 13.5,
    fontWeight: '700',
  },
  buttonSecondary: {
    flex: 1,
    backgroundColor: colors.brownPrimary,
    paddingVertical: 13,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSecondaryText: {
    color: colors.textInverse,
    fontSize: 13.5,
    fontWeight: '700',
  },
  buttonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  buttonOutlineText: {
    color: colors.brownDark,
    fontSize: 13,
    fontWeight: '600',
  },
  backButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  backButtonText: {
    fontSize: 12.5,
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
  footerSpace: {
    height: 40,
  },
});
