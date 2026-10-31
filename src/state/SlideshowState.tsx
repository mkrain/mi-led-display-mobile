import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {RGB} from '../conversion/convert';
import {
  activeSlideshow,
  addItemToActive,
  addItemToSlideshow,
  clearActive,
  createSlideshow,
  deleteSlideshow,
  EMPTY_LIBRARY,
  makeSlideshowItem,
  markSlideshowSaved,
  moveItemInActive,
  nextDefaultName,
  removeItemFromActive,
  renameSlideshow,
  setActiveSlideshow,
  updateItemPixels,
  type AddResult,
  type LastSaved,
  type Slideshow,
  type SlideshowLibrary,
} from '../slideshow/library';
import {
  loadSlideshowLibrary,
  saveSlideshowLibrary,
} from '../slideshow/storage';

/**
 * Slideshow library state, held above the navigator
 * (Oct 30, 2026, first multiple-slideshows iteration).
 *
 * Previously this was a single queue; now it is a library
 * of named slideshows with one active slideshow. Item
 * operations (add, remove, move, clear) operate on the
 * active slideshow only, so existing callers keep the same
 * shape: `items` is the active slideshow's items, and
 * `addItem` adds to the active slideshow (auto-creating a
 * default-named one when the library is empty, since
 * delete-last is allowed). Adding to a specific slideshow
 * via the ▾ picker also makes that slideshow active, so
 * the Add button's label stays truthful about where the
 * next tap-add goes.
 *
 * Everything here is LOCAL ONLY, as before: adding,
 * removing, reordering, creating, renaming, and deleting
 * never touch the panel. Saving to the panel is a separate
 * step (Replace), and only the Slideshow screen does it.
 *
 * Ids are `Date.now()` plus a per-session counter, so two
 * items / slideshows created in the same millisecond still
 * get distinct ids.
 */
export type SlideshowState = {
  slideshows: Slideshow[];
  activeSlideshow: Slideshow | null;
  /** Active slideshow's items, or [] when there is no active slideshow. Kept for existing callers. */
  items: Slideshow['items'];
  activeId: string | null;
  lastSaved: LastSaved | null;
  /** Adds to the active slideshow; auto-creates a default one when the library is empty. */
  addItem: (label: string, detail: string, pixels: RGB[]) => AddResult;
  /** Adds to a named slideshow and makes it active. */
  addItemToSlideshow: (
    slideshowId: string,
    label: string,
    detail: string,
    pixels: RGB[],
  ) => AddResult;
  /** Creates a default-named slideshow, makes it active, and adds the item to it. */
  addItemToNewSlideshow: (
    label: string,
    detail: string,
    pixels: RGB[],
  ) => AddResult;
  createSlideshow: (name: string) => string | null;
  renameSlideshow: (id: string, name: string) => void;
  deleteSlideshow: (id: string) => void;
  setActiveSlideshow: (id: string) => void;
  removeItemById: (id: string) => void;
  moveItemById: (id: string, direction: 'up' | 'down') => void;
  clearQueue: () => void;
  markSlideshowSaved: (id: string) => void;
  /** Edit in Draw: replace one item's pixels in place, in any slideshow (not just the active one). */
  updateItemPixels: (
    slideshowId: string,
    itemId: string,
    pixels: RGB[],
  ) => void;
};

const SlideshowStateContext = createContext<SlideshowState | null>(null);

export function SlideshowStateProvider({children}: {children: ReactNode}) {
  const [library, setLibrary] = useState<SlideshowLibrary>(EMPTY_LIBRARY);
  const [loaded, setLoaded] = useState(false);
  const idCounterRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    loadSlideshowLibrary().then(next => {
      if (!cancelled) {
        setLibrary(next);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist after the initial load only: without the loaded
  // guard, the first render's empty library would overwrite
  // a stored library before the load finished.
  useEffect(() => {
    if (loaded) {
      saveSlideshowLibrary(library).catch(() => undefined);
    }
  }, [library, loaded]);

  function nextId(): string {
    idCounterRef.current += 1;
    return `${Date.now()}-${idCounterRef.current}`;
  }

  const active = activeSlideshow(library);

  const addItem = (label: string, detail: string, pixels: RGB[]) => {
    const item = makeSlideshowItem(nextId(), label, detail, pixels);
    // Only generate a slideshow id when one will actually
    // be created (empty library); otherwise addItemToActive
    // would burn an id on every add for nothing.
    const activeBefore = activeSlideshow(library);
    const {library: next, result} = activeBefore
      ? addItemToSlideshow(library, activeBefore.id, item)
      : addItemToActive(library, item, nextId());
    setLibrary(next);
    return result;
  };

  const addItemToSlideshowById = (
    slideshowId: string,
    label: string,
    detail: string,
    pixels: RGB[],
  ) => {
    const item = makeSlideshowItem(nextId(), label, detail, pixels);
    const {library: next, result} = addItemToSlideshow(
      library,
      slideshowId,
      item,
    );
    if (result.added) {
      setLibrary(next);
    }
    return result;
  };

  const addItemToNewSlideshow = (
    label: string,
    detail: string,
    pixels: RGB[],
  ) => {
    const name = nextDefaultName(library.slideshows);
    const slideshowId = nextId();
    const item = makeSlideshowItem(nextId(), label, detail, pixels);
    const created = createSlideshow(library, slideshowId, name);
    const {library: next, result} = addItemToSlideshow(
      created,
      slideshowId,
      item,
    );
    setLibrary(next);
    return {...result, created: true};
  };

  const createSlideshowByName = (name: string) => {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      return null;
    }
    const id = nextId();
    setLibrary(prev => createSlideshow(prev, id, trimmed));
    return id;
  };

  return (
    <SlideshowStateContext.Provider
      value={{
        slideshows: library.slideshows,
        activeSlideshow: active,
        items: active?.items ?? [],
        activeId: library.activeId,
        lastSaved: library.lastSaved,
        addItem,
        addItemToSlideshow: addItemToSlideshowById,
        addItemToNewSlideshow,
        createSlideshow: createSlideshowByName,
        renameSlideshow: (id, name) =>
          setLibrary(prev => renameSlideshow(prev, id, name)),
        deleteSlideshow: id =>
          setLibrary(prev => deleteSlideshow(prev, id)),
        setActiveSlideshow: id =>
          setLibrary(prev => setActiveSlideshow(prev, id)),
        removeItemById: id =>
          setLibrary(prev => removeItemFromActive(prev, id)),
        moveItemById: (id, direction) =>
          setLibrary(prev => moveItemInActive(prev, id, direction)),
        clearQueue: () => setLibrary(prev => clearActive(prev)),
        markSlideshowSaved: id =>
          setLibrary(prev => markSlideshowSaved(prev, id, Date.now())),
        updateItemPixels: (slideshowId, itemId, pixels) =>
          setLibrary(prev =>
            updateItemPixels(prev, slideshowId, itemId, pixels),
          ),
      }}
    >
      {children}
    </SlideshowStateContext.Provider>
  );
}

export function useSlideshowState(): SlideshowState {
  const state = useContext(SlideshowStateContext);
  if (!state) {
    throw new Error(
      'useSlideshowState must be used inside SlideshowStateProvider',
    );
  }
  return state;
}
