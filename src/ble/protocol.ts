/**
 * BLE protocol for the Merkury Innovations Matrix LED Display (MI-LNL62-999W).
 *
 * Pure byte builders only — no BLE transport in this file, so it is fully
 * unit-testable without a device. Ported from the Python scripts in the repo
 * root: draw_picture.py, draw_pixels.py, draw_file.py, and protocol.txt.
 *
 * Device: "MI Matrix Display"
 * Service:        0000ffd0-0000-1000-8000-00805f9b34fb
 * Characteristic: 0000ffd1-0000-1000-8000-00805f9b34fb
 * Every command starts with 0xBC and ends with 0x55.
 */

export const DEVICE_NAME = 'MI Matrix Display';
export const SERVICE_UUID = '0000ffd0-0000-1000-8000-00805f9b34fb';
export const CHARACTERISTIC_UUID = '0000ffd1-0000-1000-8000-00805f9b34fb';

export const GRID_SIZE = 16;
export const PIXEL_COUNT = GRID_SIZE * GRID_SIZE; // 256
export const BLOCK_PIXEL_COUNT = 32;
export const BLOCK_COUNT = 8;

export type RGB = readonly [number, number, number];
export type PixelGrid = readonly RGB[]; // exactly 256 entries, row-major

export function bytesToHex(bytes: readonly number[]): string {
  return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): number[] {
  const clean = hex.replace(/\s+/g, '');
  if (clean.length % 2 !== 0) {
    throw new Error(`hex string must have an even length: ${hex}`);
  }
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    out.push(parseInt(clean.slice(i, i + 2), 16));
  }
  return out;
}

function clampByte(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new Error(`${name} must be an integer 0-255, got ${value}`);
  }
  return value;
}

/** Power on: BC FF 01 00 55 (protocol.txt). */
export function powerOnCommand(): number[] {
  return [0xbc, 0xff, 0x01, 0x00, 0x55];
}

/** Power off: BC FF 00 FF 55 (protocol.txt) — the display goes black. */
export function powerOffCommand(): number[] {
  return [0xbc, 0xff, 0x00, 0xff, 0x55];
}

/** Graffiti-mode init pair, in order: BC 00 01 01 55, BC 00 0D 0D 55. */
export function graffitiInitCommands(): number[][] {
  return [
    [0xbc, 0x00, 0x01, 0x01, 0x55],
    [0xbc, 0x00, 0x0d, 0x0d, 0x55],
  ];
}

/** Slideshow mode: BC 00 12 12 55 (protocol.txt). */
export function slideshowCommand(): number[] {
  return [0xbc, 0x00, 0x12, 0x12, 0x55];
}

/**
 * Single-pixel command: BC 01 01 00 PP RR GG BB QQ 55.
 *
 * QQ is PP - 1 modulo 256 (so PP = 0 gives QQ = 0xFF, matching the
 * protocol.txt example: red top-left is BC 01 01 00 00 FF 00 00 FF 55).
 *
 * DISCREPANCY, UNTESTED ON HARDWARE: draw_pixels.py and draw_plasma.py
 * actually compute QQ as (PP + 1) % 256 with a special case 0 -> 0xFF,
 * which disagrees with protocol.txt's "PP - 1" for every PP > 0 (e.g. PP = 1
 * gives QQ = 2 in Python, QQ = 0 here). This port follows protocol.txt,
 * because it matches the only worked example. Do not trust single-pixel
 * writes beyond pixel 0 until the PP = 1 case is verified against the real
 * display. Full-picture blocks (below) are the primary, verified path.
 */
export function singlePixelCommand(
  pixelIndex: number,
  r: number,
  g: number,
  b: number,
): number[] {
  const pp = clampByte(pixelIndex, 'pixelIndex');
  const qq = (pp + 255) % 256; // PP - 1 mod 256; 0 -> 0xFF
  return [
    0xbc,
    0x01,
    0x01,
    0x00,
    pp,
    clampByte(r, 'r'),
    clampByte(g, 'g'),
    clampByte(b, 'b'),
    qq,
    0x55,
  ];
}

/** Full-picture init: BC 0F F1 08 08 55 (draw_picture.py). */
export function fullPictureInitCommand(): number[] {
  return [0xbc, 0x0f, 0xf1, 0x08, 0x08, 0x55];
}

/** Full-picture end: BC 0F F2 08 09 55 (draw_picture.py). */
export function fullPictureEndCommand(): number[] {
  return [0xbc, 0x0f, 0xf2, 0x08, 0x09, 0x55];
}

