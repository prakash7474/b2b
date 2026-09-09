import React from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { AdminTabNavigator } from './AdminTabNavigator';
import { VendorTabNavigator } from './VendorTabNavigator';
import { AuthStack } from './AuthStack';

export const RoleRouter: React.FC = () => {
  const { isAuthenticated, role, isLoading } = useAuthStore();

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

  if (!isAuthenticated) {
    return <AuthStack />;
  }

  if (role === 'admin') {
    return <AdminTabNavigator />;
  }

  if (role === 'vendor') {
    return <VendorTabNavigator />;
  }

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
