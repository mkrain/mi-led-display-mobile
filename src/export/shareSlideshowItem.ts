import Share from 'react-native-share';
import {CachesDirectoryPath, writeFile} from '@dr.pogodin/react-native-fs';
import type {RGB} from '../conversion/convert';
import {pixelsToPng} from './encodePng';

/**
 * Share one slideshow item through the system share sheet
 * (Nov 6, 2026, first export pass).
 *
 * The item is rendered to an upscaled PNG, written to the
 * app's internal cache directory, and handed to
 * react-native-share. The cache directory matters: on
 * Android, react-native-share's FileProvider only exposes
 * the internal cache, and React Native's built-in Share
 * cannot share files on Android at all (it sends text
 * only). The user picks the destination in the sheet —
 * Photos, Files, Drive, and so on — so no Photos
 * permission is needed for this first pass.
 *
 * The temp file is left in the cache after sharing: the
 * receiving app reads it through the granted content URI,
 * and the OS may purge the cache later. The next share
 * overwrites the same filename.
 */
export type ShareItemOutcome = 'shared' | 'cancelled';

export function shareFileName(label: string): string {
  const cleaned = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `mi-led-${cleaned || 'image'}.png`;
}

export async function shareSlideshowItem(item: {
  label: string;
  pixels: readonly RGB[];
}): Promise<ShareItemOutcome> {
  const filename = shareFileName(item.label);
  const path = `${CachesDirectoryPath}/${filename}`;
  const png = pixelsToPng(item.pixels);
  // writeFile accepts an ArrayBuffer; pass the PNG bytes
  // directly, not a base64 string, so no re-encoding is
  // needed. The Uint8Array is freshly built here, so its
  // buffer is exactly the PNG bytes.
  await writeFile(path, png.buffer as ArrayBuffer);
  try {
    const result = await Share.open({
      url: `file://${path}`,
      type: 'image/png',
      filename,
    });
    return result.dismissedAction ? 'cancelled' : 'shared';
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // A cancelled sheet surfaces as an error on some
    // paths; treat that as a cancel, not a failure.
    if (/cancel|did not share|user cancelled/i.test(message)) {
      return 'cancelled';
    }
    throw e;
  }
}
