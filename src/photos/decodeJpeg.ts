import jpeg from 'jpeg-js';
import base64js from 'base64-js';
import type {RgbaImage} from '../conversion/convert';

/**
 * Pure JPEG -> RGBA decode (no native modules, so it is unit-testable).
 * Used by pickPhoto.ts after the native picker has converted the pick
 * to JPEG and returned it as base64.
 */
export function decodeJpegBase64(base64: string): RgbaImage {
  const bytes = base64js.toByteArray(base64);
  let decoded;
  try {
    decoded = jpeg.decode(bytes, {useTArray: true, formatAsRGBA: true});
  } catch (e) {
    throw new Error(
      `JPEG decode failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (decoded.data.length !== decoded.width * decoded.height * 4) {
    throw new Error(
      `Decoded JPEG has ${decoded.data.length} bytes for ` +
        `${decoded.width}x${decoded.height}; expected RGBA.`,
    );
  }
  return {
    data: new Uint8ClampedArray(decoded.data),
    width: decoded.width,
    height: decoded.height,
  };
}
