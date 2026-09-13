// ════════════════════════════════════════════════════════════════════════════
// 📌 ADMIN TAB NAVIGATOR (src/navigation/AdminTabNavigator.tsx)
// ════════════════════════════════════════════════════════════════════════════
// 💡 WHAT THIS FILE DOES (EXPLAIN THIS TO THE INSTRUCTOR):
//    Creates the main navigation menu bar for the Admin portal.
//    Contains the 5 main administrative tabs:
//
//    1. "Dashboard": Overview of daily produced batter, fleet stats, restock orders.
//    2. "Vendors"  : Directory of all partner idli/dosa shops (status, phone, address).
//    3. "Batches"  : Central kitchen batch registry (manufacture, assign, track batches).
//    4. "Stock"    : Stock ledger (view outlet inventory, add batches, remove batches checklist, AI predictions).
//    5. "Logs"     : Audit trail of every single system event, stock movement, and alert.
//
// 👉 HOW TO CHANGE TAB NAMES OR ADD A TAB:
//    - Look at the `navItems` array below (around line 45).
//    - To change a tab's label: edit `label: '...'`.
// ════════════════════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { colors, radius, typography, spacing } from '../theme';
import { useAuthStore } from '../store/authStore';
import { ConfirmDialog } from '../components/ledger';

// ── Import the 5 Core Admin Screens ─────────────────────────────────────────
import { AdminDashboardScreen } from '../screens/admin/AdminDashboardScreen';
import { VendorListScreen } from '../screens/admin/VendorListScreen';
import { BatchListScreen } from '../screens/admin/BatchListScreen';
import { InventoryListScreen } from '../screens/admin/InventoryListScreen';
import { LogsScreen } from '../screens/admin/LogsScreen';

const Tab = createBottomTabNavigator();

interface CustomTabBarProps {
  state: any;
  descriptors: any;
  navigation: any;
}

// ── Custom Ledger-Themed Tab Bar ────────────────────────────────────────────
// Styled with traditional ink borders and terracotta accents
const LedgerTabBar: React.FC<CustomTabBarProps> = ({ state, descriptors, navigation }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const { logout } = useAuthStore();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // ── List of Navigation Tabs ───────────────────────────────────────────────
  // 👉 CHANGE HERE IF ASKED TO RENAME TABS:
  const navItems = [
    { name: 'Dashboard', label: 'Dashboard' },
    { name: 'Vendors',   label: 'Vendors' },
    { name: 'Batches',   label: 'Batches' },
    { name: 'Stock',     label: 'Stock' },
    { name: 'Logs',      label: 'Logs' },
  ];

  return (
    <View style={styles.navBarWrapper}>
      <View style={styles.navBarContainer}>
        {/* Top Header Identity */}
        <View style={styles.topHeader}>
          <View style={styles.brandGroup}>
            <Text style={styles.brandTitle}>B2P</Text>
            <Text style={styles.brandSeparator}>|</Text>
            <Text style={styles.brandSub}>CENTRAL KITCHEN & LOGISTICS LEDGER</Text>
          </View>
          <View style={styles.adminBadge}>
            <Text style={styles.adminBadgeText}>ADMIN CONSOLE</Text>
          </View>
        </View>

        {/* 6-Item Persistent Navigation Row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabRow}
        >
          {navItems.map((item, index) => {
            const isFocused = state.index === index;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: state.routes[index].key,
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(item.name);
              }
            };

            return (
              <TouchableOpacity
                key={item.name}
                style={[
                  styles.tabButton,
                  isFocused && styles.tabButtonActive,
                  isMobile && styles.tabButtonMobile,
                ]}
                onPress={onPress}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    isFocused && styles.tabLabelActive,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}

          {/* Vertical Rule Separator */}
          <View style={styles.navSeparator} />

          {/* Pinned Logout Action (6th item) */}
          <TouchableOpacity
            style={[styles.tabButton, styles.logoutButton, isMobile && styles.tabButtonMobile]}
            onPress={() => setShowLogoutConfirm(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.logoutLabel}>Logout</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Confirmation Dialog on Logout */}
      <ConfirmDialog
        visible={showLogoutConfirm}
        title="Confirm Logout"
        message="Log out of the B2P admin panel? Your session will be cleared."
        confirmLabel="Log Out"
        cancelLabel="Stay Logged In"
        isDestructive
        onConfirm={() => {
          setShowLogoutConfirm(false);
          logout();
        }}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </View>
  );
};

export const AdminTabNavigator: React.FC = () => {
  return (
    <Tab.Navigator
      tabBar={(props) => <LedgerTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen name="Dashboard" component={AdminDashboardScreen} />
      <Tab.Screen name="Vendors" component={VendorListScreen} />
      <Tab.Screen name="Batches" component={BatchListScreen} />
      <Tab.Screen name="Stock" component={InventoryListScreen} />
      <Tab.Screen name="Logs" component={LogsScreen} />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  navBarWrapper: {
    backgroundColor: colors.batterCream,
    borderBottomWidth: 2,
    borderBottomColor: colors.inkCharcoal,
  },
  navBarContainer: {
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 6,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.clayTerracotta,
    fontFamily: typography.mono,
    letterSpacing: 1,
  },
  brandSeparator: {
    marginHorizontal: 8,
    color: colors.borderLight,
    fontWeight: '300',
  },
  brandSub: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.inkCharcoal,
    fontFamily: typography.mono,
    letterSpacing: 0.8,
  },
  adminBadge: {
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.inkCharcoal,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  adminBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: colors.inkCharcoal,
    fontFamily: typography.mono,
    letterSpacing: 0.6,
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  tabButton: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: radius.sm,
    backgroundColor: colors.paperWhite,
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 34,
  },
  tabButtonMobile: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    minHeight: 32,
  },
  tabButtonActive: {
    backgroundColor: colors.clayTerracotta,
    borderColor: colors.inkCharcoal,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inkCharcoal,
    letterSpacing: 0.3,
  },
  tabLabelActive: {
    color: colors.paperWhite,
  },
  navSeparator: {
    width: 1.5,
    height: 22,
    backgroundColor: colors.inkCharcoal,
    marginHorizontal: 4,
  },
  logoutButton: {
    backgroundColor: colors.backgroundAlt,
    borderColor: colors.inkCharcoal,
  },
  logoutLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.rustRed,
    letterSpacing: 0.3,
  },
});
