import base64js from 'base64-js';
import {decodePng} from '../decodePng';
import {itemsToSpriteSheetPng} from '../encodePng';
import {importSpriteSheet} from '../importSpriteSheet';
import type {RGB} from '../../conversion/convert';

// Same reason as decodePng.test.ts: the fixture is
// embedded, not a file. This sheet was written by our
// encoder and re-saved by PIL (real zlib + filters),
// so it proves the header reads back after a re-encode.
const SHEET_PIL_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAABQAAAAFACAIAAABskUbfAAAH90lEQVR4nO3dQW6DMBRAwabq/a+c' +
    'brNBDTKOXd7MGohByuLJ+vLXFwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAND1OHvD8/k89wOPv3/inWcePef13rO/9Xr92fc6' +
    'WttV6zm65p01nH3+yPUjRt5rxnMAAIB7+169AAAAAPgEAQwAAECCAAYAACDhZ+Tmq2ZuZ8+mnr33' +
    'qnnRkXnj2bPEq2ZiZ8xs7zbbDAAA7MkOMAAAAAkCGAAAgAQBDAAAQMLQDPDOdpj5fGdmdeT84Rnr' +
    '2c3OawMAAP4XO8AAAAAkCGAAAAASBDAAAAAJQzPA78yvfnKG86q51t3ea4ZVc8hHCt8cAABYyw4w' +
    'AAAACQIYAACABAEMAABAwtAM8G4zmVedczvjvXb7Vq92mAc++j47zCcDAAD3YAcYAACABAEMAABA' +
    'ggAGAAAgYWgGeGdXzQMDAABwD3aAAQAASBDAAAAAJAhgAAAAEpbNAJ89e3ZkdvfsPPDZs2dnnxs8' +
    '+/t80lVnDt/1+wAAAPPYAQYAACBBAAMAAJAggAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC4ucdz9QpgIX8A0vwBSHus' +
    'XgAAC3yvXgAAAAB8ggAGAAAgQQADAACQIIABAABIEMAAAAAkCGAAAAASBDAAAAAJAhgAAIAEAQwA' +
    'AECCAAYAACBBAAMAAJAggAEAAEgQwAAAACQIYAAAABIEMAAAAAkCGAAAgAQBDAAAQIIABgAAIEEA' +
    'AwAAkCCAAQAASBDAAAAAJAhgAAAAEgQwAAAACQIYAACABAEMAABAggAGAAAgQQADAACQIIABAABI' +
    'EMAAAAAkCGAAAAASBDAAAAAJAhgAAIAEAQwAAECCAAYAACBBAAMAAJAggAEAAEgQwAAAACQIYAAA' +
    'ABIEMAAAAAkCGAAAgAQBDAAAQIIABgAAIEEAAwAAkCCAAQAASBDAAAAAJAhgAAAAEgQwAAAACQIY' +
    'AACABAEMAABAggAGAAAgQQADAACQIIABAABIEMAAAAAkCGAAAAASBDAAAAAJAhgAAIAEAQwAAECC' +
    'AAYAACBBAAMAAJAggAEAAEgQwAAAACQIYAAAABIEMAAAAAkCGAAAgAQBDAAAQIIABgAAIEEAAwAA' +
    'kCCAAQAASBDAAAAAJAhgAAAAEgQwAAAACQIYAACABAEMAABAggAGAAAgQQADAACQIIABAABIEMAA' +
    'AAAkCGAAAAASBDAAAAAJAhgAAIAEAQwAAECCAAYAACBBAAMAAJAggAEAAEgQwAAAACQIYAAAABIE' +
    'MAAAAAkCGAAAgAQBDAAAQIIABgAAIEEAAwAAkCCAAQAASBDAAAAAJAhgAAAAEgQwAAAACQIYAACA' +
    'BAEMAABAggAGAAAgQQADAACQIIABAABIEMAAAAAkCGAAAAASBDAAAAAJAhgAAIAEAQwAAECCAAYA' +
    'ACBBAAMAAJAggAEAAEgQwAAAACQIYAAAABIEMAAAAAkCGAAAgAQBDAAAQIIABgAAIEEAAwAAkCCA' +
    'AQAASBDAAAAAJAhgAAAAEgQwAAAACQIYAACABAEMAABAggAGAAAgQQADAACQIIABAABIEMAAAAAk' +
    'CGAAAAASBDAAAAAJAhgAAIAEAQwAAECCAAYAACBBAAMAAJAggAEAAEgQwAAAACQIYAAAABIEMAAA' +
    'AAkCGAAAgAQBDAAAQIIABgAAIEEAAwAAkCCAAQAASBDAAAAAJAhgAAAAEgQwAAAACQIYAACABAEM' +
    'AABAggAGAAAgQQADAACQIIABAABIEMAAAAAkCGAAAAASBDAAAAAJAhgAAIAEAQwAAECCAAYAACBB' +
    'AAMAAJAggAEAAEgQwAAAACQIYAAAABIEMAAAAAkCGAAAgAQBDAAAQIIABgAAIEEAAwAAkCCAAQAA' +
    'SBDAAAAAJAhgAAAAEgQwAAAACQIYAACABAEMAABAggAGAAAgQQADAACQIIABAABIEMAAAAAkCGAA' +
    'AAASBDAAAAAJAhgAAIAEAQwAAECCAAYAACBBAAMAAJAggAEAAEgQwAAAACQIYAAAABIEMAAAAAkC' +
    'GAAAgAQBDAAAQIIABgAAIEEAAwAAkCCAAQAASBDAAAAAJAhgAAAAEgQwAAAACQIYAACABAEMAABA' +
    'ggAGAAAgQQADAACQIIABAABIEMAAAAAkCGAAAAASBDAAAAAJAhgAAIAEAQwAAECCAAYAACBBAAMA' +
    'AJAggAEAAEgQwAAAACQIYAAAABIEMAAAAAkCGAAAgAQBDAAAQIIABgAAIEEAAwAAkCCAAQAASBDA' +
    'AAAAJAhgAAAAEgQwAAAACQIYAACABAEMAABAggAGAAAgQQADAACQIIABAABIEMAAAAAkCGAAAAAS' +
    'BDAAAAAJAhgAAIAEAQwAAECCAAYAACBBAAMAAJAggAEAAEgQwAAAACQIYAAAABIEMAAAAAkCGAAA' +
    'gAQBDAAAQIIABgAAIEEAAwAAkCCAAQAASBDAAAAAJAhgAAAAEgQwAAAACQIYAACABAEMAABAggAG' +
    'AAAgQQADAACQIIABAABIEMAAAAAkCGAAAAASBDAAAAAJAhgAAIAEAQwAAECCAAYAACBBAAMAAJAg' +
    'gAEAAEgQwAAAACQIYAAAABIEMAAAAAm/gVeJZ2WPLigAAAAASUVORK5CYII=';

