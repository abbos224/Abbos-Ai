import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackParamList } from './src/types';
import { AuthProvider, useAuth } from './src/AuthContext';
import { LanguageProvider, useI18n } from './src/i18n/LanguageContext';
import UploadScreen from './src/screens/UploadScreen';
import ProcessingScreen from './src/screens/ProcessingScreen';
import ResultsScreen from './src/screens/ResultsScreen';
import PreviewScreen from './src/screens/PreviewScreen';
import EditCaptionsScreen from './src/screens/EditCaptionsScreen';
import BrandKitScreen from './src/screens/BrandKitScreen';
import CalendarScreen from './src/screens/CalendarScreen';
import PersonasScreen from './src/screens/PersonasScreen';
import AnalyticsScreen from './src/screens/AnalyticsScreen';
import VideoAnalyticsScreen from './src/screens/VideoAnalyticsScreen';
import LoginScreen from './src/screens/LoginScreen';
import SignUpScreen from './src/screens/SignUpScreen';
import ProjectsScreen from './src/screens/ProjectsScreen';
import MenuScreen from './src/screens/MenuScreen';
import IdeaGeneratorScreen from './src/screens/IdeaGeneratorScreen';
import IdeaResultsScreen from './src/screens/IdeaResultsScreen';
import ImageGeneratorScreen from './src/screens/ImageGeneratorScreen';
import ImageResultScreen from './src/screens/ImageResultScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import ResetPasswordScreen from './src/screens/ResetPasswordScreen';
import VerifyEmailScreen from './src/screens/VerifyEmailScreen';
import { colors } from './src/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

const stackScreenOptions: NativeStackNavigationOptions = {
  headerStyle: { backgroundColor: colors.background },
  headerShadowVisible: false,
  headerTintColor: colors.textPrimary,
  headerTitleStyle: { fontWeight: '600' },
  contentStyle: { backgroundColor: colors.background },
};

// Each bottom tab owns its own stack so it can push detail screens (Preview, Results, ...) while
// keeping its own back-history — a screen like Preview is registered in more than one of these
// stacks on purpose (React Navigation supports the same component mounted in several navigators),
// so no shared/composite param-list typing is needed beyond the single existing RootStackParamList.

function CreateStack() {
  const { t } = useI18n();
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="Upload" component={UploadScreen} options={{ headerShown: false, title: t('nav.upload') }} />
      <Stack.Screen name="Processing" component={ProcessingScreen} options={{ title: t('nav.processing') }} />
      <Stack.Screen name="Results" component={ResultsScreen} options={{ title: t('nav.results') }} />
      <Stack.Screen name="Preview" component={PreviewScreen} options={{ title: t('nav.preview') }} />
      <Stack.Screen name="EditCaptions" component={EditCaptionsScreen} options={{ title: t('nav.editCaptions') }} />
      <Stack.Screen name="IdeaGenerator" component={IdeaGeneratorScreen} options={{ title: t('nav.ideaGenerator') }} />
      <Stack.Screen name="IdeaResults" component={IdeaResultsScreen} options={{ title: t('nav.ideaResults') }} />
      <Stack.Screen name="ImageGenerator" component={ImageGeneratorScreen} options={{ title: t('nav.imageGenerator') }} />
      <Stack.Screen name="ImageResult" component={ImageResultScreen} options={{ title: t('nav.imageResult') }} />
      {/* Also registered in MenuStack — reachable here from the Create tab's tools grid. */}
      <Stack.Screen name="BrandKit" component={BrandKitScreen} options={{ title: t('nav.brandKit') }} />
      <Stack.Screen name="Personas" component={PersonasScreen} options={{ title: t('nav.voice') }} />
    </Stack.Navigator>
  );
}

