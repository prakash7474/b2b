// ════════════════════════════════════════════════════════════════════════════
// 📌 VENDOR LOGIN SCREEN (src/screens/auth/VendorLoginScreen.tsx)
// ════════════════════════════════════════════════════════════════════════════
// 💡 WHAT THIS FILE DOES (EXPLAIN THIS TO THE INSTRUCTOR):
//    Provides the sign-in form for Partner Restaurant Outlets & Vendors.
//    - Vendors log in using their unique Vendor Identification Code (e.g., 'V100').
//    - Pre-filled with demo vendor: `V100` (Lakshmi Idli Kadai).
//    - On submit, calls `authStore.loginVendor(vendorId)`.
//    - The backend checks MongoDB collection `vendors` for this ID.
//    - If found, returns a vendor session token, and `RoleRouter` switches
//      the display to `VendorTabNavigator` (Home, Batches, Forecast).
//    - If not found, shows an error message: "Vendor not found".
//
// 👉 HOW TO CHANGE DEFAULT VENDOR ID:
//    - Look at line ~33: `const [vendorId, setVendorId] = useState('V100');`
//    - Change `'V100'` to any registered vendor ID, such as `'V101'`, `'V102'`, or `'V104'`.
// ════════════════════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/AuthStack';
import { useAuthStore } from '../../store/authStore';
import { colors, radius, spacing, typography } from '../../theme';

export const VendorLoginScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();

  // ── Pull auth methods from Zustand Store ──────────────────────────────────
  const { loginVendor, isLoading, error, clearError } = useAuthStore();

  // ── Vendor ID Input State (Pre-filled with demo code V100) ────────────────
  const [vendorId, setVendorId] = useState('V100');

  // ── Form Submit Handler ───────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!vendorId.trim()) return;
    await loginVendor(vendorId.trim());
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.container}>
            {/* ── Screen Header ────────────────────────────────────────────── */}
            <View style={styles.header}>
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                style={styles.backButton}
                activeOpacity={0.7}
              >
                <Text style={styles.backButtonText}>← Portals</Text>
              </TouchableOpacity>
              <View style={styles.badgeRow}>
                <View style={styles.tagBadge}>
                  <Text style={styles.tagBadgeText}>RETAIL PARTNER</Text>
                </View>
              </View>
              <Text style={styles.headerTitle}>Vendor Sign In</Text>
              <Text style={styles.headerSubtitle}>
                Manage batch deliveries, confirm store intake & view AI demand forecasts
              </Text>
            </View>

            {/* ── Ledger Login Card ────────────────────────────────────────── */}
            <View style={styles.card}>
              {/* Error Box if vendor ID is invalid */}
              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              {/* Vendor ID Input Field */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Vendor Identification Code</Text>
                <TextInput
                  style={styles.input}
                  value={vendorId}
                  onChangeText={(val) => {
                    setVendorId(val);
                    if (error) clearError();
                  }}
                  placeholder="e.g. V100"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
              </View>

              {/* Sign In Button */}
              <TouchableOpacity
                style={[styles.loginBtn, isLoading && styles.loginBtnDisabled]}
                onPress={handleLogin}
                disabled={isLoading}
                activeOpacity={0.85}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <Text style={styles.loginBtnText}>Sign In as Vendor →</Text>
                )}
              </TouchableOpacity>

              {/* Sample Hint Box Showing Valid Demo IDs */}
              <View style={styles.hintBox}>
                <Text style={styles.hintText}>Active Retail Partner IDs:</Text>
                <Text style={styles.hintCode}>V100 (Lakshmi Idli) • V101 • V102 • V104</Text>
              </View>

              {/* Link to Admin Login */}
              <TouchableOpacity
                onPress={() => navigation.navigate('AdminLogin')}
                style={styles.switchButton}
                activeOpacity={0.7}
              >
                <Text style={styles.switchText}>
                  Kitchen manager or administrator?{' '}
                  <Text style={styles.switchTextBold}>Sign in here →</Text>
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// ── Stylesheet ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '100%',
    maxWidth: 480,
  },
  header: {
    marginBottom: spacing.lg,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: spacing.md,
  },
  backButtonText: {
    color: colors.clayTerracotta,
    fontSize: 13,
    fontWeight: '700',
  },
  badgeRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  tagBadge: {
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  tagBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.clayTerracotta,
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
    fontFamily: typography.heading,
    marginTop: spacing.xs,
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 6,
    lineHeight: 18,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderTopWidth: 3.5,
    borderColor: colors.borderStrong,
  },
  errorBox: {
    backgroundColor: colors.dangerBg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.rustRed,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    color: colors.rustRed,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  formGroup: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.inkCharcoal,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.inkCharcoal,
    fontWeight: '700',
    fontFamily: typography.mono,
  },
  loginBtn: {
    backgroundColor: colors.clayTerracotta,
    borderRadius: radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
    marginTop: spacing.xs,
  },
  loginBtnDisabled: {
    opacity: 0.6,
  },
  loginBtnText: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  hintBox: {
    marginTop: spacing.md,
    padding: spacing.sm + 2,
    backgroundColor: colors.backgroundAlt,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
  },
  hintText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  hintCode: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.inkCharcoal,
    fontFamily: typography.mono,
    marginTop: 2,
  },
  switchButton: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  switchText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  switchTextBold: {
    color: colors.clayTerracotta,
    fontWeight: '800',
  },
});

