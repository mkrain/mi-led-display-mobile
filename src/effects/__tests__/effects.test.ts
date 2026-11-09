import {
  EFFECTS,
  EFFECT_FRAME_COUNT,
  MAX_PALETTE_COLORS,
  effectFrames,
  effectivePalette,
  nextEffectIndex,
  prevEffectIndex,
  rotateGrid,
  sendPalette,
  speedFactor,
  type Grid,
} from '../effects';
import type {RGB} from '../../conversion/convert';

const RED: [number, number, number] = [255, 0, 0];
const WHITE: [number, number, number] = [255, 255, 255];

function paramsFor(id: string, overrides: Partial<Parameters<
  (typeof EFFECTS)[number]['frames']
>[0]> = {}) {
  const def = EFFECTS.find(e => e.id === id)!;
  return {
    def,
    params: {
      palette: def.defaultPalette,
      brightness: 100,
      speed: 50,
      ...overrides,
    },
  };
}

function countWhere(grid: Grid, pred: (c: [number, number, number]) => boolean): number {
  return grid.filter(c => pred(c as [number, number, number])).length;
}

describe('EFFECTS', () => {
  test('seven presets, unique ids', () => {
    expect(EFFECTS).toHaveLength(7);
    expect(new Set(EFFECTS.map(e => e.id)).size).toBe(7);
  });

  test('every effect produces 8 frames of 256 pixels', () => {
    for (const def of EFFECTS) {
      const frames = def.frames(
        {palette: def.defaultPalette, brightness: 100, speed: 50},
        EFFECT_FRAME_COUNT,
      );
      expect(frames).toHaveLength(EFFECT_FRAME_COUNT);
      for (const frame of frames) {
        expect(frame).toHaveLength(256);
      }
    }
  });

  test('frames are deterministic', () => {
    for (const def of EFFECTS) {
      const p = {palette: def.defaultPalette, brightness: 100, speed: 50};
      expect(def.frames(p, 8)).toEqual(def.frames(p, 8));
    }
  });

  test('speed 0 freezes every effect', () => {
    for (const def of EFFECTS) {
      const frames = def.frames(
        {palette: def.defaultPalette, brightness: 100, speed: 0},
        8,
      );
      for (const frame of frames) {
        expect(frame).toEqual(frames[0]);
      }
    }
  });

  test('brightness scales channels', () => {
    const {def, params} = paramsFor('rainbow', {brightness: 50});
    const frames = def.frames(params, 1);
    // Frame 0, column 0 is red at half brightness.
    expect(frames[0][0]).toEqual([128, 0, 0]);
  });
});

describe('rainbow', () => {
  test('vertical hue bands, scrolling right 2 columns per frame at 50%', () => {
    const {def, params} = paramsFor('rainbow');
    const frames = def.frames(params, 3);
    const pal = def.defaultPalette;
    // The cycle is the 6 palette colours plus a fixed
    // white step, which is part of the effect, not the
    // palette.
    const cycle = [...pal, [255, 255, 255] as [number, number, number]];
    for (let c = 0; c < 16; c++) {
      expect(frames[0][c]).toEqual(cycle[c % cycle.length]);
      expect(frames[1][c]).toEqual(
        cycle[((c - 2) % cycle.length + cycle.length) % cycle.length],
      );
      expect(frames[2][c]).toEqual(
        cycle[((c - 4) % cycle.length + cycle.length) % cycle.length],
      );
    }
    // Rows are uniform within a frame.
    expect(frames[0][16]).toEqual(frames[0][0]);
  });

  test('speed scales the step', () => {
    const {def, params} = paramsFor('rainbow', {speed: 100});
    const frames = def.frames(params, 2);
    const pal = def.defaultPalette;
    const cycle = [...pal, [255, 255, 255] as [number, number, number]];
    expect(frames[1][0]).toEqual(cycle[3]);
  });
});

