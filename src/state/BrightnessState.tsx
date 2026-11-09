import React, {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from 'react';

/**
 * Global panel brightness (Nov 9, 2026), held above
 * the navigator instead of inside any one tab.
 *
 * Brightness (00 10) is a panel-wide setting, not a
 * per-mode one: the device test proved it dims a
 * playing slideshow, and the stock app keeps it in
 * Settings as "Brightness Adjustment". So there is
 * ONE brightness, set from the Connect tab's slider,
 * and the Lamp and Light effect tabs no longer carry
 * their own. Their sends drop the brightness write —
 * the panel already holds the global value — and
 * their previews read this state so they still match
 * what the panel shows.
 *
 * Deliberately in-memory only, like LampState and
 * EffectState: this fixes tab switching, not app
 * restarts. The panel itself keeps the last brightness
 * it was sent, so a restart loses only the app's copy
 * of the value.
 */
export type BrightnessState = {
  /** Brightness percent, 0-100. */
  brightness: number;
  setBrightness: (percent: number) => void;
};

const BrightnessStateContext = createContext<BrightnessState | null>(null);

export function BrightnessStateProvider({children}: {children: ReactNode}) {
  const [brightness, setBrightness] = useState(100);

  return (
    <BrightnessStateContext.Provider value={{brightness, setBrightness}}>
      {children}
    </BrightnessStateContext.Provider>
  );
}

export function useBrightnessState(): BrightnessState {
  const state = useContext(BrightnessStateContext);
  if (!state) {
    throw new Error(
      'useBrightnessState must be used inside BrightnessStateProvider',
    );
  }
  return state;
}