function fixture(name: string): Uint8Array {
  if (name === 'sheet-pil.png') {
    return base64js.toByteArray(SHEET_PIL_BASE64);
  }
  throw new Error(`unknown fixture ${name}`);
}

function solid(c: [number, number, number]): RGB[] {
  return Array.from({length: 256}, () => [...c] as RGB);
}

const RED = solid([255, 0, 0]);
const GREEN = solid([0, 255, 0]);
const BLUE = solid([0, 0, 255]);
const BLACK = solid([0, 0, 0]);

describe('importSpriteSheet', () => {
  test('round-trips our own sheet: name, order, pixels', () => {
    const png = itemsToSpriteSheetPng([RED, GREEN, BLUE], 'My slideshow');
    const imported = importSpriteSheet(decodePng(png));
    expect(imported.name).toBe('MY SLIDESHOW');
    expect(imported.items).toHaveLength(3);
    expect(imported.items[0]).toEqual(RED);
    expect(imported.items[1]).toEqual(GREEN);
    expect(imported.items[2]).toEqual(BLUE);
  });

  test('drops trailing empty cells, keeps an interior black tile', () => {
    const png = itemsToSpriteSheetPng(
      [RED, BLACK, GREEN, BLUE, RED, GREEN, BLUE],
      'Seven',
    );
    const imported = importSpriteSheet(decodePng(png));
    expect(imported.items).toHaveLength(7);
    expect(imported.items[1]).toEqual(BLACK);
  });

  test('reads the header back from a re-encoded sheet', () => {
    const imported = importSpriteSheet(decodePng(fixture('sheet-pil.png')));
    expect(imported.name).toBe('POKEMON GO');
    expect(imported.items).toHaveLength(3);
    expect(imported.items[0]).toEqual(RED);
    expect(imported.items[1]).toEqual(GREEN);
    expect(imported.items[2]).toEqual(BLUE);
  });

  test('name falls back to the tEXt Title, then to null', () => {
    const png = itemsToSpriteSheetPng([RED, GREEN]);
    const imported = importSpriteSheet(decodePng(png));
    expect(imported.name).toBeNull();
    expect(imported.items).toHaveLength(2);
  });

  test('rejects images that are not our sprite sheets', () => {
    expect(() =>
      importSpriteSheet({
        width: 4,
        height: 2,
        pixels: Array.from({length: 8}, () => [0, 0, 0] as RGB),
        text: {},
      }),
    ).toThrow('expected width 1280');
    expect(() =>
      importSpriteSheet({
        width: 1280,
        height: 100,
        pixels: [],
        text: {},
      }),
    ).toThrow('expected height');
    expect(() =>
      importSpriteSheet({
        width: 1280,
        height: 256,
        pixels: Array.from({length: 1280 * 256}, () => [0, 0, 0] as RGB),
        text: {},
      }),
    ).toThrow('no images');
  });
});