describe('bands', () => {
  test('one band per palette colour, scrolling up', () => {
    const {def, params} = paramsFor('bands');
    const frames = def.frames(params, 2);
    const pal = def.defaultPalette;
    // 6 colours over 16 rows: bands 3,3,2,3,3,2 rows
    // wide — row 0 red, 3 orange, 6 yellow, 8 green,
    // 11 blue, 14 magenta.
    expect(frames[0][0]).toEqual(pal[0]);
    expect(frames[0][3 * 16]).toEqual(pal[1]);
    expect(frames[0][6 * 16]).toEqual(pal[2]);
    expect(frames[0][8 * 16]).toEqual(pal[3]);
    expect(frames[0][11 * 16]).toEqual(pal[4]);
    expect(frames[0][14 * 16]).toEqual(pal[5]);
    // Frame 1, offset 4.5 rows up: row 0 shows band 1,
    // row 8 shows band 4.
    expect(frames[1][0]).toEqual(pal[1]);
    expect(frames[1][8 * 16]).toEqual(pal[4]);
  });

  test('every palette colour appears in the bands', () => {
    const {def, params} = paramsFor('bands');
    expect(params.palette).toHaveLength(6);
    const frames = def.frames(params, 8);
    const used = new Set<string>();
    for (const frame of frames) {
      for (const c of frame) {
        used.add(c.join(','));
      }
    }
    expect([...used].sort()).toEqual(
      params.palette.map(c => c.join(',')).sort(),
    );
  });
});

describe('palette caps', () => {
  test('the palette cap is 7 colours for every effect', () => {
    expect(MAX_PALETTE_COLORS).toBe(7);
  });
});

describe('swipe navigation', () => {
  test('next wraps from the last effect to the first', () => {
    expect(nextEffectIndex(0)).toBe(1);
    expect(nextEffectIndex(6)).toBe(0);
  });

  test('previous wraps from the first effect to the last', () => {
    expect(prevEffectIndex(0)).toBe(6);
    expect(prevEffectIndex(3)).toBe(2);
  });
});

describe('effectivePalette', () => {
  const PURPLE: [number, number, number] = [154, 110, 255];
  const palette: [number, number, number][] = [
    [255, 0, 0],
    [255, 152, 0],
    [255, 255, 0],
  ];

  test('replaces only the selected entry with the working colour', () => {
    const shown = effectivePalette(palette, 0, PURPLE);
    expect(shown).toEqual([PURPLE, [255, 152, 0], [255, 255, 0]]);
    expect(palette[0]).toEqual([255, 0, 0]);
  });

  test('an out-of-range selection leaves the palette unchanged', () => {
    expect(effectivePalette(palette, 3, PURPLE)).toEqual(palette);
    expect(effectivePalette(palette, -1, PURPLE)).toEqual(palette);
  });
});

describe('sendPalette', () => {
  test('rainbow appends its fixed white step', () => {
    const def = EFFECTS.find(e => e.id === 'rainbow')!;
    const sent = sendPalette(def, def.defaultPalette);
    expect(sent).toHaveLength(7);
    expect(sent[6]).toEqual(WHITE);
    expect(sent.slice(0, 6)).toEqual(def.defaultPalette);
  });

  test('rainbow at a full 7 colours sends as-is, never 8', () => {
    const def = EFFECTS.find(e => e.id === 'rainbow')!;
    const seven: RGB[] = [...def.defaultPalette, [0, 255, 255]];
    expect(sendPalette(def, seven)).toEqual(seven);
  });

  test('other effects send the palette unchanged', () => {
    const def = EFFECTS.find(e => e.id === 'bands')!;
    expect(sendPalette(def, def.defaultPalette)).toEqual(
      def.defaultPalette,
    );
  });
});

describe('diagonal', () => {
  test('red/white diagonal stripes, one band per frame', () => {
    const {def, params} = paramsFor('diagonal');
    const frames = def.frames(params, 2);
    const pal = def.defaultPalette;
    expect(frames[0][0]).toEqual(pal[0]);
    expect(frames[0][4]).toEqual(pal[1]);
    expect(frames[0][4 * 16]).toEqual(pal[1]);
    expect(frames[1][0]).toEqual(pal[1]);
  });
});

