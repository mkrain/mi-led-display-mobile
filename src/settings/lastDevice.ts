import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Last panel connected to, persisted across launches (Oct 30,
 * 2026, fast-reconnect build). This is what makes the stock
 * app's reconnect fast, and what ours lacked: ConnectScreen
 * used to remember the last device only in React state, so a
 * killed app forgot it and every auto-connect had to pay for
 * a full 20s scan first. A manual disconnect does NOT clear
 * this — the saved device is a reconnect target, not a
 * connection, so a manual disconnect stays disconnected until
 * the user taps Connect or auto-connect runs on next launch.
 * Corrupt or missing data loads as null, never crashes.
 */
const LAST_DEVICE_KEY = 'mi-led-last-device';

export type LastDevice = {
  id: string;
  name: string | null;
};

export async function loadLastDevice(): Promise<LastDevice | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_DEVICE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as {id?: unknown}).id === 'string' &&
      ((parsed as {name?: unknown}).name === null ||
        typeof (parsed as {name?: unknown}).name === 'string')
    ) {
      return {
        id: (parsed as {id: string}).id,
        name: (parsed as {name: string | null}).name,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveLastDevice(device: LastDevice): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_DEVICE_KEY, JSON.stringify(device));
  } catch {
    // Best effort: the connection still works this session.
  }
}
