import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persisted Photo auto-send toggle. Same pattern as auto-connect:
 * AsyncStorage, failures fall back to off, never crash. Default off,
 * so a photo is never sent without the user turning this on first.
 */
const AUTO_SEND_KEY = 'mi-led-auto-send';

export async function loadAutoSend(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(AUTO_SEND_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function saveAutoSend(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(AUTO_SEND_KEY, enabled ? '1' : '0');
  } catch {
    // Best effort: the toggle still works for this session.
  }
}
