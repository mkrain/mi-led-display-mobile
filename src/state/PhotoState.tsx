import React, {createContext, useContext, useState, type ReactNode} from 'react';
import type {ConversionMode} from '../conversion/convert';
import type {PickedPhoto} from '../photos/pickPhoto';

/**
 * Photo tab state, held above the navigator instead of inside
 * PhotoScreen. That is the fix for Oct 29, 2026: switching
 * Photo -> Draw -> Photo recreated PhotoScreen, and its local
 * useState (picked photo, mode, saturation, brightness, mode view)
 * was lost with it, even though the panel still showed the last
 * send. State in this provider survives any screen remount, so
 * returning to Photo always shows the same photo and options.
 * The picked image itself stays in memory here (no AsyncStorage
 * round-trip for a ~1 MB RGBA buffer); auto-send is persisted
 * separately in settings/autoSend.ts.
 */
export type PhotoState = {
  picked: PickedPhoto | null;
  setPicked: (photo: PickedPhoto | null) => void;
  mode: ConversionMode;
  setMode: (mode: ConversionMode) => void;
  saturation: number;
  setSaturation: (value: number) => void;
  brightness: number;
  setBrightness: (value: number) => void;
  modeView: 'carousel' | 'list';
  setModeView: (view: 'carousel' | 'list') => void;
  /**
   * Pinch/pan crop editor state, in tile coordinates (see
   * photos/cropBox.ts). Zoom 1 + pan 0 = centre-square cover fit.
   * Committed on gesture release, not on every move, so the 16x16
   * preview recomputes once per gesture, not once per frame.
   */
  cropZoom: number;
  setCropZoom: (zoom: number) => void;
  cropPanX: number;
  cropPanY: number;
  setCropPan: (x: number, y: number) => void;
};

const PhotoStateContext = createContext<PhotoState | null>(null);

export function PhotoStateProvider({children}: {children: ReactNode}) {
  const [picked, setPicked] = useState<PickedPhoto | null>(null);
  const [mode, setMode] = useState<ConversionMode>('Smart');
  const [saturation, setSaturation] = useState(2.5);
  const [brightness, setBrightness] = useState(1);
  const [modeView, setModeView] = useState<'carousel' | 'list'>('carousel');
  const [cropZoom, setCropZoom] = useState(1);
  const [cropPanX, setCropPanX] = useState(0);
  const [cropPanY, setCropPanY] = useState(0);
  const setCropPan = (x: number, y: number) => {
    setCropPanX(x);
    setCropPanY(y);
  };
  return (
    <PhotoStateContext.Provider
      value={{
        picked,
        setPicked,
        mode,
        setMode,
        saturation,
        setSaturation,
        brightness,
        setBrightness,
        modeView,
        setModeView,
        cropZoom,
        setCropZoom,
        cropPanX,
        cropPanY,
        setCropPan,
      }}
    >
      {children}
    </PhotoStateContext.Provider>
  );
}

export function usePhotoState(): PhotoState {
  const state = useContext(PhotoStateContext);
  if (!state) {
    throw new Error('usePhotoState must be used inside PhotoStateProvider');
  }
  return state;
}
