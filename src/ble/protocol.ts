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
// Slideshow-indexed write (0x02 family, SpawnDev only) — UNPROVEN.
// ---------------------------------------------------------------------------
// The plain save appends: the Nov 8, 2026 Lamp device test
// proved each lamp colour becomes another slideshow image,
// so the panel cycles all of them. The stock Lamplight tab
// does not do that — one static colour, applied in about a
// second, no disconnect — so it writes a slot, not an append.
// SpawnDev's library is the only source for a slot write:
//   BC 02 F1 <count> CRC 55   (slideshow image write enable)
//   BC 02 <index> <chunk 1-8> + 96 RGB bytes + CRC 55
//   BC 02 07 3C CRC 55         (marker, sent when index == count)
//   BC 02 F2 <count> CRC 55   (slideshow image write disable)
// and their save flow brackets the 0x02 writes with the 0x11
// static-write enable/disable, after a Reset. The Lamp slot
// test keeps the brackets, drops the Reset (Reset is what
// drops the link and forces the reconnect scan), and writes
// index 1 of a 1-image set: if count declares the set size,
// each new colour replaces the set instead of appending.
// Checksum rule here is SpawnDev's plain truncated sum of
// the bytes after BC — the same rule as the proven stored
// blocks. Device-proven Nov 8, 2026: the slot save's plain-sum
// 0x02 writes were accepted (the colour appeared at the end
// of the cycle), so the sum+1 variation is dead. Chunk
// checksum: sum of 0x02 + index + chunk + 96 pixel bytes,
// mod 256 (plain sum, like stored blocks).
// Timings follow SpawnDev: 5 ms between 0x02 writes, 50 ms
// after the 0x11 bracket commands.

/** Slideshow image write enable: BC 02 F1 <count> CRC 55. */
export function slideShowImageWriteEnableCommand(count: number): number[] {
  const c = clampByte(count, 'count');
  return [0xbc, 0x02, 0xf1, c, (0x02 + 0xf1 + c) % 256, 0x55];
}

/** Slideshow image write disable: BC 02 F2 <count> CRC 55. */
export function slideShowImageWriteDisableCommand(count: number): number[] {
  const c = clampByte(count, 'count');
  return [0xbc, 0x02, 0xf2, c, (0x02 + 0xf2 + c) % 256, 0x55];
}

/** Slideshow marker: BC 02 07 3C 45 55. */
export function slideShowMarkerCommand(): number[] {
  return [0xbc, 0x02, 0x07, 0x3c, 0x45, 0x55];
}

/**
 * One slideshow-image chunk (102 bytes): BC 02 <index> <chunk 1-8>
 * + 96 RGB bytes + checksum + 55. Each chunk covers 32 pixels =
 * 2 rows, same split as the live and stored blocks.
 */
export function slideShowImageWriteChunkCommand(
  imageIndex: number,
  chunkIndex: number,
  blockPixels: readonly RGB[],
): number[] {
  if (!Number.isInteger(chunkIndex) || chunkIndex < 1 || chunkIndex > 8) {
    throw new Error(`chunkIndex must be 1-8, got ${chunkIndex}`);
  }
  if (blockPixels.length !== BLOCK_PIXEL_COUNT) {
    throw new Error(
      `blockPixels must contain exactly 32 pixels, got ${blockPixels.length}`,
    );
  }
  const index = clampByte(imageIndex, 'imageIndex');
  const out: number[] = [0xbc, 0x02, index, chunkIndex];
  let sum = 0x02 + index + chunkIndex;
  for (const [r, g, b] of blockPixels) {
    out.push(clampByte(r, 'r'), clampByte(g, 'g'), clampByte(b, 'b'));
    sum += clampByte(r, 'r') + clampByte(g, 'g') + clampByte(b, 'b');
  }
  out.push(sum % 256, 0x55);
  return out;
}

/**
 * The Lamp slot-save sequence (14 commands): 0x11 enable,
 * 0x02 enable(1), 8 chunks of image index 1, marker,
 * 0x02 disable(1), 0x11 disable, slideshow mode. No Reset.
 */
export function lampSlotSaveCommands(pixels: PixelGrid): number[][] {
  if (pixels.length !== PIXEL_COUNT) {
    throw new Error(
      `pixels must contain exactly 256 RGB tuples, got ${pixels.length}`,
    );
  }
  const commands: number[][] = [
    saveOpenCommand(),
    slideShowImageWriteEnableCommand(1),
  ];
  for (let block = 0; block < BLOCK_COUNT; block++) {
    commands.push(
      slideShowImageWriteChunkCommand(
        1,
        block + 1,
        pixels.slice(block * 32, block * 32 + 32),
      ),
    );
  }
  commands.push(
    slideShowMarkerCommand(),
    slideShowImageWriteDisableCommand(1),
    saveCloseCommand(),
    slideshowCommand(),
  );
  return commands;
}

/**
 * The Lamp all-slots sequence (70 commands): the same colour
 * written to all 8 slots, count 8, indices 1-8. The slot save
 * proved a count-1 write appends — the colour appeared at the
 * end of the cycle — so a single slot cannot make the panel
 * static. SpawnDev's own save flow always writes exactly 8
 * images, count 8, indices 1-8, after a Reset; this is that
 * transfer without the Reset. If a full 8-image transfer
 * defines the set, the whole cycle is one colour and reads
 * as static. If it appends instead, the cycle still shows
 * old images and the lamp mechanism is something else
 * entirely — a live send, or a dedicated command only a
 * capture of the stock app will show.
 */
export function lampAllSlotsCommands(pixels: PixelGrid): number[][] {
  if (pixels.length !== PIXEL_COUNT) {
    throw new Error(
      `pixels must contain exactly 256 RGB tuples, got ${pixels.length}`,
    );
  }
  const commands: number[][] = [
    saveOpenCommand(),
    slideShowImageWriteEnableCommand(8),
  ];
  for (let image = 1; image <= 8; image++) {
    for (let block = 0; block < BLOCK_COUNT; block++) {
      commands.push(
        slideShowImageWriteChunkCommand(
          image,
          block + 1,
          pixels.slice(block * 32, block * 32 + 32),
        ),
      );
    }
  }
  commands.push(
    slideShowMarkerCommand(),
    slideShowImageWriteDisableCommand(8),
    saveCloseCommand(),
    slideshowCommand(),
  );
  return commands;
}
