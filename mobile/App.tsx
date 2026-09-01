import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './src/types';
import UploadScreen from './src/screens/UploadScreen';
import ProcessingScreen from './src/screens/ProcessingScreen';
import ResultsScreen from './src/screens/ResultsScreen';
import PreviewScreen from './src/screens/PreviewScreen';
import BrandKitScreen from './src/screens/BrandKitScreen';
import CalendarScreen from './src/screens/CalendarScreen';
import PersonasScreen from './src/screens/PersonasScreen';
import AnalyticsScreen from './src/screens/AnalyticsScreen';
import { colors } from './src/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerTintColor: colors.textPrimary,
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="Upload" component={UploadScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Processing" component={ProcessingScreen} options={{ title: 'Processing' }} />
        <Stack.Screen name="Results" component={ResultsScreen} options={{ title: 'Your Content' }} />
        <Stack.Screen name="Preview" component={PreviewScreen} options={{ title: 'Preview' }} />
        <Stack.Screen name="BrandKit" component={BrandKitScreen} options={{ title: 'Brand Kit' }} />
        <Stack.Screen name="Calendar" component={CalendarScreen} options={{ title: 'Calendar' }} />
        <Stack.Screen name="Personas" component={PersonasScreen} options={{ title: 'Voice' }} />
        <Stack.Screen name="Analytics" component={AnalyticsScreen} options={{ title: 'Analytics' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
