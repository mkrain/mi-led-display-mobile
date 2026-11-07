import ImageCropPicker from 'react-native-image-crop-picker';
import base64js from 'base64-js';

/**
 * Pick an image file byte-identical, for sprite-sheet
 * import (Nov 7, 2026).
 *
 * Unlike pickPhoto.ts, this must NOT convert or compress:
 * pickPhoto forces JPEG and 512px, which would destroy
 * a sprite sheet (lossy re-encode, resized tiles, header
 * text blurred). With no forceJpg and no compress
 * options, the picker returns the original bytes
 * untouched (its lossless path, mime from the first
 * byte — 0x89 is image/png).
 *
 * The bytes come from `includeBase64`, not from
 * `picked.path`: the path is only filled in when
 * `writeTempFile` is set, and without it the path is
 * empty — reading it returns zero bytes, which the
 * decoder then (correctly) rejects as "Not a PNG".
 * That was the Nov 7 import failure: an empty read,
 * not a conversion. If the picker ever hands back a
 * non-PNG (JPEG/HEIC), the mime check below says so
 * plainly instead of a bare signature error.
 *
 * Returns null when the user cancels the picker (not an
 * error). Throws on any other picker failure, a missing
 * payload, or a non-PNG mime.
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
      includeBase64: true,
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
  if (picked.mime && picked.mime !== 'image/png') {
    throw new Error(
      `Picked file is ${picked.mime}, not a PNG; ` +
        'only PNG sprite sheets can be imported.',
    );
  }
  if (!picked.data) {
    throw new Error('Photo pick returned no image data.');
  }
  return {
    bytes: base64js.toByteArray(picked.data),
    fileName: picked.filename,
  };
}
