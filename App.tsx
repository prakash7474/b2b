// ════════════════════════════════════════════════════════════════════════════
// 📌 ROOT APPLICATION COMPONENT (App.tsx)
// WHAT THIS DOES:
//   1. Initializes the React Native application.
//   2. Checks for stored session tokens on app startup (auto-login).
//   3. Wraps the app in NavigationContainer and ErrorBoundary.
//   4. Mounts RootNavigator (which switches between Auth, Admin, and Vendor screens).
// ════════════════════════════════════════════════════════════════════════════

import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useAuthStore } from './src/store/authStore';
import { ErrorBoundary } from './src/components/ErrorBoundary';

export default function App() {
  // Check if user is already logged in from previous session
  const checkAuth = useAuthStore((state) => state.checkAuth);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    // ErrorBoundary prevents white-screen crashes by showing friendly ledger error UI
    <ErrorBoundary>
      <SafeAreaProvider>
        <NavigationContainer>
          <StatusBar barStyle="light-content" />
          {/* RootNavigator handles role-based routing (Admin vs Vendor vs Login) */}
          <RootNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
