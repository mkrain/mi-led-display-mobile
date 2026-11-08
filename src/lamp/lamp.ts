import type {RGB} from '../conversion/convert';

/**
 * Lamplight (Nov 8, 2026): one solid colour across the
 * whole panel, saved as a single-image slideshow.
 *
 * The stock app's Lamplight tab is a colour wheel, six
 * presets, and a brightness slider, and a selection is
 * automatically saved to the panel as a static display.
 * Neither public protocol reference (offe, SpawnDev)
 * has a lamp command, so this uses commands already
 * proven on device: a solid 16x16 picture, saved with
 * the Replace sequence, is a one-image slideshow, and a
 * one-image slideshow is a static display. Brightness
 * is RGB scaling — no panel brightness command exists
 * anywhere — so 59% means every channel times 0.59.
 *
 * Presets are the stock tab's six: red, orange, yellow,
 * green, blue, magenta.
 */
export const LAMP_PRESETS: RGB[] = [
  [255, 0, 0],
  [255, 152, 0],
  [255, 255, 0],
  [0, 255, 0],
  [0, 0, 255],
  [255, 0, 255],
];

export const LAMP_PRESET_NAMES = [
  'Red',
  'Orange',
  'Yellow',
  'Green',
  'Blue',
  'Magenta',
];

/** Scale one colour by a brightness percentage (0-100). */
export function applyBrightness([r, g, b]: RGB, percent: number): RGB {
  const p = Math.min(100, Math.max(0, percent)) / 100;
  return [
    Math.round(r * p),
    Math.round(g * p),
    Math.round(b * p),
  ];
}

/** All 256 pixels the same colour. */
export function solidGrid(color: RGB): RGB[] {
  return Array.from({length: 256}, () => [...color] as RGB);
}

/** The picture a lamp selection saves: one solid colour,
 *  brightness already applied. */
export function lampGrid(color: RGB, brightnessPercent: number): RGB[] {
  return solidGrid(applyBrightness(color, brightnessPercent));
}
