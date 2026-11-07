import base64js from 'base64-js';
import {decodePng, type DecodedImage} from './decodePng';
import {decodeJpegBase64} from '../photos/decodeJpeg';
import type {RGB} from '../conversion/convert';

/**
 * Decode a picked image, PNG or JPEG, to pixels
 * (Nov 7, 2026).
 *
 * Photos converts a saved PNG sheet to JPEG on the
 * way back, so import has to take both. PNG goes
 * through decodePng (lossless, tEXt Title kept);
 * JPEG goes through jpeg-js (already in the tree
 * for pickPhoto), alpha dropped, no metadata — a
 * JPEG carries no tEXt Title, so the name falls
 * back to the header text or a default. JPEG is
 * lossy: colours may shift slightly from the
 * original tiles, and the header text may misread
 * on heavy compression. Anything else throws
 * plainly, naming the mime.
 */
export function decodePickedImage(
  mime: string,
  base64: string,
): DecodedImage {
  if (mime === 'image/png') {
    return decodePng(base64js.toByteArray(base64));
  }
  if (mime === 'image/jpeg') {
    const rgba = decodeJpegBase64(base64);
    const pixels: RGB[] = new Array(rgba.width * rgba.height);
    for (let i = 0; i < rgba.width * rgba.height; i += 1) {
      pixels[i] = [rgba.data[i * 4], rgba.data[i * 4 + 1], rgba.data[i * 4 + 2]];
    }
    return {width: rgba.width, height: rgba.height, pixels, text: {}};
  }
  throw new Error(
    `Picked file is ${mime}; only PNG and JPEG sprite sheets can be imported.`,
  );
}
