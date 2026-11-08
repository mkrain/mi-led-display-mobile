import type {RGB} from '../conversion/convert';
import {applyBrightness} from '../lamp/lamp';

/**
 * Light effect frame generators (Nov 8, 2026).
 *
 * The stock Mode tab's Light effect page has 7 swipeable
 * presets. Each preset is a 16x16 pattern that animates;
 * the panel keeps playing it with the app closed, so the
 * stock app stores it — and the only way this panel
 * stores motion is a slideshow of frames cycling. The
 * panel videos Jeremiah recorded give the motion at
 * 50% speed, measured by sampling a frame a second and
 * finding the shift that best aligns consecutive frames:
 *
 *   1 Rainbow bands: scroll down 2 rows/sec, loop 8s
 *   2 Sparse confetti: random twinkle in place
 *   3 Purple field + white speckles: slow twinkle
 *   4 Vertical bands (4 colours): scroll right ~4.5 cols/sec
 *   5 Diagonal stripes: scroll diagonally, fastest
 *   6 Diagonal rainbow: bands advance one hue step/sec
 *   7 Full confetti: every pixel re-randomizes each second
 *
 * Direction note, Nov 8, 2026: the first build read the
 * shift analysis backwards — the aligning roll is the
 * inverse of the motion, not the motion itself — so
 * rainbow and bands shipped scrolling the wrong way
 * (up and left). Jeremiah reported the rainbow bands
 * travel row 1 to row 16, like a train, and a re-run
 * with the sign fixed confirms down 2 rows/sec for
 * rainbow and right ~4.5 cols/sec for bands. The
 * diagonal effects cannot be pinned down that way
 * (their patterns alias), so their direction is the
 * best reading of the hue advance, not a measurement.
 *
 * Effect 1's loop is 8 seconds, and frames 8 seconds
 * apart are near-identical, so the save is 8 frames at
 * the panel's ~1s-per-frame cycle (SpawnDev's count).
 * Effect 4's loop reads closer to 6s, which does not
 * fit that model cleanly — effect 1 is the pilot and
 * 4 gets calibrated against the device, not guessed.
 *
 * Generators produce the PREVIEW orientation — the
 * grid as the stock app's preview shows it. The stock
 * app sends the grid rotated 90 degrees clockwise
 * (Jeremiah, Nov 8, 2026: photos sent as slideshows
 * are the correct orientation, so the rotation is
 * specific to the effect rendering, not the panel).
 * The send path applies that rotation by default, and
 * the user can rotate to any quarter turn instead.
 *
 * Speed: the rates above are at 50%. The speed slider
 * scales them — a scrolling step is baseStep times
 * speed/50, and a random effect re-randomizes that
 * fraction of its cells per frame. At speed 0 the
 * effect is static.
 *
 * Frames are deterministic: a seeded PRNG keyed by
 * effect and frame index, so the preview and the save
 * show the same animation.
 */

export type Grid = RGB[]; // 256 entries, row-major

export const EFFECT_FRAME_COUNT = 8;

/**
 * The palette cap for every effect (Nov 8, 2026,
 * Jeremiah): 7 colours for all of them. The stock
 * app shows 6 colours and no + button for effects 1
 * and 4, which looks like a cap of 6 — but deleting
 * a default colour there brings the + back and lets
 * you add up to 7, so 6 is only the default size,
 * not a real cap. We normalize at 7 rather than
 * copying the stock app's inconsistency.
 */
export const MAX_PALETTE_COLORS = 7;

export interface EffectParams {
  palette: RGB[];
  brightness: number; // 0-100
  speed: number; // 0-100, 50 is the measured reference
}

export interface EffectDef {
  id: string;
  name: string;
  defaultPalette: RGB[];
  /** False for the random effects: reversing their frame order is invisible. */
  hasDirection: boolean;
  /** The frame sequence, preview orientation, brightness applied. */
  frames(params: EffectParams, count: number): Grid[];
}

/** Speed factor: 1 at the 50% reference point. */
export function speedFactor(speed: number): number {
  return Math.min(100, Math.max(0, speed)) / 50;
}