/**
 * One full-picture block (100 bytes): BC 0F <block 1-8> + 96 RGB bytes + 55.
 * Each block covers 32 pixels = 2 rows of the 16x16 grid.
 */
export function fullPictureBlockCommand(
  blockIndex: number,
  blockPixels: readonly RGB[],
): number[] {
  if (!Number.isInteger(blockIndex) || blockIndex < 0 || blockIndex > 7) {
    throw new Error(`blockIndex must be 0-7, got ${blockIndex}`);
  }
  if (blockPixels.length !== BLOCK_PIXEL_COUNT) {
    throw new Error(
      `blockPixels must contain exactly 32 pixels, got ${blockPixels.length}`,
    );
  }
  const out: number[] = [0xbc, 0x0f, blockIndex + 1];
  for (const [r, g, b] of blockPixels) {
    out.push(clampByte(r, 'r'), clampByte(g, 'g'), clampByte(b, 'b'));
  }
  out.push(0x55);
  return out;
}

/**
 * The complete live full-picture sequence: init, 8 blocks, end
 * (10 commands, 812 bytes). This is the live format from draw_picture.py.
 * Do not add a checksum here — see storedPictureBlockCommand.
 */
export function fullPictureCommands(pixels: PixelGrid): number[][] {
  if (pixels.length !== PIXEL_COUNT) {
    throw new Error(
      `pixels must contain exactly 256 RGB tuples, got ${pixels.length}`,
    );
  }
  const commands: number[][] = [fullPictureInitCommand()];
  for (let block = 0; block < BLOCK_COUNT; block++) {
    commands.push(
      fullPictureBlockCommand(block, pixels.slice(block * 32, block * 32 + 32)),
    );
  }
  commands.push(fullPictureEndCommand());
  return commands;
}

// ---------------------------------------------------------------------------
// Stored-image format (from snoops/store_image_commands.txt) — NOT live.
// ---------------------------------------------------------------------------
// The official app's stored-image blocks are 101 bytes, not 100: they append
// a checksum byte before the 0x55 terminator. The checksum is the sum of
// every byte after the leading 0xBC (i.e. 0x0F, the block number, and the
// 96 pixel bytes), modulo 256. Example, first stored block:
//   BC 0F 01 <96 pixel bytes> 10 55  (pixel sum 0x00, + 0x0F + 0x01 = 0x10)
// The Python live blocks are 100 bytes with no checksum and are what this
// app sends for live display. Do not silently change the live format to the
// stored format; the stored format is only for a future save-to-device
// feature, and it still needs a hardware check before use.

export function storedPictureChecksum(
  blockIndex: number,
  blockPixels: readonly RGB[],
): number {
  if (!Number.isInteger(blockIndex) || blockIndex < 0 || blockIndex > 7) {
    throw new Error(`blockIndex must be 0-7, got ${blockIndex}`);
  }
  let sum = 0x0f + (blockIndex + 1);
  for (const [r, g, b] of blockPixels) {
    sum += clampByte(r, 'r') + clampByte(g, 'g') + clampByte(b, 'b');
  }
  return sum % 256;
}

/** A 101-byte stored-image block: header + 96 RGB bytes + checksum + 0x55. */
export function storedPictureBlockCommand(
  blockIndex: number,
  blockPixels: readonly RGB[],
): number[] {
  const live = fullPictureBlockCommand(blockIndex, blockPixels);
  const checksum = storedPictureChecksum(blockIndex, blockPixels);
  // live is [...header, ...pixels, 0x55]; insert checksum before terminator.
  return [...live.slice(0, -1), checksum, 0x55];
}

// ---------------------------------------------------------------------------
// Save-single test (Oct 30, 2026) — NO Reset, NO slideshow.
// ---------------------------------------------------------------------------
// Stock-app save sequence, as captured in snoops/saves_to_device.txt
// (one save, verbatim): open, live init, 8 stored blocks, live end,
// close, then slideshow. This test reproduces everything EXCEPT the
// Reset and the trailing slideshow, to isolate what saving alone does:
//   BC 00 11 F1 03 55   (open — stock-snoop bytes, see below)
//   BC 0F F1 08 08 55   (live init, same as a live picture)
//   8 × stored blocks (101 bytes each, checksum format above)
//   BC 0F F2 08 09 55   (live end)
//   BC 00 11 F2 04 55   (close)
// Deliberately NOT sent here:
//   - BC 00 15 15 55 (Reset saved data, per SpawnDev's label): this
//     test is the no-Reset variant, so the existing stored set must
//     survive. If saving appends (as the snoops suggest), the panel
//     will cycle old + new after ~5 min, not hold the new image —
//     that outcome is the test result, not a failure of the build.
//   - BC 00 12 12 55 (slideshow): adding it would conflate "save
//     holds" with "slideshow mode displays the saved set". If save
//     alone does not hold past ~5 min, the next test adds slideshow
//     (and, separately, Reset) as its own axis.
// Trailing-byte discrepancy, resolved in favour of the snoop: the
// truncated-sum CRC (00+11+F1 = 0x02, 00+11+F2 = 0x03) would give
// BC 00 11 F1 02 55 / BC 00 11 F2 03 55, which is what SpawnDev's
// code would send — but the stock app actually sends 03 / 04
// (sum+1). This builder sends the stock bytes, not the computed CRC,
// because the stock bytes are what the panel has demonstrably
// accepted. Do not "fix" them to 02/03 without a device test.