function ProjectsStack() {
  const { t } = useI18n();
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="Projects" component={ProjectsScreen} options={{ headerShown: false, title: t('tab.projects') }} />
      <Stack.Screen name="Results" component={ResultsScreen} options={{ title: t('nav.results') }} />
      <Stack.Screen name="Preview" component={PreviewScreen} options={{ title: t('nav.preview') }} />
      <Stack.Screen name="EditCaptions" component={EditCaptionsScreen} options={{ title: t('nav.editCaptions') }} />
    </Stack.Navigator>
  );
}

function CalendarStack() {
  const { t } = useI18n();
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="Calendar" component={CalendarScreen} options={{ headerShown: false, title: t('calendar.title') }} />
      <Stack.Screen name="Preview" component={PreviewScreen} options={{ title: t('nav.preview') }} />
      <Stack.Screen name="EditCaptions" component={EditCaptionsScreen} options={{ title: t('nav.editCaptions') }} />
    </Stack.Navigator>
  );
}

function AnalyticsStack() {
  const { t } = useI18n();
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="Analytics" component={AnalyticsScreen} options={{ headerShown: false, title: t('tab.analytics') }} />
      <Stack.Screen name="VideoAnalytics" component={VideoAnalyticsScreen} options={{ title: t('nav.videoAnalytics') }} />
    </Stack.Navigator>
  );
}

function MenuStack() {
  const { t } = useI18n();
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="Menu" component={MenuScreen} options={{ title: t('nav.menu') }} />
      <Stack.Screen name="BrandKit" component={BrandKitScreen} options={{ title: t('nav.brandKit') }} />
      <Stack.Screen name="Personas" component={PersonasScreen} options={{ title: t('nav.voice') }} />
      {/* Login/SignUp stay registered here too as a defensive fallback for MenuScreen's
          post-signOut instant, though the AuthStack below is what's actually shown while logged
          out — see AppShell. */}
      <Stack.Screen name="Login" component={LoginScreen} options={{ title: t('nav.login') }} />
      <Stack.Screen name="SignUp" component={SignUpScreen} options={{ title: t('nav.signUp') }} />
    </Stack.Navigator>
  );
}

// Shown while logged out — Create/Projects/Calendar/Analytics/Menu all require a real account
// server-side now, so there is nothing useful to show behind them until sign-in succeeds.
function AuthStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SignUp" component={SignUpScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Create: 'add-circle',
  Projects: 'folder',
  Calendar: 'calendar',
  Analytics: 'bar-chart',
  Menu: 'menu',
};

const TAB_LABEL_KEYS = {
  Create: 'tab.create',
  Projects: 'tab.projects',
  Calendar: 'tab.calendar',
  Analytics: 'tab.analytics',
  Menu: 'tab.menu',
} as const;

function AppTabs() {
  const { t } = useI18n();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarIcon: ({ color, size }) => <Ionicons name={TAB_ICONS[route.name]} size={size} color={color} />,
        tabBarLabel: t(TAB_LABEL_KEYS[route.name as keyof typeof TAB_LABEL_KEYS]),
      })}
    >
      <Tab.Screen name="Create" component={CreateStack} />
      <Tab.Screen name="Projects" component={ProjectsStack} />
      <Tab.Screen name="Calendar" component={CalendarStack} />
      <Tab.Screen name="Analytics" component={AnalyticsStack} />
      <Tab.Screen name="Menu" component={MenuStack} />
    </Tab.Navigator>
  );
}

// The mandatory-login gate: reads the shared auth status and renders exactly one of a loading
// spinner, the sign-in flow, a mandatory email-verification screen, or the real app — nothing
// behind AppTabs is reachable while logged out OR unverified.
function AppShell() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (status === 'pendingVerification') return <VerifyEmailScreen />;

  return status === 'loggedIn' ? <AppTabs /> : <AuthStack />;
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <NavigationContainer>
          <StatusBar style="light" />
          <AppShell />
        </NavigationContainer>
      </AuthProvider>
    </LanguageProvider>
  );
}
