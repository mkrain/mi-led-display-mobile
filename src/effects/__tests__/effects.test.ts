import {
  EFFECTS,
  EFFECT_FRAME_COUNT,
  effectFrames,
  rotateGrid,
  speedFactor,
  type Grid,
} from '../effects';

const RED: [number, number, number] = [255, 0, 0];

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
  test('four colours in 4-row bands, scrolling up', () => {
    const {def, params} = paramsFor('bands');
    const frames = def.frames(params, 2);
    const pal = def.defaultPalette;
    for (let r = 0; r < 4; r++) {
      expect(frames[0][r * 16]).toEqual(pal[0]);
      expect(frames[0][(r + 4) * 16]).toEqual(pal[1]);
      expect(frames[0][(r + 8) * 16]).toEqual(pal[2]);
      expect(frames[0][(r + 12) * 16]).toEqual(pal[3]);
    }
    // Frame 1, offset 4.5 rows up: row 0 shows band 1,
    // row 8 shows band 3.
    expect(frames[1][0]).toEqual(pal[1]);
    expect(frames[1][8 * 16]).toEqual(pal[3]);
  });

  test('bands use only the first four palette colours', () => {
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
      params.palette.slice(0, 4).map(c => c.join(',')).sort(),
    );
  });
});

describe('palette caps', () => {
  test('effects 1 and 4 hold 6 colours, the others hold 7', () => {
    expect(EFFECTS.find(e => e.id === 'rainbow')!.maxPaletteColors).toBe(6);
    expect(EFFECTS.find(e => e.id === 'bands')!.maxPaletteColors).toBe(6);
    for (const def of EFFECTS) {
      if (def.id !== 'rainbow' && def.id !== 'bands') {
        expect(def.maxPaletteColors).toBe(7);
      }
    }
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
