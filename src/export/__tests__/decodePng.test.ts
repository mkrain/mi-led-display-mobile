import base64js from 'base64-js';
import {decodePng} from '../decodePng';
import {pixelsToPng} from '../encodePng';
import type {RGB} from '../../conversion/convert';

// Fixtures are embedded as base64, not files: this app's
// tsconfig only loads jest types, so fs/path/__dirname
// are unavailable in tests, and the fixtures are tiny
// (PIL-generated PNGs with real zlib + filters).
const FIXTURES: Record<string, string> = {
  'rgb-4x2.png':
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAIAAADwyuo0AAAAGklEQVR4nDXEsQEAAAjDIE7v53GS' +
    'ASHU3zYcihcKeBGtKckAAAAASUVORK5CYII='
,
  'rgba-4x2.png':
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAYAAAB/qH1jAAAAIUlEQVR4nCXFoQEAIBAAIbLZ/Nkx' +
    '3fwMUhBXIv0rtfYceAKXDdjN+XIXAAAAAElFTkSuQmCC'
,
  'grey-2x2.png':
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAAAAABX3VL4AAAADklEQVR4nGNsYGBiYAAAApIAhPd8' +
    'o1gAAAAASUVORK5CYII='
,
  'rgb-text-4x2.png':
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAIAAADwyuo0AAAAEnRFWHRUaXRsZQBNeSBzbGlkZXNo' +
    'b3fTX5FSAAAAGklEQVR4nDXEsQEAAAjDIE7v53GSASHU3zYcihcKeBGtKckAAAAASUVORK5CYII='
,
};

function fixture(name: string): Uint8Array {
  return base64js.toByteArray(FIXTURES[name]);
}

function blackPixels(): RGB[] {
  return Array.from({length: 256}, () => [0, 0, 0] as RGB);
}

describe('decodePng', () => {
  test('round-trips our own encoder output', () => {
    const pixels = blackPixels();
    pixels[0] = [255, 0, 0];
    pixels[255] = [0, 0, 255];
    const decoded = decodePng(pixelsToPng(pixels));
    expect(decoded.width).toBe(256);
    expect(decoded.height).toBe(256);
    // Upscaled x16: source (0,0) is decoded (0,0), source
    // (15,15) is decoded (255,240) — index 240*256+255.
    expect(decoded.pixels[0]).toEqual([255, 0, 0]);
    expect(decoded.pixels[240 * 256 + 255]).toEqual([0, 0, 255]);
    expect(decoded.pixels[128]).toEqual([0, 0, 0]);
    expect(decoded.text).toEqual({});
  });

  test('decodes a real-world RGB PNG (zlib + filters)', () => {
    const decoded = decodePng(fixture('rgb-4x2.png'));
    expect(decoded.width).toBe(4);
    expect(decoded.height).toBe(2);
    expect(decoded.pixels).toEqual([
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 255, 0],
      [0, 255, 255],
      [255, 0, 255],
      [128, 128, 128],
      [0, 0, 0],
    ]);
  });

  test('decodes RGBA and drops alpha', () => {
    const decoded = decodePng(fixture('rgba-4x2.png'));
    expect(decoded.pixels[0]).toEqual([255, 0, 0]);
    expect(decoded.pixels[2]).toEqual([0, 0, 255]);
    expect(decoded.pixels[6]).toEqual([10, 20, 30]);
  });

  test('reads tEXt metadata', () => {
    const decoded = decodePng(fixture('rgb-text-4x2.png'));
    expect(decoded.text).toEqual({Title: 'My slideshow'});
  });

  test('rejects non-PNGs and unsupported PNGs', () => {
    expect(() => decodePng(new Uint8Array([1, 2, 3]))).toThrow(
      'Not a PNG',
    );
    expect(() => decodePng(fixture('grey-2x2.png'))).toThrow(
      'colour type 0',
    );
    // PIL ignores the interlace save option, so flip the
    // IHDR interlace byte (file offset 28) by hand.
    const interlaced = new Uint8Array(fixture('rgb-4x2.png'));
    interlaced[28] = 1;
    expect(() => decodePng(interlaced)).toThrow('Interlaced');
  });
});
