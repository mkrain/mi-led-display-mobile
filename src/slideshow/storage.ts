import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  EMPTY_LIBRARY,
  isValidLibrary,
  libraryFromOldQueue,
  type SlideshowLibrary,
} from './library';

/**
 * Slideshow library persistence (AsyncStorage, Oct 30, 2026).
 *
 * Stored as JSON under a single key: {slideshows, activeId,
 * lastSaved}. A queue item is ~3 KB of JSON (256 RGB triples),
 * so a library of several 10-item slideshows is still far
 * under AsyncStorage limits. Corrupt or wrong-shaped stored
 * data loads as an empty library instead of crashing — a
 * library is user work, but a bad stored library must never
 * block the app from launching.
 *
 * Migration: the old single queue lived under
 * 'mi-led-slideshow-queue' as a bare array. On first load,
 * if the new key is absent and the old key holds a non-empty
 * queue, it is imported as one slideshow named "My
 * slideshow" and made active, and the old key is removed
 * (best effort — the new key takes precedence on later
 * loads, so a failed removal cannot re-migrate). An empty
 * old queue migrates to an empty library.
 */
export const SLIDESHOW_LIBRARY_KEY = 'mi-led-slideshows';
export const OLD_SLIDESHOW_QUEUE_KEY = 'mi-led-slideshow-queue';

export async function loadSlideshowLibrary(): Promise<SlideshowLibrary> {
  try {
    const raw = await AsyncStorage.getItem(SLIDESHOW_LIBRARY_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isValidLibrary(parsed)) {
        return parsed;
      }
      return EMPTY_LIBRARY;
    }
    const oldRaw = await AsyncStorage.getItem(OLD_SLIDESHOW_QUEUE_KEY);
    if (!oldRaw) {
      return EMPTY_LIBRARY;
    }
    const oldParsed: unknown = JSON.parse(oldRaw);
    const migrated = libraryFromOldQueue(
      oldParsed,
      `migrated-${Date.now()}`,
    );
    if (migrated === null) {
      return EMPTY_LIBRARY;
    }
    await AsyncStorage.removeItem(OLD_SLIDESHOW_QUEUE_KEY).catch(
      () => undefined,
    );
    return migrated;
  } catch {
    return EMPTY_LIBRARY;
  }
}

export async function saveSlideshowLibrary(
  library: SlideshowLibrary,
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      SLIDESHOW_LIBRARY_KEY,
      JSON.stringify(library),
    );
  } catch {
    // Persistence is best-effort: a failed save must not break
    // the in-memory library, which is what the user sees.
  }
}
