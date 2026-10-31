import React, {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type {RGB} from '../conversion/convert';

/**
 * Draw tab state, held above the navigator instead of inside
 * DrawScreen (Oct 30, 2026). Same fix as PhotoState: switching
 * tabs can pop Draw off the stack — going back to Connect, for
 * example, destroys the Draw instance — and its local useState
 * (grid + selected colour) was lost with it, so returning to
 * Draw always started from a blank grid. State in this provider
 * survives any screen remount, so returning to Draw always
 * shows the same grid and colour.
 *
 * Deliberately in-memory only, like PhotoState: this fixes
 * tab switching, not app restarts. A grid that must survive a
 * restart belongs in the Slideshow queue (Add to slideshow
 * freezes it there), not here.
 *
 * Status, busy, and the continuous-send loop stay local to
 * DrawScreen on purpose: the loop's interval is cleaned up on
 * unmount, so leaving Draw stops continuous sending instead
 * of sending from a background screen.
 */
export function blankGrid(): RGB[] {
  return Array.from({length: 256}, () => [0, 0, 0] as RGB);
}

export type DrawState = {
  pixels: RGB[];
  setPixels: Dispatch<SetStateAction<RGB[]>>;
  color: RGB;
  setColor: (color: RGB) => void;
  /**
   * Paint tool (Oct 30, 2026): 'paint' paints the selected
   * colour, 'erase' paints black (0,0,0) — the panel's off
   * state, so erasing a pixel is resetting it to off. Erasing
   * is a tool, not a colour: picking a colour (swatch, hue
   * strip, RGB sliders) switches back to 'paint', so a colour
   * pick is never silently swallowed by a forgotten eraser.
   */
  tool: 'paint' | 'erase';
  setTool: (tool: 'paint' | 'erase') => void;
  /**
   * Edit-in-Draw target (Oct 30, 2026): when a slideshow
   * item is opened for editing, Draw shows a Save-back
   * button for exactly this item. In-memory only, like the
   * grid itself: it survives tab switches, but an app kill
   * loses both the half-finished grid and the target, so
   * the slideshow item is never left half-edited. It must
   * never be persisted — a persisted target with a blank
   * restart grid would offer to overwrite an item with
   * nothing. Cleared by Save-back and by Cancel.
   */
  editingItem: {
    slideshowId: string;
    itemId: string;
    slideshowName: string;
    label: string;
  } | null;
  setEditingItem: (
    target: {
      slideshowId: string;
      itemId: string;
      slideshowName: string;
      label: string;
    } | null,
  ) => void;
};

const DrawStateContext = createContext<DrawState | null>(null);

export function DrawStateProvider({children}: {children: ReactNode}) {
  const [pixels, setPixels] = useState<RGB[]>(blankGrid);
  const [color, setColor] = useState<RGB>([255, 255, 255]);
  const [tool, setTool] = useState<'paint' | 'erase'>('paint');
  const [editingItem, setEditingItem] = useState<DrawState['editingItem']>(null);

  return (
    <DrawStateContext.Provider
      value={{
        pixels,
        setPixels,
        color,
        setColor,
        tool,
        setTool,
        editingItem,
        setEditingItem,
      }}
    >
      {children}
    </DrawStateContext.Provider>
  );
}

export function useDrawState(): DrawState {
  const state = useContext(DrawStateContext);
  if (!state) {
    throw new Error('useDrawState must be used inside DrawStateProvider');
  }
  return state;
}
