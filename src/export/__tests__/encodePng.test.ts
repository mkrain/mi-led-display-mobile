/* eslint-disable no-bitwise -- the test parses PNG chunk
 * headers and stored DEFLATE blocks, which are bitwise. */
import {
  buildScanlines,
  crc32,
  EXPORT_SIZE,
  pixelsToPng,
} from '../encodePng';
import type {RGB} from '../../conversion/convert';

function testPixels(): RGB[] {
  // Top-left red, next pixel green, bottom-right blue,
  // everything else black — so upscaling can be checked
  // block by block.
  const pixels = Array.from({length: 256}, () => [0, 0, 0] as RGB);
  pixels[0] = [255, 0, 0];
  pixels[1] = [0, 255, 0];
  pixels[255] = [0, 0, 255];
  return pixels;
}

function parseChunks(png: Uint8Array) {
  const chunks: {type: string; data: Uint8Array; crc: number}[] = [];
  let offset = 8;
  while (offset < png.length) {
    const view = new DataView(png.buffer, png.byteOffset + offset, 8);
    const length = view.getUint32(0, false);
    const type = String.fromCharCode(
      png[offset + 4],
      png[offset + 5],
      png[offset + 6],
      png[offset + 7],
    );
    const data = png.subarray(offset + 8, offset + 8 + length);
    const crc = new DataView(
      png.buffer,
      png.byteOffset + offset + 8 + length,
      4,
    ).getUint32(0, false);
    chunks.push({type, data, crc});
    offset += 12 + length;
  }
  return chunks;
}

function inflateStored(idat: Uint8Array): Uint8Array {
  // zlib header (2 bytes), then stored DEFLATE blocks,
  // then Adler-32 (4 bytes). Reassemble the raw data.
  if (idat[0] !== 0x78 || idat[1] !== 0x01) {
    throw new Error('unexpected zlib header');
  }
  const parts: Uint8Array[] = [];
  let offset = 2;
  for (;;) {
    const final = idat[offset] & 1;
    const len = idat[offset + 1] | (idat[offset + 2] << 8);
    const nlen = idat[offset + 3] | (idat[offset + 4] << 8);
    expect(nlen).toBe(0xffff - len);
    parts.push(idat.subarray(offset + 5, offset + 5 + len));
    offset += 5 + len;
    if (final) {
      break;
    }
  }
  expect(offset + 4).toBe(idat.length);
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const part of parts) {
    out.set(part, pos);
    pos += part.length;
  }
  return out;
}

describe('PNG encoder', () => {
  test('signature, IHDR size and colour type, and valid CRCs', () => {
    const png = pixelsToPng(testPixels());
    expect(Array.from(png.subarray(0, 8))).toEqual([
      137, 80, 78, 71, 13, 10, 26, 10,
    ]);
    const chunks = parseChunks(png);
    expect(chunks.map(c => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    const ihdr = chunks[0];
    const view = new DataView(
      ihdr.data.buffer,
      ihdr.data.byteOffset,
      ihdr.data.length,
    );
    expect(view.getUint32(0, false)).toBe(EXPORT_SIZE);
    expect(view.getUint32(4, false)).toBe(EXPORT_SIZE);
    expect(ihdr.data[8]).toBe(8);
    expect(ihdr.data[9]).toBe(2);
    for (const chunk of chunks) {
      const crcData = new Uint8Array(4 + chunk.data.length);
      for (let i = 0; i < 4; i += 1) {
        crcData[i] = chunk.type.charCodeAt(i);
      }
      crcData.set(chunk.data, 4);
      expect(chunk.crc).toBe(crc32(crcData));
    }
  });

  test('upscaling repeats each source pixel in a 16x16 block', () => {
    const scanlines = buildScanlines(testPixels());
    const rowBytes = EXPORT_SIZE * 3;
    const pixelAt = (x: number, y: number): [number, number, number] => {
      const rowStart = y * (rowBytes + 1);
      const i = rowStart + 1 + x * 3;
      return [scanlines[i], scanlines[i + 1], scanlines[i + 2]];
    };
    // Filter byte 0 on every row.
    for (let y = 0; y < EXPORT_SIZE; y += 1) {
      expect(scanlines[y * (rowBytes + 1)]).toBe(0);
    }
    expect(pixelAt(0, 0)).toEqual([255, 0, 0]);
    expect(pixelAt(15, 15)).toEqual([255, 0, 0]);
    expect(pixelAt(16, 0)).toEqual([0, 255, 0]);
    expect(pixelAt(31, 15)).toEqual([0, 255, 0]);
    expect(pixelAt(255, 255)).toEqual([0, 0, 255]);
    expect(pixelAt(240, 240)).toEqual([0, 0, 255]);
    expect(pixelAt(128, 128)).toEqual([0, 0, 0]);
  });

  test('IDAT stored blocks inflate back to the scanlines', () => {
    const png = pixelsToPng(testPixels());
    const chunks = parseChunks(png);
    const idat = chunks.find(c => c.type === 'IDAT');
    expect(idat).toBeDefined();
    expect(inflateStored(idat!.data)).toEqual(
      buildScanlines(testPixels()),
    );
  });

  test('wrong pixel count throws', () => {
    expect(() => pixelsToPng([[0, 0, 0]])).toThrow('Expected 256 pixels');
  });
});
