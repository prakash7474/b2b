import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RoleRouter } from './RoleRouter';

export type RootStackParamList = {
  Main: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export const RootNavigator: React.FC = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={RoleRouter} />
    </Stack.Navigator>
  );
};
