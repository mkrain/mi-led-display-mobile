import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persisted Connect-screen options. AsyncStorage is the standard
 * bare-React-Native key-value store (iOS + Android, New Architecture
 * via TurboModule in v2). Failures are swallowed: a missing or
 * unreadable option falls back to its default, never crashes the app.
 */
const AUTO_CONNECT_KEY = 'mi-led-auto-connect';

export async function loadAutoConnect(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(AUTO_CONNECT_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function saveAutoConnect(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(AUTO_CONNECT_KEY, enabled ? '1' : '0');
  } catch {
    // Best effort: the toggle still works for this session.
  }
}
