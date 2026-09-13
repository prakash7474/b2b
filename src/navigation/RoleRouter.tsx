// ════════════════════════════════════════════════════════════════════════════
// 📌 ROLE ROUTER COMPONENT (src/navigation/RoleRouter.tsx)
// ════════════════════════════════════════════════════════════════════════════
// 💡 WHAT THIS FILE DOES (EXPLAIN THIS TO THE INSTRUCTOR):
//    This is the "Traffic Police" of the entire frontend app!
//    It looks at who is logged in and decides which screen they see:
//
//    Case 1: Still checking saved login? ➔ Shows a loading spinner.
//    Case 2: Not logged in?              ➔ Shows the Login screens (AuthStack).
//    Case 3: Logged in as "Admin"?       ➔ Opens the Admin Dashboard & Tabs.
//    Case 4: Logged in as "Vendor"?      ➔ Opens the Vendor Shop Dashboard & Tabs.
//
// 🎯 KEY CONCEPTS USED:
//    - `useAuthStore()`: Reads the user's role ('admin' or 'vendor') from Zustand global state.
//    - Conditional Rendering: Returns different components based on `if (role === ...)`
// ════════════════════════════════════════════════════════════════════════════

import React from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { AdminTabNavigator } from './AdminTabNavigator';
import { VendorTabNavigator } from './VendorTabNavigator';
import { AuthStack } from './AuthStack';

export const RoleRouter: React.FC = () => {
  // ── Step 1: Read auth state from global memory (Zustand Store) ────────────
  // isAuthenticated: true if user has logged in
  // role: 'admin' (central kitchen manager) or 'vendor' (shopkeeper)
  // isLoading: true while reading stored tokens from device storage
  const { isAuthenticated, role, isLoading } = useAuthStore();

  // ── Step 2: Show loading splash screen while verifying login session ──────
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.logoText}>
          B2P <Text style={styles.accentText}>Platform</Text>
        </Text>
        <ActivityIndicator size="large" color="#4ecca3" style={{ marginTop: 24 }} />
        <Text style={styles.loadingText}>Initializing system session...</Text>
      </View>
    );
  }

  // ── Step 3: If user is not logged in, redirect them to Login Screens ──────
  if (!isAuthenticated) {
    return <AuthStack />;
  }

  // ── Step 4: If logged in as ADMIN, open the Central Kitchen Admin Portal ──
  if (role === 'admin') {
    return <AdminTabNavigator />;
  }

  // ── Step 5: If logged in as VENDOR, open the Partner Shop Vendor Portal ───
  if (role === 'vendor') {
    return <VendorTabNavigator />;
  }

  // Fallback: Default to AuthStack if role is unrecognized
  return <AuthStack />;
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  logoText: {
    fontSize: 36,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  accentText: {
    color: '#4ecca3',
  },
  loadingText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
    marginTop: 12,
  },
});
