import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { colors, typography } from '../theme';

import { VendorHomeScreen } from '../screens/vendor/VendorHomeScreen';
import { VendorBatchListScreen } from '../screens/vendor/VendorBatchListScreen';
import { VendorDemandScreen } from '../screens/vendor/VendorDemandScreen';

const Tab = createBottomTabNavigator();

export const VendorTabNavigator: React.FC = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.clayTerracotta,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 1.5,
          borderTopColor: colors.inkCharcoal,
          paddingBottom: 4,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '800',
          fontFamily: typography.body,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={VendorHomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 13, fontWeight: '900', color }}>H</Text>
          ),
        }}
      />
      <Tab.Screen
        name="My Batches"
        component={VendorBatchListScreen}
        options={{
          tabBarLabel: 'My Batches',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 13, fontWeight: '900', color }}>B</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Demand Forecast"
        component={VendorDemandScreen}
        options={{
          tabBarLabel: 'Demand Forecast',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 13, fontWeight: '900', color }}>D</Text>
          ),
        }}
      />
    </Tab.Navigator>
  );
};
