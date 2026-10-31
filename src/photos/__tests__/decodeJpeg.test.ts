import jpeg from 'jpeg-js';
import base64js from 'base64-js';
import {decodeJpegBase64} from '../decodeJpeg';

describe('decodeJpegBase64', () => {
  test('round-trips a small JPEG to RGBA with the right dimensions', () => {
    // 4x2 image: left half red, right half blue. JPEG is lossy, so
    // assert channels with tolerance, not exact equality.
    const width = 4;
    const height = 2;
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const red = x < 2;
        data[i] = red ? 255 : 0;
        data[i + 1] = 0;
        data[i + 2] = red ? 0 : 255;
        data[i + 3] = 255;
      }
    }
    const encoded = jpeg.encode({data, width, height}, 100);
    const base64 = base64js.fromByteArray(encoded.data);

    const decoded = decodeJpegBase64(base64);
    expect(decoded.width).toBe(width);
    expect(decoded.height).toBe(height);
    expect(decoded.data.length).toBe(width * height * 4);
    // Top-left pixel should still be mostly red, top-right mostly blue.
    expect(decoded.data[0]).toBeGreaterThan(200);
    expect(decoded.data[2]).toBeLessThan(55);
    const right = (width - 1) * 4;
    expect(decoded.data[right]).toBeLessThan(55);
    expect(decoded.data[right + 2]).toBeGreaterThan(200);
  });

  test('rejects non-JPEG input with a plain error', () => {
    expect(() => decodeJpegBase64('aGVsbG8gd29ybGQ=')).toThrow(
      /JPEG decode failed/,
    );
  });
});
