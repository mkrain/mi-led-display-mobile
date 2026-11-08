import {applyBrightness, lampGrid, solidGrid} from '../lamp';

describe('applyBrightness', () => {
  test('100% is the colour itself, 0% is black', () => {
    expect(applyBrightness([255, 128, 0], 100)).toEqual([255, 128, 0]);
    expect(applyBrightness([255, 128, 0], 0)).toEqual([0, 0, 0]);
  });

  test('59% of red is 150, the stock screenshot value', () => {
    expect(applyBrightness([255, 0, 0], 59)).toEqual([150, 0, 0]);
  });

  test('clamps outside 0-100', () => {
    expect(applyBrightness([200, 100, 50], 200)).toEqual([200, 100, 50]);
    expect(applyBrightness([200, 100, 50], -10)).toEqual([0, 0, 0]);
  });
});

describe('solidGrid and lampGrid', () => {
  test('every pixel is the same colour', () => {
    const grid = solidGrid([0, 0, 255]);
    expect(grid).toHaveLength(256);
    expect(grid.every(p => p[0] === 0 && p[1] === 0 && p[2] === 255)).toBe(
      true,
    );
    // Each pixel is its own array: two entries are never
    // the same object.
    expect(grid[0]).not.toBe(grid[1]);
  });

  test('lampGrid applies brightness to the solid colour', () => {
    const grid = lampGrid([255, 255, 255], 50);
    expect(grid).toHaveLength(256);
    expect(grid[0]).toEqual([128, 128, 128]);
    expect(grid[255]).toEqual([128, 128, 128]);
  });
});