/** Save open: BC 00 11 F1 03 55 (stock snoop, sum+1 trailing byte). */
export function saveOpenCommand(): number[] {
  return [0xbc, 0x00, 0x11, 0xf1, 0x03, 0x55];
}

/** Save close: BC 00 11 F2 04 55 (stock snoop, sum+1 trailing byte). */
export function saveCloseCommand(): number[] {
  return [0xbc, 0x00, 0x11, 0xf2, 0x04, 0x55];
}

/**
 * The complete no-Reset save-single sequence: open, init, 8 stored
 * blocks, end, close (12 commands, 832 bytes). Same pixels as a live
 * picture, in the stored (checksum) block format — not a live send
 * followed by a save, and not a slideshow entry.
 */
export function savedPictureCommands(pixels: PixelGrid): number[][] {
  if (pixels.length !== PIXEL_COUNT) {
    throw new Error(
      `pixels must contain exactly 256 RGB tuples, got ${pixels.length}`,
    );
  }
  const commands: number[][] = [saveOpenCommand(), fullPictureInitCommand()];
  for (let block = 0; block < BLOCK_COUNT; block++) {
    commands.push(
      storedPictureBlockCommand(block, pixels.slice(block * 32, block * 32 + 32)),
    );
  }
  commands.push(fullPictureEndCommand(), saveCloseCommand());
  return commands;
}

// ---------------------------------------------------------------------------
// Reset + save-single test (Oct 30, 2026) — DESTRUCTIVE, test only.
// ---------------------------------------------------------------------------
// This is the wipe test the no-Reset save test gated: the earlier
// save-single test PROVED saving appends (1 -> 2 -> 3 cycle), so a
// single image can only be static if the stored set is cleared first.
// SpawnDev labels BC 00 15 15 55 "Reset the display saved data" and
// starts both its save flows with it; the stock snoops send 0x15
// standalone adjacent to slideshow commands. That label is still
// UNPROVEN — this test is what proves or refutes it. If 0x15 does
// not wipe, the panel after this test will still cycle the old
// images (plus the new one); if it does wipe, only the new image
// will remain. Sequence, mirroring the no-Reset save test exactly
// except for the leading Reset, and with NO slideshow at the end
// (so a hold cannot be credited to slideshow mode):
//   BC 00 15 15 55   (Reset — candidate wipe)
//   BC 00 11 F1 03 55 + init + 8 stored blocks + end + close
// WARNING: if Reset works as labelled, this erases every image
// currently saved on the panel. Do not run it on a set you want
// to keep unless you can re-save those images afterwards.

/** Reset saved data (candidate): BC 00 15 15 55. UNPROVEN label. */
export function resetCommand(): number[] {
  return [0xbc, 0x00, 0x15, 0x15, 0x55];
}

/**
 * Reset + save-single sequence: Reset, then the full no-Reset
 * save-single sequence (13 commands, 838 bytes). No slideshow.
 */
export function resetSavedPictureCommands(pixels: PixelGrid): number[][] {
  return [resetCommand(), ...savedPictureCommands(pixels)];
}

