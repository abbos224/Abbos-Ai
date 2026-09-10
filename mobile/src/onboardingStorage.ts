import * as SecureStore from 'expo-secure-store';

// Not a credential — SecureStore is just the only key-value store this app depends on (no
// AsyncStorage in the tree). Tracks whether the one-time first-run intro has been dismissed.
const ONBOARDING_KEY = 'mraibos_onboarding_done';

export async function getOnboardingComplete(): Promise<boolean> {
  return (await SecureStore.getItemAsync(ONBOARDING_KEY)) === '1';
}

export async function setOnboardingComplete(): Promise<void> {
  await SecureStore.setItemAsync(ONBOARDING_KEY, '1');
}
