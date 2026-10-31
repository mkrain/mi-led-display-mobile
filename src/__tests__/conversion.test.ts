import {
  applyBrightness,
  applySaturation,
  applySharpen,
  convertImage,
  findColorfulBox,
  type ConversionMode,
  type RgbaImage,
} from '../conversion/convert';

function rgbaImage(width: number, height: number, fill: (x: number, y: number) => [number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fill(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return {data, width, height};
}

describe('conversion', () => {
  test('50% checker averages ~188 in linear mode, not ~128 (sRGB)', () => {
    // 32x32 checker, 1px cells: every 2x2 downscale footprint is 50% black,
    // 50% white, so each output pixel must be the linear-light mean.
    const checker = rgbaImage(32, 32, (x, y) =>
      (x + y) % 2 === 0 ? [255, 255, 255] : [0, 0, 0],
    );
    const pixels = convertImage(checker, {
      mode: 'Full',
      sharpen: 0,
      saturation: 1,
    });
    expect(pixels).toHaveLength(256);
    const mean =
      pixels.reduce((sum, [r]) => sum + r, 0) / pixels.length;
    expect(mean).toBeGreaterThan(180);
    expect(mean).toBeLessThan(196);
    // A naive sRGB average would be ~128 — that must NOT be the result.
    expect(Math.abs(mean - 128)).toBeGreaterThan(40);
  });

  test('every mode returns exactly 256 valid RGB tuples', () => {
    const image = rgbaImage(64, 48, (x, y) => [
      Math.round((x / 64) * 255),
      Math.round((y / 48) * 255),
      128,
    ]);
    const modes: ConversionMode[] = [
      'Smart',
      'Full',
      'CenterCrop',
      'Fit',
      'TrimColorful',
      'ManualCrop',
    ];
    for (const mode of modes) {
      const pixels = convertImage(image, {
        mode,
        box: {x: 10, y: 10, width: 20, height: 20},
      });
      expect(pixels).toHaveLength(256);
      for (const [r, g, b] of pixels) {
        for (const v of [r, g, b]) {
          expect(Number.isInteger(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(255);
        }
      }
    }
  });

  test('Smart is the default when no mode is given', () => {
    const image = rgbaImage(32, 32, () => [200, 100, 50]);
    expect(convertImage(image)).toHaveLength(256);
  });

  test('trim finds a colorful subject and ignores grey watermark pixels', () => {
    // White background, a purple rectangle, plus grey "watermark" pixels
    // spanning the width (spread 0, so they must not widen the box).
    const image = rgbaImage(32, 32, (x, y) => {
      if (y === 2) {
        return [200, 200, 200]; // grey watermark row
      }
      if (x >= 10 && x < 20 && y >= 5 && y < 25) {
        return [100, 40, 160]; // purple subject, spread 120
      }
      return [255, 255, 255];
    });
    const box = findColorfulBox(image);
    expect(box).not.toBeNull();
    expect(box!.x).toBeLessThanOrEqual(10);
    expect(box!.y).toBeLessThanOrEqual(5);
    expect(box!.x + box!.width - 1).toBeGreaterThanOrEqual(19);
    expect(box!.y + box!.height - 1).toBeGreaterThanOrEqual(24);
    expect(box!.width).toBeLessThan(32);
    // Grey-only image: no colorful box at all.
    const grey = rgbaImage(16, 16, () => [200, 200, 200]);
    expect(findColorfulBox(grey)).toBeNull();
  });

  test('ManualCrop requires a box', () => {
    const image = rgbaImage(32, 32, () => [10, 20, 30]);
    expect(() => convertImage(image, {mode: 'ManualCrop'})).toThrow();
  });

  test('sharpen and saturation are no-ops on flat/grey images', () => {
    const grey = Array.from({length: 256}, () => [188, 188, 188] as const);
    expect(applySaturation(grey, 1.15)).toEqual(grey);
    expect(applySharpen(grey, 0.8)).toEqual(grey);
  });

  test('brightness scales channels and clamps, 1 is a no-op', () => {
    const pixels = [[200, 100, 50]] as const;
    expect(applyBrightness(pixels as never, 1)).toEqual(pixels);
    expect(applyBrightness(pixels as never, 0.75)).toEqual([[150, 75, 38]]);
    expect(applyBrightness(pixels as never, 2)).toEqual([[255, 200, 100]]);
  });
});
