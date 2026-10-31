/**
 * Photo -> 16x16 display conversion. Pure functions over a decoded RGBA
 * pixel array — this module deliberately does NOT decode image files.
 * Native image decoding (photo picker -> RGBA pixels) is a later
 * integration step; the app screens currently feed this module with a
 * placeholder / test image, and the real picker will call the same
 * convertImage() entry point.
 *
 * Design decisions (from the Oct 2026 prototype, tested on a synthetic
 * scene, a Smeargle screenshot, and a Sigma-Lambda-Beta pendant design):
 * - Crop choice dwarfs the resampling kernel. A subject crop is night-and-
 *   day better than squishing a tall screenshot; a full-frame pendant is
 *   never legible at 16x16 (3 stacked letters in 16 rows), so the goal is
 *   "recognizable", with the user offered different modes to choose from.
 * - Downscale in linear light, not sRGB. Averaging a 50% black/white
 *   checker in sRGB gives ~128; in linear light it gives ~188, which is
 *   correct. A naive sRGB resize is therefore NOT the default.
 * - Sharpening and saturation are separate, tunable post steps, not baked
 *   into the resize. Defaults are mild: sharpen 0.8, saturation 1.15.
 *   Strong sharpening (e.g. 1.5) produced halos in the prototype.
 */

export type RGB = readonly [number, number, number];

export interface RgbaImage {
  /** Row-major RGBA bytes, length === width * height * 4. */
  data: Uint8ClampedArray | readonly number[];
  width: number;
  height: number;
}

export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ConversionMode =
  | 'Smart'
  | 'Full'
  | 'CenterCrop'
  | 'Fit'
  | 'ManualCrop'
  | 'TrimColorful';

export interface ConvertOptions {
  mode?: ConversionMode;
  /** Required for ManualCrop. Coordinates in source-image pixels. */
  box?: CropBox;
  /** Letterbox background for Fit. Default black (panel off = black). */
  background?: RGB;
  /** Unsharp amount, 0 = off. Default 0.8. */
  sharpen?: number;
  /** Saturation multiplier, 1 = unchanged. Default 1.15. */
  saturation?: number;
  /**
   * Brightness multiplier, 1 = unchanged. A/B test, Oct 29, 2026:
   * dimming bright pixels (e.g. 0.75) should reduce diffuser bloom on
   * the panel, so pastels wash less toward white. Applied after
   * saturation, so it does not change the saturation ratio.
   */
  brightness?: number;
}

export const GRID = 16;
export const PIXEL_COUNT = GRID * GRID; // 256

// --- sRGB <-> linear light (IEC 61966-2-1, exponent 2.4) -------------------

export function srgbToLinear(value: number): number {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(value: number): number {
  const v = Math.min(1, Math.max(0, value));
  const srgb =
    v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.round(Math.min(255, Math.max(0, srgb * 255)));
}

// --- Cropping ---------------------------------------------------------------

function clampBox(box: CropBox, width: number, height: number): CropBox {
  const x = Math.min(Math.max(0, Math.floor(box.x)), width - 1);
  const y = Math.min(Math.max(0, Math.floor(box.y)), height - 1);
  const w = Math.min(
    Math.max(1, Math.floor(box.width)),
    width - x,
  );
  const h = Math.min(
    Math.max(1, Math.floor(box.height)),
    height - y,
  );
  return {x, y, width: w, height: h};
}

export function centerCropBox(width: number, height: number): CropBox {
  const size = Math.min(width, height);
  return {
    x: Math.floor((width - size) / 2),
    y: Math.floor((height - size) / 2),
    width: size,
    height: size,
  };
}

/**
 * Bounding box of "colorful" pixels: channel spread (max - min) > 30.
 * This isolates a purple pendant (spread ~100) from a white background and
 * from a grey watermark (spread < 10), which is why a naive near-white
 * trim fails on watermarked designs — the watermark spans the full width.
 * Returns null when no colorful pixel is found. A 2% pad is added so the
 * subject is not clipped at its outline.
 */
export function findColorfulBox(image: RgbaImage): CropBox | null {
  const {data, width, height} = image;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      if (spread > 30) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) {
    return null;
  }
  const padX = Math.max(1, Math.round((maxX - minX + 1) * 0.02));
  const padY = Math.max(1, Math.round((maxY - minY + 1) * 0.02));
  return clampBox(
    {
      x: minX - padX,
      y: minY - padY,
      width: maxX - minX + 1 + padX * 2,
      height: maxY - minY + 1 + padY * 2,
    },
    width,
    height,
  );
}

function cropImage(image: RgbaImage, box: CropBox): RgbaImage {
  const clamped = clampBox(box, image.width, image.height);
  const out = new Uint8ClampedArray(clamped.width * clamped.height * 4);
  for (let y = 0; y < clamped.height; y++) {
    for (let x = 0; x < clamped.width; x++) {
      const src = ((clamped.y + y) * image.width + (clamped.x + x)) * 4;
      const dst = (y * clamped.width + x) * 4;
      out[dst] = image.data[src];
      out[dst + 1] = image.data[src + 1];
      out[dst + 2] = image.data[src + 2];
      out[dst + 3] = image.data[src + 3];
    }
  }
  return {data: out, width: clamped.width, height: clamped.height};
}

// --- Linear-light area resize ----------------------------------------------
// Each output pixel averages the linear-light values of the source pixels
// in its footprint. For integer downscale ratios this is the exact mean,
// which is what makes the 50% checker test come out at ~188.

