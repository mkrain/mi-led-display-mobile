/* eslint-disable no-bitwise -- PNG filter reconstruction and
 * Paeth prediction are bitwise by definition. */
import {inflate} from 'pako';
import type {RGB} from '../conversion/convert';

/**
 * Pure-JS PNG decoder (Nov 7, 2026, sprite-sheet import).
 *
 * The counterpart to encodePng.ts: given PNG bytes — from
 * Photos, Files, or anywhere else, so the picker/source
 * stays separate from decoding — return the pixels.
 * A sheet that went through Photos may come back
 * re-encoded with real DEFLATE compression and PNG
 * filters, unlike our encoder's stored blocks and
 * filter 0, so this handles both: pako inflates the
 * IDAT zlib stream, and all five filter types (None,
 * Sub, Up, Average, Paeth) are undone per scanline.
 *
 * Scope, deliberately narrow for the first pass:
 * - 8-bit colour depth only, colour type 2 (RGB) or 6
 *   (RGBA — alpha is dropped, the panel is RGB only).
 * - Non-interlaced only (Adam7 is rejected, not decoded).
 * - tEXt chunks are returned as metadata (the sheet's
 *   Title is read from there when the header is missing
 *   or unreadable), everything else ancillary is ignored.
 * Anything outside that throws a plain message naming
 * what was unsupported, instead of a mangled import.
 */
export type DecodedImage = {
  width: number;
  height: number;
  /** Row-major RGB, one triple per pixel, alpha dropped. */
  pixels: RGB[];
  /** tEXt keyword -> text, when the file carries any. */
  text: Readonly<Record<string, string>>;
};

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function u32(data: Uint8Array, offset: number): number {
  return new DataView(
    data.buffer,
    data.byteOffset + offset,
    4,
  ).getUint32(0, false);
}

function chunkType(data: Uint8Array, offset: number): string {
  return String.fromCharCode(
    data[offset + 4],
    data[offset + 5],
    data[offset + 6],
    data[offset + 7],
  );
}

export function decodePng(bytes: Uint8Array): DecodedImage {
  if (
    bytes.length < 8 ||
    !PNG_SIGNATURE.every((b, i) => bytes[i] === b)
  ) {
    throw new Error('Not a PNG file (bad signature).');
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colourType = 0;
  let interlace = 0;
  const idatParts: Uint8Array[] = [];
  const text: Record<string, string> = {};
  let sawIhdr = false;
  let sawIend = false;
  while (offset + 12 <= bytes.length && !sawIend) {
    const length = u32(bytes, offset);
    const type = chunkType(bytes, offset);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) {
      throw new Error(`PNG chunk ${type} runs past the end of the file.`);
    }
    const data = bytes.subarray(dataStart, dataEnd);
    if (type === 'IHDR') {
      width = u32(data, 0);
      height = u32(data, 4);
      bitDepth = data[8];
      colourType = data[9];
      interlace = data[12];
      sawIhdr = true;
    } else if (type === 'IDAT') {
      idatParts.push(data);
    } else if (type === 'tEXt') {
      const nul = data.indexOf(0);
      if (nul > 0) {
        const keyword = String.fromCharCode(...data.subarray(0, nul));
        const value = String.fromCharCode(
          ...data.subarray(nul + 1),
        );
        text[keyword] = value;
      }
    } else if (type === 'IEND') {
      sawIend = true;
    }
    offset = dataEnd + 4;
  }
  if (!sawIhdr) {
    throw new Error('PNG has no IHDR chunk.');
  }
  if (bitDepth !== 8) {
    throw new Error(
      `PNG bit depth ${bitDepth} is not supported; only 8-bit PNGs can be imported.`,
    );
  }
  if (colourType !== 2 && colourType !== 6) {
    throw new Error(
      `PNG colour type ${colourType} is not supported; only RGB and RGBA PNGs can be imported.`,
    );
  }
  if (interlace !== 0) {
    throw new Error(
      'Interlaced PNGs are not supported; only non-interlaced PNGs can be imported.',
    );
  }
  if (idatParts.length === 0) {
    throw new Error('PNG has no image data (no IDAT chunk).');
  }
  const idat = new Uint8Array(
    idatParts.reduce((sum, p) => sum + p.length, 0),
  );
  let pos = 0;
  for (const part of idatParts) {
    idat.set(part, pos);
    pos += part.length;
  }
  let raw: Uint8Array;
  try {
    raw = inflate(idat);
  } catch (e) {
    throw new Error(
      `PNG image data could not be decompressed: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }
  const channels = colourType === 2 ? 3 : 4;
  const rowBytes = width * channels;
  if (raw.length !== height * (rowBytes + 1)) {
    throw new Error(
      `PNG image data is ${raw.length} bytes, expected ${
        height * (rowBytes + 1)
      } for a ${width}x${height} image.`,
    );
  }
  const pixels: RGB[] = new Array(width * height);
  const prevRow = new Uint8Array(rowBytes);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (rowBytes + 1)];
    const rowStart = y * (rowBytes + 1) + 1;
    const row = raw.subarray(rowStart, rowStart + rowBytes);
    const recon = new Uint8Array(rowBytes);
    for (let x = 0; x < rowBytes; x += 1) {
      const a = x >= channels ? recon[x - channels] : 0;
      const b = prevRow[x];
      const c = x >= channels ? prevRow[x - channels] : 0;
      let pred = 0;
      if (filter === 0) {
        pred = 0;
      } else if (filter === 1) {
        pred = a;
      } else if (filter === 2) {
        pred = b;
      } else if (filter === 3) {
        pred = Math.floor((a + b) / 2);
      } else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else {
        throw new Error(
          `PNG filter type ${filter} on row ${y} is not supported.`,
        );
      }
      recon[x] = (row[x] + pred) & 0xff;
    }
    for (let x = 0; x < width; x += 1) {
      const i = x * channels;
      pixels[y * width + x] = [recon[i], recon[i + 1], recon[i + 2]];
    }
    prevRow.set(recon);
  }
  return {width, height, pixels, text};
}