// ---------------------------------------------------------------------------
// Mode protocol (PacketLogger, Nov 8-9, 2026) — the stock app's
// Lamplight and Light effect commands. SUPERSEDES the 0x02
// family that used to live here: the stock app never sends
// 0x0F/0x02/0x11 for Mode features. Two traces (246 writes,
// 3,574 writes) contain zero 0x0F, 0x02, or 0x11 commands.
// The panel generates the animation itself from a palette
// + effect number + speed + brightness; the app sends no
// frames, and there is no slideshow to send.
// ---------------------------------------------------------------------------
// Commands, all plain truncated-sum checksums (sum of the
// bytes after BC, mod 256). Verified against the traces:
// 219/219 live writes in the first trace, 3,556/3,574 in
// the narrated trace — the only failures are a stale
// preamble replay the panel tolerates (e.g. the 0A 01 04
// with ck 0x00; the live select is ck 0x0F).
//   BC 00 0B 0B 55                  lamp mode select
//   BC 00 0A 0A 55                  effect mode select
//   BC 0B <R> <G> <B> CK 55         solid lamp colour (one write)
//   BC 0A 01 <n> CK 55              select effect n (1-7)
//   BC 0A 02 <count> <RGBs> CK 55   palette (count 1-7)
//   BC 0A 07 <speed> CK 55          speed percent (0-100)
//   BC 00 10 <value> CK 55          brightness percent (0-100)
// Brightness confirmed by the narrated video (Nov 9, 2026):
// the 00 10 values match the brightness slider at the
// synced times (28~29%, 76~77%, 80~81%, 38~39% in
// Lamplight; 39, 77, 48 in Light effect). Speed confirmed
// the same way (0A 07 values 52, 80, 81, 43 match the
// speed slider). The sun/moon row sends no distinct
// command; the heart favourite is app-side only.

/** Lamp mode select: BC 00 0B 0B 55. */
export function lampModeCommand(): number[] {
  return [0xbc, 0x00, 0x0b, 0x0b, 0x55];
}

/** Effect mode select: BC 00 0A 0A 55. */
export function effectModeCommand(): number[] {
  return [0xbc, 0x00, 0x0a, 0x0a, 0x55];
}

/**
 * Solid lamp colour: BC 0B <R> <G> <B> CK 55, plain-sum
 * checksum. One 7-byte write — the whole lamp save.
 * Red: 0B+FF = 0A, matching the trace's BC 0B FF 00 00
 * 0A 55.
 */
export function solidColourCommand(
  r: number,
  g: number,
  b: number,
): number[] {
  const rr = clampByte(r, 'r');
  const gg = clampByte(g, 'g');
  const bb = clampByte(b, 'b');
  return [0xbc, 0x0b, rr, gg, bb, (0x0b + rr + gg + bb) % 256, 0x55];
}

/**
 * Select effect n (1-7): BC 0A 01 <n> CK 55, plain-sum
 * checksum. Effect 1: 0A+01+01 = 0C; effect 4: 0F;
 * effect 7: 12 — all matching the narrated trace's
 * live selects. (The preamble's 0A 01 04 with ck 0x00
 * is a stale replay, not the live value.)
 */
export function effectSelectCommand(effectNumber: number): number[] {
  if (!Number.isInteger(effectNumber) || effectNumber < 1 || effectNumber > 7) {
    throw new Error(`effectNumber must be 1-7, got ${effectNumber}`);
  }
  return [
    0xbc,
    0x0a,
    0x01,
    effectNumber,
    (0x0a + 0x01 + effectNumber) % 256,
    0x55,
  ];
}

/**
 * Palette: BC 0A 02 <count> <count RGB triples> CK 55,
 * plain-sum checksum. The stock app sends a fresh
 * palette on every small drag movement (3,399 distinct
 * palettes in the narrated trace), so this is the
 * live-update write. Rainbow's 7-colour palette
 * (red, orange, yellow, green, blue, magenta, white)
 * checksums to 0xAA, matching the trace.
 */
export function paletteCommand(palette: readonly RGB[]): number[] {
  if (palette.length < 1 || palette.length > 7) {
    throw new Error(
      `palette must contain 1-7 colours, got ${palette.length}`,
    );
  }
  const out: number[] = [0xbc, 0x0a, 0x02, palette.length];
  let sum = 0x0a + 0x02 + palette.length;
  for (const [r, g, b] of palette) {
    out.push(clampByte(r, 'r'), clampByte(g, 'g'), clampByte(b, 'b'));
    sum += clampByte(r, 'r') + clampByte(g, 'g') + clampByte(b, 'b');
  }
  out.push(sum % 256, 0x55);
  return out;
}

/**
 * Speed: BC 0A 07 <speed> CK 55, plain-sum checksum.
 * Speed 50: 0A+07+32 = 43, matching the trace.
 */
export function speedCommand(speed: number): number[] {
  const s = clampByte(speed, 'speed');
  return [0xbc, 0x0a, 0x07, s, (0x0a + 0x07 + s) % 256, 0x55];
}

/**
 * Brightness: BC 00 10 <value> CK 55, plain-sum
 * checksum. Value 28: 10+1C = 2C; value 80: 10+50
 * = 60 — both matching the trace.
 */
export function brightnessCommand(value: number): number[] {
  const v = clampByte(value, 'brightness');
  return [0xbc, 0x00, 0x10, v, (0x00 + 0x10 + v) % 256, 0x55];
}
