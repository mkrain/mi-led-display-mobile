import ImageCropPicker from 'react-native-image-crop-picker';
import {readFile} from '@dr.pogodin/react-native-fs';
import base64js from 'base64-js';

/**
 * Pick an image file byte-identical, for sprite-sheet
 * import (Nov 7, 2026).
 *
 * Unlike pickPhoto.ts, this must NOT convert or compress:
 * pickPhoto forces JPEG and 512px, which would destroy
 * a sprite sheet (lossy re-encode, resized tiles, header
 * text blurred). Here the picker returns the file as-is
 * — no forceJpg, no compress options — and the bytes are
 * read back from the returned path, so the decoder sees
 * exactly what Photos holds. If the picker hands back
 * something that is not a PNG, decodePng rejects it with
 * a plain message; that is the device signal to report.
 *
 * Returns null when the user cancels the picker (not an
 * error). Throws on any other picker or read failure.
 *
 * Source-agnostic by design: the import function takes
 * bytes, so a Files/document picker later just supplies
 * bytes to the same path.
 */
export type PickedFile = {
  bytes: Uint8Array;
  fileName?: string;
};

export async function pickPngFile(): Promise<PickedFile | null> {
  let picked;
  try {
    picked = await ImageCropPicker.openPicker({
      mediaType: 'photo',
      cropping: false,
      multiple: false,
    });
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message.includes('cancel') ||
        (e as {code?: string}).code === 'E_PICKER_CANCELLED')
    ) {
      return null;
    }
    throw new Error(
      `Photo pick failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const base64 = await readFile(picked.path, 'base64');
  return {
    bytes: base64js.toByteArray(base64),
    fileName: picked.filename,
  };
}
