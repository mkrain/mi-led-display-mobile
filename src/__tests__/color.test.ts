import {hsvToRgb, rgbToHue, rgbToSaturation} from '../conversion/color';

describe('HSV <-> RGB', () => {
  test('hsvToRgb primary and secondary hues', () => {
    expect(hsvToRgb(0, 1, 1)).toEqual([255, 0, 0]);
    expect(hsvToRgb(60, 1, 1)).toEqual([255, 255, 0]);
    expect(hsvToRgb(120, 1, 1)).toEqual([0, 255, 0]);
    expect(hsvToRgb(180, 1, 1)).toEqual([0, 255, 255]);
    expect(hsvToRgb(240, 1, 1)).toEqual([0, 0, 255]);
    expect(hsvToRgb(300, 1, 1)).toEqual([255, 0, 255]);
    expect(hsvToRgb(360, 1, 1)).toEqual([255, 0, 0]);
  });

  test('hsvToRgb saturation and value', () => {
    expect(hsvToRgb(0, 0, 1)).toEqual([255, 255, 255]);
    expect(hsvToRgb(120, 1, 0)).toEqual([0, 0, 0]);
    expect(hsvToRgb(0, 1, 0.5)).toEqual([128, 0, 0]);
  });

  test('rgbToHue round-trips hues, grey is null', () => {
    expect(rgbToHue([255, 0, 0])).toBe(0);
    expect(rgbToHue([0, 255, 0])).toBe(120);
    expect(rgbToHue([0, 0, 255])).toBe(240);
    expect(rgbToHue([255, 255, 0])).toBe(60);
    expect(rgbToHue([0, 0, 0])).toBeNull();
    expect(rgbToHue([255, 255, 255])).toBeNull();
    expect(rgbToHue([128, 128, 128])).toBeNull();
  });

  test('rgbToSaturation: top of pad is pale, bottom is pure', () => {
    expect(rgbToSaturation([255, 255, 255])).toBe(0);
    expect(rgbToSaturation([255, 0, 0])).toBe(1);
    expect(rgbToSaturation([0, 0, 0])).toBe(0);
    // Video frame colours from the original app, all with a
    // channel locked at 255: saturation is (255 - min) / 255.
    expect(rgbToSaturation([130, 255, 203])).toBeCloseTo(0.49, 2);
    expect(rgbToSaturation([89, 48, 255])).toBeCloseTo(0.81, 2);
    expect(rgbToSaturation([255, 50, 178])).toBeCloseTo(0.8, 2);
  });

  test('hsvToRgb with varying saturation, value fixed at 1', () => {
    // Same hue (green), saturation 0.5: a pale green, like the
    // middle of the original pad, not a pure green.
    expect(hsvToRgb(120, 0.5, 1)).toEqual([128, 255, 128]);
    expect(hsvToRgb(120, 0, 1)).toEqual([255, 255, 255]);
    expect(hsvToRgb(120, 1, 1)).toEqual([0, 255, 0]);
  });
});
