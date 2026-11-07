/* eslint-disable no-bitwise -- the test parses PNG chunk
 * headers and stored DEFLATE blocks, which are bitwise. */
import {
  buildScanlines,
  buildSpriteSheetScanlines,
  crc32,
  EXPORT_SIZE,
  itemsToSpriteSheetPng,
  pixelsToPng,
  spriteSheetGrid,
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

describe('Sprite sheet', () => {
  function solidPixels(colour: [number, number, number]): RGB[] {
    return Array.from({length: 256}, () => [...colour] as RGB);
  }

  function pixelAt(
    scanlines: Uint8Array,
    width: number,
    x: number,
    y: number,
  ): [number, number, number] {
    const rowBytes = width * 3;
    const i = y * (rowBytes + 1) + 1 + x * 3;
    return [scanlines[i], scanlines[i + 1], scanlines[i + 2]];
  }

  test('grid is 5 across, rows as needed', () => {
    expect(spriteSheetGrid(1)).toEqual({
      columns: 5,
      rows: 1,
      width: 1280,
      height: 256,
    });
    expect(spriteSheetGrid(5)).toEqual({
      columns: 5,
      rows: 1,
      width: 1280,
      height: 256,
    });
    expect(spriteSheetGrid(6)).toEqual({
      columns: 5,
      rows: 2,
      width: 1280,
      height: 512,
    });
    expect(spriteSheetGrid(10)).toEqual({
      columns: 5,
      rows: 2,
      width: 1280,
      height: 512,
    });
    expect(() => spriteSheetGrid(0)).toThrow('at least 1 item');
  });

  test('tiles lay out left to right, top to bottom, in order', () => {
    const red = solidPixels([255, 0, 0]);
    const green = solidPixels([0, 255, 0]);
    const blue = solidPixels([0, 0, 255]);
    const scanlines = buildSpriteSheetScanlines([red, green, blue]);
    // Tile 1 top-left, tile 2 next to it, tile 3 next to that.
    expect(pixelAt(scanlines, 1280, 0, 0)).toEqual([255, 0, 0]);
    expect(pixelAt(scanlines, 1280, 255, 255)).toEqual([255, 0, 0]);
    expect(pixelAt(scanlines, 1280, 256, 0)).toEqual([0, 255, 0]);
    expect(pixelAt(scanlines, 1280, 511, 255)).toEqual([0, 255, 0]);
    expect(pixelAt(scanlines, 1280, 512, 0)).toEqual([0, 0, 255]);
  });

  test('second row starts a new row, empty cells stay black', () => {
    const items = Array.from({length: 6}, (_, i) =>
      solidPixels(i === 5 ? [255, 255, 0] : [255, 0, 0]),
    );
    const scanlines = buildSpriteSheetScanlines(items);
    // Item 6 is first tile of the second row.
    expect(pixelAt(scanlines, 1280, 0, 256)).toEqual([255, 255, 0]);
    expect(pixelAt(scanlines, 1280, 255, 511)).toEqual([255, 255, 0]);
    // Cells 7–10 of the second row are empty: black.
    expect(pixelAt(scanlines, 1280, 256, 256)).toEqual([0, 0, 0]);
    expect(pixelAt(scanlines, 1280, 1279, 511)).toEqual([0, 0, 0]);
  });

  test('sheet PNG has the grid size and valid CRCs', () => {
    const png = itemsToSpriteSheetPng([
      solidPixels([255, 0, 0]),
      solidPixels([0, 255, 0]),
    ]);
    const chunks = parseChunks(png);
    expect(chunks.map(c => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    const view = new DataView(
      chunks[0].data.buffer,
      chunks[0].data.byteOffset,
      chunks[0].data.length,
    );
    expect(view.getUint32(0, false)).toBe(1280);
    expect(view.getUint32(4, false)).toBe(256);
    for (const chunk of chunks) {
      const crcData = new Uint8Array(4 + chunk.data.length);
      for (let i = 0; i < 4; i += 1) {
        crcData[i] = chunk.type.charCodeAt(i);
      }
      crcData.set(chunk.data, 4);
      expect(chunk.crc).toBe(crc32(crcData));
    }
    expect(() => itemsToSpriteSheetPng([])).toThrow('at least 1 item');
    expect(() => itemsToSpriteSheetPng([[[0, 0, 0]]])).toThrow(
      'Expected 256 pixels',
    );
  });
});
