// ════════════════════════════════════════════════════════════════════════════
// 📌 AUTHENTICATION NAVIGATION STACK (src/navigation/AuthStack.tsx)
// ════════════════════════════════════════════════════════════════════════════
// 💡 WHAT THIS FILE DOES (EXPLAIN THIS TO THE INSTRUCTOR):
//    Manages the authentication workflow screens before a user logs in.
//    Uses a Stack Navigator (LIFO screen stacking) to transition between:
//
//    1. "RoleSelect": The landing portal where user picks "Central Kitchen Admin"
//                     or "Partner Shop / Vendor".
//    2. "AdminLogin": Password authentication screen for the Central Kitchen Admin.
//    3. "VendorLogin": Outlet picker & PIN/code login screen for shop vendors.
//
// 👉 HOW TO CHANGE INITIAL SCREEN:
//    - Look at `initialRouteName="RoleSelect"` on `<Stack.Navigator>`.
//    - If you want the app to open directly on AdminLogin or VendorLogin,
//      change `initialRouteName` to "AdminLogin" or "VendorLogin".
// ════════════════════════════════════════════════════════════════════════════

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// ── Auth Screen Components ──────────────────────────────────────────────────
import { RoleSelectScreen } from '../screens/auth/RoleSelectScreen';
import { AdminLoginScreen } from '../screens/auth/AdminLoginScreen';
import { VendorLoginScreen } from '../screens/auth/VendorLoginScreen';

// TypeScript parameter list for type-safe route navigation
export type AuthStackParamList = {
  RoleSelect: undefined;  // Landing screen (choose admin or vendor)
  AdminLogin: undefined;  // Admin login screen
  VendorLogin: undefined; // Vendor shop selection & login
};

// Create the Native Stack Navigator instance
const Stack = createNativeStackNavigator<AuthStackParamList>();

export const AuthStack: React.FC = () => {
  return (
    <Stack.Navigator
      initialRouteName="RoleSelect"
      screenOptions={{
        headerShown: false, // We use custom header bars inside each screen
      }}
    >
      {/* Step 1: Role Selection Portal */}
      <Stack.Screen name="RoleSelect" component={RoleSelectScreen} />

      {/* Step 2A: Admin Login Form */}
      <Stack.Screen name="AdminLogin" component={AdminLoginScreen} />

      {/* Step 2B: Vendor Outlet Selection & Login Form */}
      <Stack.Screen name="VendorLogin" component={VendorLoginScreen} />
    </Stack.Navigator>
  );
};

