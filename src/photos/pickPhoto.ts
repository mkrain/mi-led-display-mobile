import ImageCropPicker from 'react-native-image-crop-picker';
import {decodeJpegBase64} from './decodeJpeg';
import type {RgbaImage} from '../conversion/convert';

/**
 * Photo picker -> RGBA decode, for PhotoScreen.
 *
 * Stack (bare React Native, iOS + Android, no Expo):
 * - react-native-image-crop-picker 0.52.0 (New Architecture, >= 0.50):
 *   picks one photo, no cropping UI, and compresses it in native code.
 * - jpeg-js (pure JS): decodes the compressed JPEG to RGBA.
 * - base64-js (pure JS): base64 -> bytes, because React Native has no
 *   Node Buffer by default.
 *
 * Why compress in native code first:
 * - A phone photo is 12 MP+; decoding that in JS would be slow and use
 *   ~48 MB of RGBA. 512 px on the long edge is far more than the 16x16
 *   conversion needs (including the colorful-trim detection), and keeps
 *   the JS decode fast on both platforms.
 * - iPhone photos are usually HEIC, which jpeg-js cannot decode.
 *   forceJpg converts the pick to JPEG in native code (including Live
 *   Photos), so the JS side only ever sees JPEG.
 * - EXIF orientation is applied by the native compression step, so the
 *   decoded pixels are upright. Verify on device with a portrait photo:
 *   if a portrait pick previews sideways, this assumption is wrong.
 *
 * Returns null when the user cancels the picker (not an error).
 * Throws on any other picker or decode failure, with a plain message
 * the screen can show.
 */
export interface PickedPhoto {
  image: RgbaImage;
  /** File URI from the picker, for the thumbnail preview. */
  uri: string;
  /** Resized dimensions, after native compression. */
  width: number;
  height: number;
  /** Original file name from the picker, when available. */
  fileName?: string;
}

const MAX_EDGE = 512;

export async function pickPhoto(): Promise<PickedPhoto | null> {
  let picked;
  try {
    picked = await ImageCropPicker.openPicker({
      mediaType: 'photo',
      cropping: false,
      multiple: false,
      forceJpg: true,
      compressImageMaxWidth: MAX_EDGE,
      compressImageMaxHeight: MAX_EDGE,
      compressImageQuality: 0.9,
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

  if (!picked.data) {
    throw new Error('Photo pick returned no image data.');
  }
  if (picked.mime !== 'image/jpeg') {
    throw new Error(
      `Picked photo is ${picked.mime}, not JPEG after conversion; ` +
        'only JPEG decoding is supported.',
    );
  }

  const image = decodeJpegBase64(picked.data);

  return {
    image,
    uri: picked.path,
    width: image.width,
    height: image.height,
    fileName: picked.filename,
  };
}
