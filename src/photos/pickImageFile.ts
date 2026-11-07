import ImageCropPicker from 'react-native-image-crop-picker';

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
 * byte — 0x89 is image/png, 0xFF is image/jpeg).
 *
 * The bytes come from `includeBase64`, not from
 * `picked.path`: the path is only filled in when
 * `writeTempFile` is set, and without it the path is
 * empty — reading it returns zero bytes, which the
 * decoder then (correctly) rejects as "Not a PNG".
 *
 * `multiple: true` is deliberate, not a mistake.
 * The library's single-pick path always runs its
 * JPEG compressor, whatever the source format —
 * that is why Photos' PNG came back as JPEG.
 * The multi-pick path checks the original data
 * first and, with the default quality (0.8, the
 * lossless threshold), no resize, a known mime
 * and forceJpg off, returns the original bytes
 * untouched. So we open the multi picker and take
 * the first result. The only cost is the picker
 * UI: select the sheet, then tap Done, instead
 * of tap-to-pick.
 *
 * Photos converts: a sheet saved to Photos with Save
 * Image comes back as JPEG, not PNG, so both mimes
 * are accepted here. JPEG is lossy — colours may
 * shift slightly and the header text may misread, in
 * which case the import falls back to a default name.
 * A Files import later will carry the exact PNG.
 * Anything else (HEIC and the rest) is rejected
 * plainly, naming the mime.
 *
 * Returns null when the user cancels the picker (not an
 * error). Throws on any other picker failure, a missing
 * payload, or an unsupported mime.
 */
export type PickedFile = {
  mime: string;
  /** Base64 of the picked file, exactly as returned. */
  base64: string;
  fileName?: string;
};

const SUPPORTED_MIMES = ['image/png', 'image/jpeg'];

export async function pickImageFile(): Promise<PickedFile | null> {
  let result;
  try {
    result = await ImageCropPicker.openPicker({
      mediaType: 'photo',
      cropping: false,
      multiple: true,
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
  // multiple:true resolves an array; take the first
  // selection (the sheet). Tolerate a single object
  // in case a future library version changes shape.
  const picked = Array.isArray(result) ? result[0] : result;
  if (!picked) {
    return null;
  }
  if (picked.mime && !SUPPORTED_MIMES.includes(picked.mime)) {
    throw new Error(
      `Picked file is ${picked.mime}; only PNG and JPEG sprite sheets can be imported.`,
    );
  }
  if (!picked.data) {
    throw new Error('Photo pick returned no image data.');
  }
  return {
    mime: picked.mime ?? 'image/png',
    base64: picked.data,
    fileName: picked.filename,
  };
}
