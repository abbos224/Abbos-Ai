import * as SecureStore from 'expo-secure-store';

// A credential, not a preference — stored in the OS keychain/keystore via expo-secure-store,
// never in AsyncStorage.
const TOKEN_KEY = 'reelai_auth_token';

export async function saveToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
