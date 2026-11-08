import React, {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import type {RGB} from '../conversion/convert';

/**
 * Lamp tab state, held above the navigator instead of
 * inside LampScreen (Nov 8, 2026). Same reason as
 * DrawState: switching tabs can pop the screen off the
 * stack and destroy its local useState, so a lamp colour
 * picked on the Lamp tab would reset on return. State
 * in this provider survives any screen remount.
 *
 * Deliberately in-memory only, like DrawState: this
 * fixes tab switching, not app restarts. The panel
 * itself keeps the last saved lamp colour, so a
 * restart loses only the app's copy of the selection.
 */
export type LampState = {
  color: RGB;
  setColor: (color: RGB) => void;
  /** Brightness percent, 0-100. */
  brightness: number;
  setBrightness: (percent: number) => void;
};

const LampStateContext = createContext<LampState | null>(null);

export function LampStateProvider({children}: {children: ReactNode}) {
  // Red, like the stock tab's screenshot (R255 G0 B0).
  const [color, setColor] = useState<RGB>([255, 0, 0]);
  const [brightness, setBrightness] = useState(100);

  return (
    <LampStateContext.Provider
      value={{color, setColor, brightness, setBrightness}}
    >
      {children}
    </LampStateContext.Provider>
  );
}

export function useLampState(): LampState {
  const state = useContext(LampStateContext);
  if (!state) {
    throw new Error('useLampState must be used inside LampStateProvider');
  }
  return state;
}
