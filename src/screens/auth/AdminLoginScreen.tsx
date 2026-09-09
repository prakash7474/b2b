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
import { colors, radius, shadows, spacing } from '../../theme';

export const AdminLoginScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const { loginAdmin, isLoading, error, clearError } = useAuthStore();

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) return;
    await loginAdmin(username.trim(), password);
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
                <Text style={styles.tagBadgeText}>ADMINISTRATION</Text>
              </View>
            </View>
            <Text style={styles.headerTitle}>Admin Sign In</Text>
            <Text style={styles.headerSubtitle}>
              Platform operations, batter batching, partner dispatch & ML inference
            </Text>
          </View>

          <View style={styles.card}>
            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.formGroup}>
              <Text style={styles.label}>Admin Username</Text>
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={(val) => {
                  setUsername(val);
                  if (error) clearError();
                }}
                placeholder="Enter admin username"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={(val) => {
                  setPassword(val);
                  if (error) clearError();
                }}
                placeholder="Enter password"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            <TouchableOpacity
              style={[styles.loginBtn, isLoading && styles.loginBtnDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.textInverse} size="small" />
              ) : (
                <Text style={styles.loginBtnText}>Sign In as Platform Admin</Text>
              )}
            </TouchableOpacity>

            <View style={styles.hintBox}>
              <Text style={styles.hintLabel}>Default Demo Access</Text>
              <Text style={styles.hintCode}>admin / admin123</Text>
            </View>

            <TouchableOpacity
              onPress={() => navigation.navigate('VendorLogin')}
              style={styles.switchButton}
              activeOpacity={0.7}
            >
              <Text style={styles.switchText}>
                Are you a retail vendor? <Text style={styles.switchTextBold}>Partner Portal →</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

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
  },
  header: {
    marginBottom: spacing.lg,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: spacing.md,
  },
  backButtonText: {
    color: colors.brownPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  badgeRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  tagBadge: {
    backgroundColor: colors.brownLight,
    borderWidth: 1,
    borderColor: colors.brownBorder,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  tagBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.brownPrimary,
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  headerSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 6,
    lineHeight: 20,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.card,
  },
  errorBox: {
    backgroundColor: colors.statusAttentionBg,
    borderWidth: 1,
    borderColor: colors.statusAttentionBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    color: colors.statusAttention,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  formGroup: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
  },
  loginBtn: {
    backgroundColor: colors.greenPrimary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.sm,
    ...shadows.soft,
  },
  loginBtnDisabled: {
    opacity: 0.6,
  },
  loginBtnText: {
    color: colors.textInverse,
    fontSize: 15,
    fontWeight: '700',
  },
  hintBox: {
    marginTop: spacing.lg,
    padding: spacing.sm + 4,
    backgroundColor: colors.backgroundAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
  },
  hintLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
  },
  hintCode: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.brownPrimary,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  switchButton: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  switchText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  switchTextBold: {
    color: colors.brownPrimary,
    fontWeight: '700',
  },
});