describe('rainbow diagonal', () => {
  test('a black band sits between each colour band', () => {
    const {def, params} = paramsFor('rainbow-diagonal');
    const frames = def.frames(params, 2);
    const pal = def.defaultPalette;
    const BLACK: [number, number, number] = [0, 0, 0];
    // Diagonal index r - c, band width 4, cycle
    // [c0, black, c1, black, ...]. Down column 0
    // the index rises, so the bands read in order:
    // red, black, orange, black.
    expect(frames[0][0]).toEqual(pal[0]);
    expect(frames[0][4 * 16]).toEqual(BLACK);
    expect(frames[0][8 * 16]).toEqual(pal[1]);
    expect(frames[0][12 * 16]).toEqual(BLACK);
    // Frame 1, offset 4 (one band): cell (0,0) is now
    // black, cell (4,0) is orange.
    expect(frames[1][0]).toEqual(BLACK);
    expect(frames[1][4 * 16]).toEqual(pal[1]);
  });
});

describe('sparse confetti', () => {
  test('64 lit cells per frame, colours from the palette', () => {
    const {def, params} = paramsFor('sparse-confetti');
    const frames = def.frames(params, 2);
    for (const frame of frames) {
      const lit = countWhere(frame, c => c[0] !== 0 || c[1] !== 0 || c[2] !== 0);
      expect(lit).toBe(64);
      for (const c of frame) {
        if (c[0] !== 0 || c[1] !== 0 || c[2] !== 0) {
          expect(params.palette).toContainEqual([...c]);
        }
      }
    }
    expect(frames[0]).not.toEqual(frames[1]);
  });
});

describe('speckles', () => {
  test('solid field with at most 25 white speckles', () => {
    const {def, params} = paramsFor('speckles');
    const frames = def.frames(params, 2);
    const base = params.palette[0];
    for (const frame of frames) {
      const white = countWhere(
        frame,
        c => c[0] === 255 && c[1] === 255 && c[2] === 255,
      );
      expect(white).toBeGreaterThan(0);
      expect(white).toBeLessThanOrEqual(25);
      const baseCount = countWhere(
        frame,
        c => c[0] === base[0] && c[1] === base[1] && c[2] === base[2],
      );
      expect(baseCount + white).toBe(256);
    }
  });
});

describe('full confetti', () => {
  test('every cell lit, colours from the palette', () => {
    const {def, params} = paramsFor('full-confetti');
    const frames = def.frames(params, 2);
    for (const frame of frames) {
      const lit = countWhere(frame, c => c[0] !== 0 || c[1] !== 0 || c[2] !== 0);
      expect(lit).toBe(256);
    }
    expect(frames[0]).not.toEqual(frames[1]);
  });
});

describe('rotateGrid', () => {
  function singlePixel(): Grid {
    const grid: Grid = Array.from({length: 256}, () => [0, 0, 0] as [number, number, number]);
    grid[0] = [...RED] as [number, number, number];
    return grid;
  }

  test('one quarter turn clockwise moves (0,0) to (0,15)', () => {
    expect(rotateGrid(singlePixel(), 1)[15]).toEqual(RED);
    expect(rotateGrid(singlePixel(), 2)[15 * 16 + 15]).toEqual(RED);
    expect(rotateGrid(singlePixel(), 3)[15 * 16]).toEqual(RED);
    expect(rotateGrid(singlePixel(), 4)[0]).toEqual(RED);
    expect(rotateGrid(singlePixel(), 0)).toEqual(singlePixel());
  });

  test('rotating 1 then 3 quarters is the identity', () => {
    const grid = singlePixel();
    expect(rotateGrid(rotateGrid(grid, 1), 3)).toEqual(grid);
  });
});

describe('effectFrames', () => {
  test('reverse flips the frame order', () => {
    const {def, params} = paramsFor('rainbow');
    const forward = effectFrames(def, params, 8, 0, false);
    const reversed = effectFrames(def, params, 8, 0, true);
    expect(reversed).toEqual([...forward].reverse());
  });

  test('rotation applies to each frame', () => {
    const {def, params} = paramsFor('rainbow');
    const frames = effectFrames(def, params, 1, 1, false);
    const unrotated = effectFrames(def, params, 1, 0, false);
    expect(frames[0]).toEqual(rotateGrid(unrotated[0], 1));
    expect(frames[0]).not.toEqual(unrotated[0]);
  });

  test('speedFactor is 1 at 50, 0 at 0, 2 at 100', () => {
    expect(speedFactor(50)).toBe(1);
    expect(speedFactor(0)).toBe(0);
    expect(speedFactor(100)).toBe(2);
  });
});
