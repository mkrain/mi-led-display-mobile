/* eslint-disable no-bitwise -- CRC32, Adler-32, and the zlib
 * stored-block header are bitwise by definition. */
import type {RGB} from '../conversion/convert';

/**
 * Pure-JS PNG encoder for a 16x16 slideshow item
 * (Nov 6, 2026, share-sheet export, first pass).
 *
 * A slideshow item is 256 RGB triples in AsyncStorage, not
 * an image file, so exporting it has to render it first.
 * The PNG is upscaled with nearest-neighbour (each source
 * pixel becomes a SCALE x SCALE block, default 16, so
 * 16x16 becomes 256x256) so the pixels stay crisp in
 * Photos / Files instead of blurring.
 *
 * Nov 7, 2026: sprite-sheet export — a whole slideshow
 * as one PNG, tiles left to right, top to bottom, in
 * slideshow order (5 tiles across, rows as needed), so
 * one file carries the whole set and its order. Empty
 * cells in the last row stay black, like panel-off.
 *
 * No PNG dependency is used: Hermes has no Node zlib, and
 * the JPEG encoder already in the tree (jpeg-js) is lossy,
 * which would smear sharp pixel edges. The IDAT chunk is
 * a zlib stream made of stored (uncompressed) DEFLATE
 * blocks, which needs only CRC32 and Adler-32 — both
 * implemented here in a few lines. A 256x256 RGB image is
 * about 262 KB uncompressed, which is fine for one shared
 * item. Colour type 2 (truecolour RGB), bit depth 8,
 * filter 0 (None) on every scanline.
 */
export const SOURCE_SIZE = 16;
export const DEFAULT_SCALE = 16;
export const EXPORT_SIZE = SOURCE_SIZE * DEFAULT_SCALE;

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i += 1) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length, false);
  for (let i = 0; i < 4; i += 1) {
    out[4 + i] = type.charCodeAt(i);
  }
  out.set(data, 8);
  const crcData = new Uint8Array(4 + data.length);
  crcData.set(out.subarray(4, 8 + data.length));
  view.setUint32(8 + data.length, crc32(crcData), false);
  return out;
}

function zlibStored(data: Uint8Array): Uint8Array {
  // zlib header 0x78 0x01 (no compression, 32K window),
  // then stored DEFLATE blocks of at most 65535 bytes,
  // then Adler-32 of the raw data, big-endian.
  const blocks = Math.max(1, Math.ceil(data.length / 65535));
  const out = new Uint8Array(2 + blocks * 5 + data.length + 4);
  let offset = 0;
  out[offset++] = 0x78;
  out[offset++] = 0x01;
  let remaining = data.length;
  let pos = 0;
  while (remaining > 0 || pos === 0) {
    const len = Math.min(65535, remaining);
    const final = remaining <= 65535;
    out[offset++] = final ? 1 : 0;
    out[offset++] = len & 0xff;
    out[offset++] = (len >> 8) & 0xff;
    out[offset++] = (~len) & 0xff;
    out[offset++] = ((~len) >> 8) & 0xff;
    out.set(data.subarray(pos, pos + len), offset);
    offset += len;
    pos += len;
    remaining -= len;
    if (pos === 0) {
      break;
    }
  }
  const view = new DataView(out.buffer);
  view.setUint32(offset, adler32(data), false);
  return out.subarray(0, offset + 4);
}

/**
 * Raw scanlines for the upscaled image: one filter byte
 * (0) plus EXPORT_SIZE * 3 RGB bytes per row. Exported
 * for tests, so the upscaling can be checked without
 * parsing a PNG.
 */
export function buildScanlines(pixels: readonly RGB[], scale = DEFAULT_SCALE): Uint8Array {
  const size = SOURCE_SIZE * scale;
  const rowBytes = size * 3;
  const out = new Uint8Array(size * (rowBytes + 1));
  for (let y = 0; y < size; y += 1) {
    const srcY = Math.floor(y / scale);
    const rowStart = y * (rowBytes + 1);
    out[rowStart] = 0;
    for (let x = 0; x < size; x += 1) {
      const srcX = Math.floor(x / scale);
      const p = pixels[srcY * SOURCE_SIZE + srcX];
      const i = rowStart + 1 + x * 3;
      out[i] = p[0];
      out[i + 1] = p[1];
      out[i + 2] = p[2];
    }
  }
  return out;
}

