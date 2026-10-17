import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Where the AqarTech API lives.
//
// During development (npx expo start) the app finds your computer by itself: Expo already knows the
// computer's address (it is in the QR code), so changing Wi-Fi networks needs no edits.
// For production builds — or to force a specific server — set EXPO_PUBLIC_API_URL in the root .env.

const API_PORT = process.env.EXPO_PUBLIC_API_PORT || '3000';

function devServerHost() {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' ? window.location.hostname : null;
  }
  // e.g. "192.168.1.20:8081" — the computer running Expo
  const hostUri = Constants.expoConfig?.hostUri || Constants.expoGoConfig?.debuggerHost || '';
  const host = hostUri.split(':')[0];
  return host || null;
}

function resolveApiUrl() {
  const forced = process.env.EXPO_PUBLIC_API_URL;
  if (forced && (!__DEV__ || process.env.EXPO_PUBLIC_API_URL_FORCE === '1')) return forced;
  if (__DEV__) {
    const host = devServerHost();
    if (host) return `http://${host}:${API_PORT}`;
  }
  return forced || `http://localhost:${API_PORT}`;
}

export const API_URL = resolveApiUrl().replace(/\/+$/, '');

// Breakpoints for phone / tablet / desktop-web layouts
export const BREAKPOINTS = { tablet: 700, desktop: 1024 };
