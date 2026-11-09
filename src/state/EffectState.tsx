import React, {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import type {RGB} from '../conversion/convert';
import {EFFECTS} from '../effects/effects';

/**
 * Light effect state, held above the navigator instead
 * of inside the Light effect subtab (Nov 8, 2026).
 * Same reason as LampState: switching tabs can pop
 * the screen off the stack and destroy its local
 * useState, so a preset or slider picked on the Mode
 * tab would reset on return. State in this provider
 * survives any screen remount.
 *
 * Deliberately in-memory only, like LampState: this
 * fixes tab switching, not app restarts. The panel
 * itself keeps the last saved effect, so a restart
 * loses only the app's copy of the selection.
 *
 * No rotation or reverse state: those were for the
 * frame-based save, and the panel generates its own
 * animation from the palette (PacketLogger, Nov 8-9,
 * 2026) — there is no rotate or reverse command.
 */
export type EffectState = {
  /** Index into EFFECTS. */
  effectIndex: number;
  setEffectIndex: (index: number) => void;
  /** The effect's colour list; the first is the base colour. */
  palette: RGB[];
  setPalette: (palette: RGB[]) => void;
  /** The selected colour, from the hue strip or a palette dot. */
  color: RGB;
  setColor: (color: RGB) => void;
  /** The palette entry the hue strip is editing, by index. */
  selectedPaletteIndex: number;
  setSelectedPaletteIndex: (index: number) => void;
  /** Speed percent, 0-100. 50 is the measured reference. */
  speed: number;
  setSpeed: (percent: number) => void;
};

const EffectStateContext = createContext<EffectState | null>(null);

export function EffectStateProvider({children}: {children: ReactNode}) {
  const [effectIndex, setEffectIndexState] = useState(0);
  const [palette, setPalette] = useState<RGB[]>([
    ...EFFECTS[0].defaultPalette,
  ]);
  const [color, setColor] = useState<RGB>([255, 0, 0]);
  const [selectedPaletteIndex, setSelectedPaletteIndex] = useState(0);
  const [speed, setSpeed] = useState(50);

  function setEffectIndex(index: number) {
    setEffectIndexState(index);
    // A new preset brings its own default palette, and
    // the selection resets to its first colour.
    setPalette([...EFFECTS[index].defaultPalette]);
    setColor(EFFECTS[index].defaultPalette[0]);
    setSelectedPaletteIndex(0);
  }

  return (
    <EffectStateContext.Provider
      value={{
        effectIndex,
        setEffectIndex,
        palette,
        setPalette,
        color,
        setColor,
        selectedPaletteIndex,
        setSelectedPaletteIndex,
        speed,
        setSpeed,
      }}
    >
      {children}
    </EffectStateContext.Provider>
  );
}

export function useEffectState(): EffectState {
  const state = useContext(EffectStateContext);
  if (!state) {
    throw new Error('useEffectState must be used inside EffectStateProvider');
  }
  return state;
}