/** mulberry32: small deterministic PRNG for seeded frames.
 * Bitwise ops are the whole implementation, so the rule
 * is off for this function only. */
/* eslint-disable no-bitwise */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* eslint-enable no-bitwise */

function blank(): Grid {
  return Array.from({length: 256}, () => [0, 0, 0] as RGB);
}

function withBrightness(grid: Grid, brightness: number): Grid {
  return grid.map(c => applyBrightness(c, brightness));
}

/** Rotate a grid clockwise by the given quarter turns (0-3). */
export function rotateGrid(grid: Grid, quarters: number): Grid {
  const q = ((quarters % 4) + 4) % 4;
  if (q === 0) {
    return grid.map(c => [...c] as RGB);
  }
  const out: Grid = blank();
  for (let r = 0; r < 16; r++) {
    for (let c = 0; c < 16; c++) {
      const src = grid[r * 16 + c];
      let dr = r;
      let dc = c;
      if (q === 1) {
        dr = c;
        dc = 15 - r;
      } else if (q === 2) {
        dr = 15 - r;
        dc = 15 - c;
      } else {
        dr = 15 - c;
        dc = r;
      }
      out[dr * 16 + dc] = [...src] as RGB;
    }
  }
  return out;
}

/**
 * The frame list for a save or a preview run: the
 * effect's frames, each rotated by the chosen quarter
 * turns, and reversed when the user asked for reverse.
 * Rotation is applied per frame; reverse flips the
 * frame order, which reverses the motion on every
 * effect that has a direction.
 */
export function effectFrames(
  def: EffectDef,
  params: EffectParams,
  count: number,
  quarters: number,
  reverse: boolean,
): Grid[] {
  const frames = def.frames(params, count).map(f => rotateGrid(f, quarters));
  return reverse ? frames.reverse() : frames;
}

const RED: RGB = [255, 0, 0];
const ORANGE: RGB = [255, 152, 0];
const YELLOW: RGB = [255, 255, 0];
const GREEN: RGB = [0, 255, 0];
const BLUE: RGB = [0, 0, 255];
const MAGENTA: RGB = [255, 0, 255];
const WHITE: RGB = [255, 255, 255];
const PURPLE: RGB = [154, 110, 255];

const RAINBOW6: RGB[] = [RED, ORANGE, YELLOW, GREEN, BLUE, MAGENTA];

/**
 * 1 Rainbow: vertical hue bands (preview orientation),
 * scrolling right at 2 columns per frame at 50%. After
 * the default 90-degree clockwise rotation the panel
 * shows horizontal bands scrolling down at 2 rows/sec
 * — a colour travels row 1 to row 16, the rest of the
 * cycle following like a train (Jeremiah, Nov 8, 2026).
 *
 * The cycle is the 6 palette colours plus a fixed
 * white step: the stock palette holds 6 colours and
 * shows no + button, but the rendered pattern has a
 * seventh, white band — it is in the panel video and
 * the stock preview fades to pale at its right edge —
 * so white is part of the effect, not a palette colour
 * the user edits.
 */
function rainbowFrames(params: EffectParams, count: number): Grid[] {
  const step = 2 * speedFactor(params.speed);
  const cycle = [...params.palette, WHITE];
  const out: Grid[] = [];
  for (let f = 0; f < count; f++) {
    const offset = Math.floor(f * step);
    const grid = blank();
    for (let r = 0; r < 16; r++) {
      for (let c = 0; c < 16; c++) {
        const idx =
          ((c - offset) % cycle.length + cycle.length) % cycle.length;
        grid[r * 16 + c] = [...(cycle[idx] ?? RED)] as RGB;
      }
    }
    out.push(withBrightness(grid, params.brightness));
  }
  return out;
}

/**
 * 2 Sparse confetti: about 64 lit cells on black, a
 * fresh seeded scatter each frame. The measured change
 * per second is about half of full confetti's, which is
 * what a quarter of the cells being lit gives. Speed
 * quantizes the frame index: at 50% every frame is a
 * new scatter, at 25% each scatter shows twice, at 0%
 * the effect is static.
 */
