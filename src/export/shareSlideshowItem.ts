import Share from 'react-native-share';
import {CachesDirectoryPath, writeFile} from '@dr.pogodin/react-native-fs';
import base64js from 'base64-js';
import type {RGB} from '../conversion/convert';
import {itemsToSpriteSheetPng, pixelsToPng} from './encodePng';

/**
 * Share one 16x16 image through the system share sheet
 * (Nov 6, 2026, first export pass; Nov 7, 2026: generalised
 * from slideshow-only to any pixels — Draw and Photo share
 * the same helper, so sharing never requires adding to a
 * slideshow first).
 *
 * The image is rendered to an upscaled PNG, written to the
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

export async function shareImage(item: {
  label: string;
  pixels: readonly RGB[];
}): Promise<ShareItemOutcome> {
  return sharePngBytes(
    shareFileName(item.label),
    pixelsToPng(item.pixels),
  );
}

/**
 * Share a whole slideshow as one sprite-sheet PNG
 * (Nov 7, 2026): tiles left to right, top to bottom, in
 * slideshow order, 5 across. The file is named after the
 * slideshow, with a `-sheet` suffix so it never collides
 * with a single-item share named after the same label.
 */
export async function shareSpriteSheet(slideshow: {
  name: string;
  items: readonly (readonly RGB[])[];
}): Promise<ShareItemOutcome> {
  return sharePngBytes(
    shareFileName(`${slideshow.name}-sheet`),
    itemsToSpriteSheetPng(slideshow.items),
  );
}

async function sharePngBytes(
  filename: string,
  png: Uint8Array,
): Promise<ShareItemOutcome> {
  const path = `${CachesDirectoryPath}/${filename}`;
  // 2.40.4's writeFile takes a string, not an ArrayBuffer
  // (that API arrived in 2.41.0, whose TurboModule spec
  // uses ArrayBuffer — unrecognised by RN 0.81.4's codegen,
  // which is why 2.40.4 is pinned). Encode the PNG bytes
  // as base64 with base64-js, already a dependency.
  await writeFile(path, base64js.fromByteArray(png), 'base64');
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

/** Old name, kept for the slideshow screen's tests. */
export const shareSlideshowItem = shareImage;
