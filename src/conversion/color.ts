import type {RGB} from '../conversion/convert';

/**
 * HSV <-> RGB conversion, for the Draw colour pickers
 * (Oct 30, 2026). Pure functions, fully unit-testable.
 *
 * The stock app's gradient bar is a hue strip: one hue at full
 * saturation and value, left to right. hsvToRgb maps a hue
 * (0-360) to the RGB the panel actually paints with, and
 * rgbToHue maps a current colour back to a strip position, so
 * the strip indicator follows a colour picked elsewhere
 * (static swatch, RGB sliders). Grey colours (black, white,
 * and greys) have no hue, so rgbToHue returns null for them
 * and the strip indicator hides instead of pointing at a
 * misleading hue.
 */
export function hsvToRgb(h: number, s: number, v: number): RGB {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.min(1, Math.max(0, s));
  const val = Math.min(1, Math.max(0, v));
  const c = val * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = val - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) {
    r = c;
    g = x;
  } else if (hue < 120) {
    r = x;
    g = c;
  } else if (hue < 180) {
    g = c;
    b = x;
  } else if (hue < 240) {
    g = x;
    b = c;
  } else if (hue < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

/** Hue in degrees (0-360), or null for grey colours. */
export function rgbToHue([r, g, b]: RGB): number | null {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) {
    return null;
  }
  let hue: number;
  if (max === r) {
    hue = 60 * (((g - b) / delta) % 6);
  } else if (max === g) {
    hue = 60 * ((b - r) / delta + 2);
  } else {
    hue = 60 * ((r - g) / delta + 4);
  }
  return ((hue % 360) + 360) % 360;
}

/**
 * Saturation (0-1) in HSV terms: (max - min) / max, or 0 for
 * black. On the original app's pad, value is fixed at 1, so
 * saturation is exactly how pale (top, near 0, colours close
 * to white) versus pure (bottom, near 1, one channel at 255
 * and the others low) a colour is. For a colour picked
 * elsewhere with value below 1 (e.g. an RGB slider colour
 * like 111,124,56, max 124), saturation is still defined by
 * this ratio, so the pad indicator can show its hue and
 * saturation even though the pad itself would brighten it
 * to value 1 if touched.
 */
export function rgbToSaturation([r, g, b]: RGB): number {
  const max = Math.max(r, g, b);
  if (max === 0) {
    return 0;
  }
  const min = Math.min(r, g, b);
  return (max - min) / max;
}