function sparseConfettiFrames(params: EffectParams, count: number): Grid[] {
  const out: Grid[] = [];
  for (let f = 0; f < count; f++) {
    const feff = Math.floor(f * speedFactor(params.speed));
    const rng = mulberry32(0x2c01 + feff * 2654435761);
    const grid = blank();
    const lit = new Set<number>();
    while (lit.size < 64) {
      lit.add(Math.floor(rng() * 256));
    }
    for (const i of lit) {
      grid[i] = [
        ...(params.palette[Math.floor(rng() * params.palette.length)] ??
          RED),
      ] as RGB;
    }
    out.push(withBrightness(grid, params.brightness));
  }
  return out;
}

/**
 * 3 Speckles: a solid field (first palette colour) with
 * about 25 white speckles that blink. Each speckle is
 * on with probability 0.7 per frame, so about 40% of
 * them change state per frame — the slow twinkle the
 * panel video shows. Speed quantizes the frame index
 * the same way as the confetti effects.
 */
function specklesFrames(params: EffectParams, count: number): Grid[] {
  const base = params.palette[0] ?? PURPLE;
  const rng = mulberry32(0x5eed);
  const positions: number[] = [];
  const seen = new Set<number>();
  while (positions.length < 25) {
    const p = Math.floor(rng() * 256);
    if (!seen.has(p)) {
      seen.add(p);
      positions.push(p);
    }
  }
  const out: Grid[] = [];
  for (let f = 0; f < count; f++) {
    const feff = Math.floor(f * speedFactor(params.speed));
    const grid = blank().map(() => [...base] as RGB);
    for (let i = 0; i < positions.length; i++) {
      const r = mulberry32(0x5eed + i * 97 + feff * 2654435761);
      if (r() < 0.7) {
        grid[positions[i]] = [...WHITE] as RGB;
      }
    }
    out.push(withBrightness(grid, params.brightness));
  }
  return out;
}

/**
 * 4 Bands: four colours in 4-row bands (preview
 * orientation), scrolling up at 4.5 rows per frame
 * at 50%. After the default rotation the panel shows
 * vertical bands scrolling right at ~4.5 cols/sec.
 *
 * The bands use only the first four palette colours:
 * the stock palette holds the same 6 as rainbow, but
 * the pattern shows four bands — red, orange, yellow,
 * green — so blue and magenta sit in the palette
 * without ever appearing in the pattern.
 */
function bandsFrames(params: EffectParams, count: number): Grid[] {
  const step = 4.5 * speedFactor(params.speed);
  const bandColors = params.palette.slice(0, 4);
  const out: Grid[] = [];
  for (let f = 0; f < count; f++) {
    const offset = f * step;
    const grid = blank();
    for (let r = 0; r < 16; r++) {
      const band = Math.floor((r + offset) / 4) % bandColors.length;
      const colour =
        bandColors[
          ((band % bandColors.length) + bandColors.length) % bandColors.length
        ] ?? RED;
      for (let c = 0; c < 16; c++) {
        grid[r * 16 + c] = [...colour] as RGB;
      }
    }
    out.push(withBrightness(grid, params.brightness));
  }
  return out;
}

/** Diagonal stripe index: bands run top-left to bottom-right. */
function diagonalIndex(r: number, c: number): number {
  return r - c;
}

/**
 * 5 Diagonal: red/white diagonal stripes, one band
 * (4 cells) wide, scrolling one band per frame at 50%
 * — the fastest of the set on the panel video.
 */
function diagonalFrames(params: EffectParams, count: number): Grid[] {
  const step = 4 * speedFactor(params.speed);
  const out: Grid[] = [];
  for (let f = 0; f < count; f++) {
    const offset = f * step;
    const grid = blank();
    for (let r = 0; r < 16; r++) {
      for (let c = 0; c < 16; c++) {
        const band =
          Math.floor((diagonalIndex(r, c) + offset) / 4) %
          params.palette.length;
        const colour =
          params.palette[
            ((band % params.palette.length) + params.palette.length) %
              params.palette.length
          ] ?? RED;
        grid[r * 16 + c] = [...colour] as RGB;
      }
    }
    out.push(withBrightness(grid, params.brightness));
  }
  return out;
}