export function pixelsToPng(pixels: readonly RGB[], scale = DEFAULT_SCALE): Uint8Array {
  if (pixels.length !== SOURCE_SIZE * SOURCE_SIZE) {
    throw new Error(
      `Expected ${SOURCE_SIZE * SOURCE_SIZE} pixels, got ${pixels.length}.`,
    );
  }
  const size = SOURCE_SIZE * scale;
  return pngFromScanlines(size, size, buildScanlines(pixels, scale));
}

/** Tiles across a sprite sheet (Nov 7, 2026): 5 across,
 * so 1–5 items is one row and 6–10 items is two rows. */
export const SPRITE_SHEET_COLUMNS = 5;

/**
 * Grid for a sprite sheet of `count` items: columns are
 * fixed at 5, rows grow as needed, each tile is
 * EXPORT_SIZE square, so a full 10-item sheet is
 * 1280x512. Throws on an empty sheet — there is nothing
 * to lay out.
 */
export function spriteSheetGrid(count: number): {
  columns: number;
  rows: number;
  width: number;
  height: number;
} {
  if (count < 1) {
    throw new Error(`Expected at least 1 item, got ${count}.`);
  }
  const columns = SPRITE_SHEET_COLUMNS;
  const rows = Math.ceil(count / columns);
  return {
    columns,
    rows,
    width: columns * EXPORT_SIZE,
    height: rows * EXPORT_SIZE,
  };
}

/**
 * Raw scanlines for a sprite sheet: tiles left to right,
 * top to bottom, in slideshow order, each tile upscaled
 * like a single export. Cells past the last item stay
 * black (panel-off), so a 7-item sheet has three black
 * cells at the end of its second row. Exported for tests,
 * so tile placement can be checked without parsing a PNG.
 */
export function buildSpriteSheetScanlines(
  items: readonly (readonly RGB[])[],
  scale = DEFAULT_SCALE,
): Uint8Array {
  for (const pixels of items) {
    if (pixels.length !== SOURCE_SIZE * SOURCE_SIZE) {
      throw new Error(
        `Expected ${SOURCE_SIZE * SOURCE_SIZE} pixels, got ${pixels.length}.`,
      );
    }
  }
  const {columns, rows} = spriteSheetGrid(items.length);
  const tileSize = SOURCE_SIZE * scale;
  const width = columns * tileSize;
  const height = rows * tileSize;
  const rowBytes = width * 3;
  const out = new Uint8Array(height * (rowBytes + 1));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (rowBytes + 1);
    out[rowStart] = 0;
    const tileRow = Math.floor(y / tileSize);
    const srcY = Math.floor((y % tileSize) / scale);
    for (let x = 0; x < width; x += 1) {
      const tileCol = Math.floor(x / tileSize);
      const srcX = Math.floor((x % tileSize) / scale);
      const item = items[tileRow * columns + tileCol];
      const p = item ? item[srcY * SOURCE_SIZE + srcX] : [0, 0, 0];
      const i = rowStart + 1 + x * 3;
      out[i] = p[0];
      out[i + 1] = p[1];
      out[i + 2] = p[2];
    }
  }
  return out;
}

/** A whole slideshow as one PNG sprite sheet. */
export function itemsToSpriteSheetPng(
  items: readonly (readonly RGB[])[],
  scale = DEFAULT_SCALE,
): Uint8Array {
  const {width, height} = spriteSheetGrid(items.length);
  return pngFromScanlines(width, height, buildSpriteSheetScanlines(items, scale));
}

function pngFromScanlines(
  width: number,
  height: number,
  scanlines: Uint8Array,
): Uint8Array {
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = truecolour RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const idat = zlibStored(scanlines);
  const parts = [
    Uint8Array.from(PNG_SIGNATURE),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
