import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';

// Local notifications only — this app runs in plain Expo Go with no dev client, where remote push
// is unavailable but local (in-app-scheduled) notifications work. Used to ping the user when a
// long job (video processing, idea/image generation) finishes while they've backgrounded the app.
// If the OS has fully suspended the JS runtime the completion check never runs, so this is a
// best-effort "you'll usually get pinged", not a guarantee — an honest limitation of Expo Go.

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let permissionAsked = false;

/**
 * Makes sure we have notification permission, asking once per app session if the status is still
 * undetermined. Returns whether notifications are allowed. Safe to call fire-and-forget at the
 * start of a job so the OS prompt appears while the user is still looking at the app.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain || permissionAsked) return false;
  permissionAsked = true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/**
 * Shows a local notification, but only when the app is not in the foreground — if the user is
 * looking at the screen they already see the result, so a notification would just be noise.
 */
export async function notifyIfBackgrounded(title: string, body: string): Promise<void> {
  if (AppState.currentState === 'active') return;
  try {
    if (!(await ensureNotificationPermission())) return;
    await Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null });
  } catch {
    // A notification failing to post should never break the flow that triggered it.
  }
}
