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
 * Rotation is quarter turns clockwise applied to each
 * frame before sending. It defaults to 1 — the stock
 * app sends the grid rotated 90 degrees clockwise
 * (Jeremiah, Nov 8, 2026) — and the user can pick any
 * quarter turn instead. Reverse flips the frame order,
 * which reverses the motion on the effects that have
 * a direction.
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
  /** Brightness percent, 0-100. */
  brightness: number;
  setBrightness: (percent: number) => void;
  /** Speed percent, 0-100. 50 is the measured reference. */
  speed: number;
  setSpeed: (percent: number) => void;
  /** Quarter turns clockwise, 0-3. Default 1 (stock). */
  rotation: number;
  setRotation: (quarters: number) => void;
  /** Reverse the frame order. */
  reverse: boolean;
  setReverse: (reverse: boolean) => void;
};

const EffectStateContext = createContext<EffectState | null>(null);

export function EffectStateProvider({children}: {children: ReactNode}) {
  const [effectIndex, setEffectIndexState] = useState(0);
  const [palette, setPalette] = useState<RGB[]>([
    ...EFFECTS[0].defaultPalette,
  ]);
  const [color, setColor] = useState<RGB>([255, 0, 0]);
  const [brightness, setBrightness] = useState(100);
  const [speed, setSpeed] = useState(50);
  const [rotation, setRotation] = useState(1);
  const [reverse, setReverse] = useState(false);

  function setEffectIndex(index: number) {
    setEffectIndexState(index);
    // A new preset brings its own default palette.
    setPalette([...EFFECTS[index].defaultPalette]);
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
        brightness,
        setBrightness,
        speed,
        setSpeed,
        rotation,
        setRotation,
        reverse,
        setReverse,
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
