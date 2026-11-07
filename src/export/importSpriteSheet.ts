import type {RGB} from '../conversion/convert';
import type {DecodedPng} from './decodePng';
import {
  EXPORT_SIZE,
  SOURCE_SIZE,
  SPRITE_SHEET_COLUMNS,
  SPRITE_SHEET_HEADER_HEIGHT,
  SPRITE_SHEET_HEADER_SCALE,
} from './encodePng';
import {GLYPH_HEIGHT, GLYPH_WIDTH, GLYPHS} from './pixelFont';

/**
 * Sprite-sheet import (Nov 7, 2026): the reverse of the
 * export in encodePng.ts, and source-agnostic — it takes
 * decoded PNG pixels, not a file, so Photos, Files, or
 * any other source can supply the bytes later through
 * the same function.
 *
 * A sheet made by this app is 1280 wide, 5 tiles across,
 * each tile 256x256, 1–2 rows, with an optional 64px
 * header strip naming the slideshow in 5x7 pixel text.
 * Anything else is rejected with a plain message, not
 * a mangled import. Tiles are read left to right, top
 * to bottom, in slideshow order, and downscaled to
 * 16x16 by sampling the centre of each 16px block —
 * exact for our sheets, since the export upscales with
 * nearest-neighbour. Trailing all-black cells are the
 * empty cells at the end of the last row, so they are
 * dropped; an all-black tile in the middle is kept, it
 * is a real (blank) item.
 *
 * The name comes from the header text when it reads
 * back cleanly, else from the PNG's tEXt Title chunk,
 * else null — the screen then falls back to a default
 * name. Header text is uppercase by construction (the
 * export uppercases it), so a name read back from the
 * header is uppercase too; rename is one tap away.
 */
export type ImportedSheet = {
  /** Slideshow name, when the sheet carried one. */
  name: string | null;
  /** 16x16 items, in slideshow order. */
  items: RGB[][];
};

function isBlack(pixels: readonly RGB[]): boolean {
  return pixels.every(p => p[0] === 0 && p[1] === 0 && p[2] === 0);
}

function downscaleTile(
  sheet: readonly RGB[],
  sheetWidth: number,
  x0: number,
  y0: number,
): RGB[] {
  const out: RGB[] = new Array(SOURCE_SIZE * SOURCE_SIZE);
  for (let sy = 0; sy < SOURCE_SIZE; sy += 1) {
    for (let sx = 0; sx < SOURCE_SIZE; sx += 1) {
      // Centre of the 16px block: exact for nearest-
      // neighbour upscales, tolerant of a 1px shift
      // from a re-encode.
      const x = x0 + sx * 16 + 8;
      const y = y0 + sy * 16 + 8;
      out[sy * SOURCE_SIZE + sx] = [...sheet[y * sheetWidth + x]];
    }
  }
  return out;
}

/** Read one glyph from the header strip, at character index `i`. */
function readGlyph(
  sheet: readonly RGB[],
  sheetWidth: number,
  i: number,
): string | null {
  const scale = SPRITE_SHEET_HEADER_SCALE;
  const advance = (GLYPH_WIDTH + 1) * scale;
  const glyphH = GLYPH_HEIGHT * scale;
  const y0 = Math.floor((SPRITE_SHEET_HEADER_HEIGHT - glyphH) / 2);
  const x0 = 16 + i * advance;
  const rows: string[] = [];
  for (let gy = 0; gy < GLYPH_HEIGHT; gy += 1) {
    let row = '';
    for (let gx = 0; gx < GLYPH_WIDTH; gx += 1) {
      // Centre of the scaled cell: tolerant of a 1px shift.
      const x = x0 + gx * scale + Math.floor(scale / 2);
      const y = y0 + gy * scale + Math.floor(scale / 2);
      const p = sheet[y * sheetWidth + x];
      const on = p[0] > 128 && p[1] > 128 && p[2] > 128;
      row += on ? '#' : '.';
    }
    rows.push(row);
  }
  const blank = '.....';
  if (rows.every(r => r === blank)) {
    return ' ';
  }
  for (const [char, glyph] of Object.entries(GLYPHS)) {
    if (glyph.every((r, j) => r === rows[j])) {
      return char;
    }
  }
  return null;
}

function readHeaderText(
  sheet: readonly RGB[],
  sheetWidth: number,
): string | null {
  const advance = (GLYPH_WIDTH + 1) * SPRITE_SHEET_HEADER_SCALE;
  const maxChars = Math.floor((sheetWidth - 32) / advance);
  let text = '';
  for (let i = 0; i < maxChars; i += 1) {
    const char = readGlyph(sheet, sheetWidth, i);
    if (char === null) {
      return null;
    }
    text += char;
  }
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function importSpriteSheet(png: DecodedPng): ImportedSheet {
  const {width, height, pixels} = png;
  if (width !== SPRITE_SHEET_COLUMNS * EXPORT_SIZE) {
    throw new Error(
      `This is not a sprite sheet from this app: expected width 1280, got ${width}.`,
    );
  }
  const hasHeader = height % EXPORT_SIZE === SPRITE_SHEET_HEADER_HEIGHT;
  const tileHeight = height - (hasHeader ? SPRITE_SHEET_HEADER_HEIGHT : 0);
  if (
    (!hasHeader && height % EXPORT_SIZE !== 0) ||
    tileHeight <= 0 ||
    tileHeight % EXPORT_SIZE !== 0
  ) {
    throw new Error(
      `This is not a sprite sheet from this app: expected height 256, 512, 320 or 576, got ${height}.`,
    );
  }
  if (pixels.length !== width * height) {
    throw new Error(
      `This is not a sprite sheet from this app: expected ${
        width * height
      } pixels for a ${width}x${height} image, got ${pixels.length}.`,
    );
  }
  const rows = tileHeight / EXPORT_SIZE;
  if (rows > 2) {
    throw new Error(
      `This is not a sprite sheet from this app: ${rows} rows, at most 2.`,
    );
  }
  const name = hasHeader
    ? (readHeaderText(pixels, width) ?? png.text.Title ?? null)
    : (png.text.Title ?? null);
  const tiles: RGB[][] = [];
  const headerHeight = hasHeader ? SPRITE_SHEET_HEADER_HEIGHT : 0;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < SPRITE_SHEET_COLUMNS; c += 1) {
      const tile = downscaleTile(
        pixels,
        width,
        c * EXPORT_SIZE,
        headerHeight + r * EXPORT_SIZE,
      );
      tiles.push(tile);
    }
  }
  // Drop trailing all-black cells: the empty cells at
  // the end of the last row. Interior black tiles stay.
  while (tiles.length > 0 && isBlack(tiles[tiles.length - 1])) {
    tiles.pop();
  }
  if (tiles.length === 0) {
    throw new Error('This sprite sheet has no images in it.');
  }
  return {name, items: tiles};
}
