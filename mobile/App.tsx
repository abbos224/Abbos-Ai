import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './src/types';
import UploadScreen from './src/screens/UploadScreen';
import ProcessingScreen from './src/screens/ProcessingScreen';
import ResultsScreen from './src/screens/ResultsScreen';
import PreviewScreen from './src/screens/PreviewScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: '#0B0B0F' }, headerTintColor: '#fff' }}>
        <Stack.Screen name="Upload" component={UploadScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Processing" component={ProcessingScreen} options={{ title: 'Processing' }} />
        <Stack.Screen name="Results" component={ResultsScreen} options={{ title: 'Your Content' }} />
        <Stack.Screen name="Preview" component={PreviewScreen} options={{ title: 'Preview' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