export function resizeLinear(
  image: RgbaImage,
  outWidth: number,
  outHeight: number,
): RGB[] {
  const {data, width, height} = image;
  const out: RGB[] = [];
  for (let oy = 0; oy < outHeight; oy++) {
    const y0 = Math.floor((oy * height) / outHeight);
    const y1 = Math.max(y0 + 1, Math.floor(((oy + 1) * height) / outHeight));
    for (let ox = 0; ox < outWidth; ox++) {
      const x0 = Math.floor((ox * width) / outWidth);
      const x1 = Math.max(x0 + 1, Math.floor(((ox + 1) * width) / outWidth));
      let lr = 0;
      let lg = 0;
      let lb = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          lr += srgbToLinear(data[i]);
          lg += srgbToLinear(data[i + 1]);
          lb += srgbToLinear(data[i + 2]);
          count++;
        }
      }
      out.push([
        linearToSrgb(lr / count),
        linearToSrgb(lg / count),
        linearToSrgb(lb / count),
      ]);
    }
  }
  return out;
}

// --- Post steps (separate, tunable) ----------------------------------------

function luminance([r, g, b]: RGB): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function applySaturation(pixels: RGB[], factor: number): RGB[] {
  if (factor === 1) {
    return pixels;
  }
  return pixels.map(([r, g, b]) => {
    const lum = luminance([r, g, b]);
    const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(v)));
    return [
      clamp(lum + factor * (r - lum)),
      clamp(lum + factor * (g - lum)),
      clamp(lum + factor * (b - lum)),
    ] as RGB;
  });
}

/** Unsharp mask on the 16x16 grid: out = orig + amount * (orig - box blur). */
export function applySharpen(pixels: RGB[], amount: number): RGB[] {
  if (amount === 0 || pixels.length !== PIXEL_COUNT) {
    return pixels;
  }
  const blurred: RGB[] = [];
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < GRID && ny >= 0 && ny < GRID) {
            const p = pixels[ny * GRID + nx];
            r += p[0];
            g += p[1];
            b += p[2];
            count++;
          }
        }
      }
      blurred.push([r / count, g / count, b / count]);
    }
  }
  const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(v)));
  return pixels.map((p, i) => [
    clamp(p[0] + amount * (p[0] - blurred[i][0])),
    clamp(p[1] + amount * (p[1] - blurred[i][1])),
    clamp(p[2] + amount * (p[2] - blurred[i][2])),
  ] as RGB);
}

/** Brightness scale: out = orig * factor, clamped to 0-255. */
export function applyBrightness(pixels: RGB[], factor: number): RGB[] {
  if (factor === 1) {
    return pixels;
  }
  const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(v)));
  return pixels.map(([r, g, b]) => [
    clamp(r * factor),
    clamp(g * factor),
    clamp(b * factor),
  ] as RGB);
}

// --- Main entry point -------------------------------------------------------

/**
 * Convert a decoded image to exactly 256 RGB tuples for the display.
 *
 * Modes:
 * - Smart (default): TrimColorful box if one is found, otherwise the
 *   center square; then fill (squish) to 16x16. This is the "recognizable"
 *   default: it is what made the Smeargle screenshot and the pendant
 *   design recognizable instead of tiny.
 * - Full: squish the whole image to 16x16 (the stock app's behavior).
 * - CenterCrop: center square crop, then fill.
 * - Fit: preserve aspect, letterbox on `background` (default black).
 * - ManualCrop: crop to options.box, then fill.
 * - TrimColorful: crop to the colorful bounding box, then fill.
 */
export function convertImage(
  image: RgbaImage,
  options: ConvertOptions = {},
): RGB[] {
  const mode = options.mode ?? 'Smart';
  const sharpen = options.sharpen ?? 0.8;
  const saturation = options.saturation ?? 1.15;
  const brightness = options.brightness ?? 1;
  const background: RGB = options.background ?? [0, 0, 0];

  let pixels: RGB[];
  switch (mode) {
    case 'Full':
      pixels = resizeLinear(image, GRID, GRID);
      break;
    case 'CenterCrop':
      pixels = resizeLinear(cropImage(image, centerCropBox(image.width, image.height)), GRID, GRID);
      break;
    case 'ManualCrop': {
      if (!options.box) {
        throw new Error('ManualCrop requires options.box');
      }
      pixels = resizeLinear(cropImage(image, options.box), GRID, GRID);
      break;
    }
    case 'TrimColorful': {
      const box = findColorfulBox(image);
      const cropped = box ? cropImage(image, box) : image;
      pixels = resizeLinear(cropped, GRID, GRID);
      break;
    }
    case 'Fit': {
      const scale = Math.min(GRID / image.width, GRID / image.height);
      const tw = Math.max(1, Math.round(image.width * scale));
      const th = Math.max(1, Math.round(image.height * scale));
      const small = resizeLinear(image, tw, th);
      const out: RGB[] = [];
      const ox = Math.floor((GRID - tw) / 2);
      const oy = Math.floor((GRID - th) / 2);
      for (let y = 0; y < GRID; y++) {
        for (let x = 0; x < GRID; x++) {
          if (x >= ox && x < ox + tw && y >= oy && y < oy + th) {
            out.push(small[(y - oy) * tw + (x - ox)]);
          } else {
            out.push(background);
          }
        }
      }
      pixels = out;
      break;
    }
    case 'Smart':
    default: {
      const box = findColorfulBox(image) ?? centerCropBox(image.width, image.height);
      pixels = resizeLinear(cropImage(image, box), GRID, GRID);
      break;
    }
  }
  if (pixels.length !== PIXEL_COUNT) {
    throw new Error(`conversion must return 256 pixels, got ${pixels.length}`);
  }
  return applyBrightness(
    applySaturation(applySharpen(pixels, sharpen), saturation),
    brightness,
  );
}
