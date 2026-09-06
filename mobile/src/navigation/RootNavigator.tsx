import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from './types';
import LoginScreen from '../screens/LoginScreen';
import MainTabs from './MainTabs';
import VendorDetailScreen from '../screens/VendorDetailScreen';
import BatchesScreen from '../screens/BatchesScreen';
import BatchDetailScreen from '../screens/BatchDetailScreen';
import AlertsScreen from '../screens/AlertsScreen';
import RecommendationsScreen from '../screens/RecommendationsScreen';
import DemandForecastScreen from '../screens/DemandForecastScreen';
import SpoilageRiskScreen from '../screens/SpoilageRiskScreen';
import HistoryScreen from '../screens/HistoryScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#4A90D9" />
      </SafeAreaView>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      {!user ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : (
        <>
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen name="VendorDetail" component={VendorDetailScreen} />
          <Stack.Screen name="Batches" component={BatchesScreen} />
          <Stack.Screen name="BatchDetail" component={BatchDetailScreen} />
          <Stack.Screen name="Alerts" component={AlertsScreen} />
          <Stack.Screen name="Recommendations" component={RecommendationsScreen} />
          <Stack.Screen name="DemandForecast" component={DemandForecastScreen} />
          <Stack.Screen name="SpoilageRisk" component={SpoilageRiskScreen} />
          <Stack.Screen name="History" component={HistoryScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}
