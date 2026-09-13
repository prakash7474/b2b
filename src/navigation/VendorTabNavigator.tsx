// ════════════════════════════════════════════════════════════════════════════
// 📌 VENDOR TAB NAVIGATOR (src/navigation/VendorTabNavigator.tsx)
// ════════════════════════════════════════════════════════════════════════════
// 💡 WHAT THIS FILE DOES (EXPLAIN THIS TO THE INSTRUCTOR):
//    Creates the bottom navigation bar specifically for the VENDOR portal.
//    When a shop vendor logs in (e.g. Anandha Bhavan, Murugan Idli Shop),
//    they see this bottom bar with 3 simple, essential tabs:
//
//    1. "Home": Vendor's live dashboard showing current store stock (in kg),
//               stockout warnings, restock recommendation, and restock order buttons.
//    2. "My Batches": The digital delivery ledger where vendor views incoming batches,
//                     clicks "Confirm Receipt" upon delivery, or reports batch issues.
//    3. "Demand Forecast": AI machine-learning demand prediction showing expected
//                          kg requirements for the day so vendor never runs out.
//
// 👉 HOW TO RENAME A TAB OR ADD A NEW TAB:
//    - Look at `<Tab.Screen>` definitions below.
//    - Change `tabBarLabel: 'New Name'` to change the label text under the icon.
//    - To add a tab, add another `<Tab.Screen name="..." component={...} />`.
// ════════════════════════════════════════════════════════════════════════════

import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

// ── Ledger Theme Palette ────────────────────────────────────────────────────
// Uses traditional South Indian ledger colors (clay terracotta, ink charcoal)
import { colors, typography } from '../theme';

// ── Screen Components ───────────────────────────────────────────────────────
import { VendorHomeScreen } from '../screens/vendor/VendorHomeScreen';
import { VendorBatchListScreen } from '../screens/vendor/VendorBatchListScreen';
import { VendorDemandScreen } from '../screens/vendor/VendorDemandScreen';

// Initialize React Navigation Bottom Tab Navigator
const Tab = createBottomTabNavigator();

export const VendorTabNavigator: React.FC = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false, // Custom header is rendered inside screens
        tabBarActiveTintColor: colors.clayTerracotta, // Active tab gets highlighted in terracotta
        tabBarInactiveTintColor: colors.textMuted,   // Inactive tabs stay muted gray-brown
        tabBarStyle: {
          backgroundColor: colors.surface,            // Cream/paper-white bar background
          borderTopWidth: 1.5,                        // Authentic crisp ink border
          borderTopColor: colors.inkCharcoal,
          paddingBottom: 4,
          height: 60,                                 // Comfortable height for touch targets
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '800',
          fontFamily: typography.body,
        },
      }}
    >
      {/* ── TAB 1: VENDOR HOME & STORE STOCK DASHBOARD ────────────────── */}
      {/* Shows current stock, low stock alert, restock button */}
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

      {/* ── TAB 2: MY BATCHES & DELIVERY LEDGER ───────────────────────── */}
      {/* Shows batches assigned to vendor, 'Confirm Receipt' button, & incident reporting */}
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

      {/* ── TAB 3: AI DEMAND PREDICTION ──────────────────────────────── */}
      {/* Runs ML inference to forecast today's batter demand in kg */}
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

