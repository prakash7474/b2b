import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { colors } from '../theme';

import { VendorHomeScreen } from '../screens/vendor/VendorHomeScreen';
import { VendorBatchListScreen } from '../screens/vendor/VendorBatchListScreen';
import { BatchSpoilageScreen } from '../screens/vendor/BatchSpoilageScreen';
import { VendorDemandScreen } from '../screens/vendor/VendorDemandScreen';

const BatchStackNav = createNativeStackNavigator();
const VendorBatchStack = () => (
  <BatchStackNav.Navigator screenOptions={{ headerShown: false }}>
    <BatchStackNav.Screen name="BatchList" component={VendorBatchListScreen} />
    <BatchStackNav.Screen name="BatchSpoilage" component={BatchSpoilageScreen} />
  </BatchStackNav.Navigator>
);

const Tab = createBottomTabNavigator();

export const VendorTabNavigator: React.FC = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#4ecca3',
        tabBarInactiveTintColor: '#888',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: '#e8eaed',
          paddingBottom: 4,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '700',
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={VendorHomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: () => <Text style={{ fontSize: 13, fontWeight: '700', color: colors.inkCharcoal }}>H</Text>,
        }}
      />
      <Tab.Screen
        name="My Batches"
        component={VendorBatchStack}
        options={{
          tabBarLabel: 'My Batches',
          tabBarIcon: () => <Text style={{ fontSize: 13, fontWeight: '700', color: colors.inkCharcoal }}>B</Text>,
        }}
      />
      <Tab.Screen
        name="Spoilage Check"
        component={BatchSpoilageScreen}
        options={{
          tabBarLabel: 'Spoilage Check',
          tabBarIcon: () => <Text style={{ fontSize: 13, fontWeight: '700', color: colors.inkCharcoal }}>S</Text>,
        }}
      />
      <Tab.Screen
        name="Demand Forecast"
        component={VendorDemandScreen}
        options={{
          tabBarLabel: 'Demand Forecast',
          tabBarIcon: () => <Text style={{ fontSize: 13, fontWeight: '700', color: colors.inkCharcoal }}>D</Text>,
        }}
      />
    </Tab.Navigator>
  );
};
