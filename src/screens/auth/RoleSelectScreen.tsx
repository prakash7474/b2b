import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/AuthStack';
import { colors, radius, shadows, spacing } from '../../theme';

export const RoleSelectScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.headerCard}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoBadgeText}>TRADITIONAL CRAFT & MODERN ML</Text>
          </View>
          <Text style={styles.logoTitle}>
            Batter <Text style={styles.accentText}>to Platter</Text>
          </Text>
          <Text style={styles.logoSubtitle}>
            Freshness preservation & intelligent dispatch optimization
          </Text>
        </View>

        <View style={styles.content}>
          <Text style={styles.promptText}>Select your workspace portal:</Text>

          <TouchableOpacity
            style={[styles.roleCard, styles.adminCard]}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('AdminLogin')}
          >
            <View style={[styles.iconCircle, styles.adminIconCircle]}>
              <Text style={styles.iconText}>A</Text>
            </View>
            <View style={styles.roleTextContainer}>
              <View style={styles.titleRow}>
                <Text style={styles.roleTitle}>Admin Portal</Text>
                <View style={styles.roleBadge}>
                  <Text style={styles.roleBadgeText}>Management</Text>
                </View>
              </View>
              <Text style={styles.roleDesc}>
                Manage vendors, create batches, monitor warehouse stock & ML predictions
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.roleCard, styles.vendorCard]}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('VendorLogin')}
          >
            <View style={[styles.iconCircle, styles.vendorIconCircle]}>
              <Text style={styles.iconText}>V</Text>
            </View>
            <View style={styles.roleTextContainer}>
              <View style={styles.titleRow}>
                <Text style={styles.roleTitle}>Vendor Portal</Text>
                <View style={[styles.roleBadge, styles.vendorRoleBadge]}>
                  <Text style={[styles.roleBadgeText, styles.vendorRoleBadgeText]}>Retail Partner</Text>
                </View>
              </View>
              <Text style={styles.roleDesc}>
                Acknowledge batch deliveries, track shelf life & evaluate ML spoilage risk
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>B2P Platform • Fresh Batter Supply Chain</Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  headerCard: {
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  logoBadge: {
    backgroundColor: colors.brownLight,
    borderWidth: 1,
    borderColor: colors.brownBorder,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginBottom: spacing.sm,
  },
  logoBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.brownPrimary,
    letterSpacing: 0.8,
  },
  logoTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: 0.2,
  },
  accentText: {
    color: colors.greenPrimary,
  },
  logoSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 6,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 18,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  promptText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.brownMedium,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md + 2,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.card,
  },
  adminCard: {
    borderLeftWidth: 4,
    borderLeftColor: colors.brownPrimary,
  },
  vendorCard: {
    borderLeftWidth: 4,
    borderLeftColor: colors.greenPrimary,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  adminIconCircle: {
    backgroundColor: colors.brownLight,
  },
  vendorIconCircle: {
    backgroundColor: colors.greenLight,
  },
  iconText: {
    fontSize: 22,
  },
  roleTextContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  roleTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  roleBadge: {
    backgroundColor: colors.brownLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.brownPrimary,
  },
  vendorRoleBadge: {
    backgroundColor: colors.greenLight,
  },
  vendorRoleBadgeText: {
    color: colors.greenDark,
  },
  roleDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 16,
  },
  chevron: {
    fontSize: 24,
    color: colors.borderStrong,
    marginLeft: spacing.sm,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  footerText: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
