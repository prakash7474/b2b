import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RoleSelectScreen } from '../screens/auth/RoleSelectScreen';
import { AdminLoginScreen } from '../screens/auth/AdminLoginScreen';
import { VendorLoginScreen } from '../screens/auth/VendorLoginScreen';

export type AuthStackParamList = {
  RoleSelect: undefined;
  AdminLogin: undefined;
  VendorLogin: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export const AuthStack: React.FC = () => {
  return (
    <Stack.Navigator
      initialRouteName="RoleSelect"
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="RoleSelect" component={RoleSelectScreen} />
      <Stack.Screen name="AdminLogin" component={AdminLoginScreen} />
      <Stack.Screen name="VendorLogin" component={VendorLoginScreen} />
    </Stack.Navigator>
  );
};
