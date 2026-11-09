import type {RGB} from '../conversion/convert';

/**
 * Lamplight (Nov 8, 2026): one solid colour across the
 * whole panel.
 *
 * The stock app's Lamplight tab is a colour wheel, six
 * presets, and a brightness slider, and a selection is
 * automatically saved to the panel as a static display.
 * The PacketLogger traces (Nov 8-9, 2026) show how: lamp
 * mode (00 0B) and one 7-byte solid colour write (0B).
 * Brightness is a panel parameter, not RGB scaling — the
 * colour goes to the panel unscaled — and it is GLOBAL
 * (Nov 9, 2026: the device test proved it dims a playing
 * slideshow), set from the Connect tab, not sent with the
 * colour. applyBrightness is still used for the preview
 * (and lampGrid for the preview grid), so the app shows
 * what the panel looks like; the BLE write sends the
 * raw colour only.
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