/**
 * 6 Rainbow diagonal: diagonal bands in hue order,
 * advancing one band (one hue step) per frame at 50%.
 * Scrolling by one band width is the same look as
 * cycling the hues in place, since the bands are in
 * hue order — the panel video cannot distinguish them,
 * and the phase on device will say which it is. Same
 * mechanism as the plain diagonal, different palette.
 */
function rainbowDiagonalFrames(params: EffectParams, count: number): Grid[] {
  return diagonalFrames(params, count);
}

/**
 * 7 Full confetti: every cell a random palette colour,
 * re-randomized each frame. Speed quantizes the frame
 * index, as with the sparse confetti.
 */
function fullConfettiFrames(params: EffectParams, count: number): Grid[] {
  const out: Grid[] = [];
  for (let f = 0; f < count; f++) {
    const feff = Math.floor(f * speedFactor(params.speed));
    const rng = mulberry32(0x7c07 + feff * 2654435761);
    const grid = blank();
    for (let i = 0; i < 256; i++) {
      grid[i] = [
        ...(params.palette[Math.floor(rng() * params.palette.length)] ??
          RED),
      ] as RGB;
    }
    out.push(withBrightness(grid, params.brightness));
  }
  return out;
}

export const EFFECTS: EffectDef[] = [
  {
    id: 'rainbow',
    name: 'Rainbow',
    defaultPalette: RAINBOW6,
    hasDirection: true,
    frames: rainbowFrames,
  },
  {
    id: 'sparse-confetti',
    name: 'Confetti',
    defaultPalette: [RED, ORANGE, YELLOW, GREEN, BLUE],
    hasDirection: false,
    frames: sparseConfettiFrames,
  },
  {
    id: 'speckles',
    name: 'Speckles',
    defaultPalette: [PURPLE, MAGENTA],
    hasDirection: false,
    frames: specklesFrames,
  },
  {
    id: 'bands',
    name: 'Bands',
    defaultPalette: RAINBOW6,
    hasDirection: true,
    frames: bandsFrames,
  },
  {
    id: 'diagonal',
    name: 'Diagonal',
    defaultPalette: [RED, WHITE],
    hasDirection: true,
    frames: diagonalFrames,
  },
  {
    id: 'rainbow-diagonal',
    name: 'Rainbow diagonal',
    defaultPalette: [RED, ORANGE, YELLOW, GREEN, BLUE],
    hasDirection: true,
    frames: rainbowDiagonalFrames,
  },
  {
    id: 'full-confetti',
    name: 'Full confetti',
    defaultPalette: [RED, ORANGE, YELLOW, GREEN, BLUE, MAGENTA],
    hasDirection: false,
    frames: fullConfettiFrames,
  },
];

/**
 * Swipe navigation (Nov 8, 2026, Jeremiah): swiping
 * the preview left or right changes the effect, and
 * it wraps — past the last effect comes the first,
 * and before the first comes the last.
 */
export function nextEffectIndex(index: number): number {
  return (index + 1) % EFFECTS.length;
}

export function prevEffectIndex(index: number): number {
  return (index - 1 + EFFECTS.length) % EFFECTS.length;
}

/**
 * The palette the preview and the palette row show
 * (Nov 8, 2026): the committed palette with the
 * selected entry replaced by the working colour. The
 * hue strip sets the working colour only — it never
 * overwrites a palette entry — so the preview stays
 * live while the committed palette is only changed
 * by + and the trash. + appends the working colour
 * as a new dot; saving commits this palette.
 */
export function effectivePalette(
  palette: RGB[],
  selectedIndex: number,
  color: RGB,
): RGB[] {
  if (selectedIndex < 0 || selectedIndex >= palette.length) {
    return [...palette];
  }
  const next = [...palette];
  next[selectedIndex] = color;
  return next;
}
