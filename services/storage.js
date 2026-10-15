import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Small key/value storage that works everywhere:
//   phone/tablet → expo-secure-store (encrypted, keychain/keystore)
//   web          → localStorage (SecureStore is not available on web)
// Every call is wrapped so a blocked storage never crashes the app.

const isWeb = Platform.OS === 'web';

async function get(key) {
  try {
    if (isWeb) return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function set(key, value) {
  try {
    if (isWeb) {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  } catch {
    // ignore — the app keeps working, the value just isn't remembered
  }
}

async function remove(key) {
  try {
    if (isWeb) {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  } catch {
    // ignore
  }
}

export default { get, set, remove };
