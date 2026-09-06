import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

/**
 * Central definition of every screen and its navigation parameters.
 * Import these types into screens so `navigation.navigate(...)` is type-safe.
 */
export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  VendorDetail: { id: string };
  Batches: undefined;
  BatchDetail: { id: string };
  Alerts: undefined;
  Recommendations: undefined;
  DemandForecast: undefined;
  SpoilageRisk: undefined;
  History: undefined;
};

export type TabParamList = {
  Dashboard: undefined;
  Vendors: undefined;
  Inventory: undefined;
  Orders: undefined;
};

export type RootNavigation = NativeStackNavigationProp<RootStackParamList>;
