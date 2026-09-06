import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { TabParamList } from './types';
import DashboardScreen from '../screens/DashboardScreen';
import VendorsScreen from '../screens/VendorsScreen';
import InventoryScreen from '../screens/InventoryScreen';
import OrdersScreen from '../screens/OrdersScreen';
import MoreScreen from '../screens/MoreScreen';

const Tab = createBottomTabNavigator<TabParamList>();

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false, tabBarActiveTintColor: '#4A90D9' }}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: '🏠 Home' }} />
      <Tab.Screen name="Vendors" component={VendorsScreen} options={{ title: '🏪 Vendors' }} />
      <Tab.Screen name="Inventory" component={InventoryScreen} options={{ title: '📋 Stock' }} />
      <Tab.Screen name="Orders" component={OrdersScreen} options={{ title: '🛒 Orders' }} />
      <Tab.Screen name="More" component={MoreScreen} options={{ title: '☰ More' }} />
    </Tab.Navigator>
  );
}
