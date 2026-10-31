import type {RGB} from '../conversion/convert';
import {
  appendItem,
  isQueueFull,
  isValidSlideshowItem,
  moveItem,
  removeItem,
  type SlideshowItem,
} from './queue';

/**
 * Multiple slideshows library (Oct 30, 2026, first iteration).
 *
 * The panel holds ONE set at a time (max 10, Replace wipes it),
 * so "multiple slideshows" is an app-local library, not panel
 * state: several named sets are stored here, one is active
 * (the editing / next-save target), and only the active set
 * is ever sent to the panel. Each slideshow still caps at 10
 * items — that cap is a panel limit, not a library limit, so
 * a library of 10 slideshows is ~300KB of JSON, not a problem.
 *
 * Pure functions only; the provider in state/SlideshowState.tsx
 * owns React state and persistence. Move-between-slideshows
 * and duplicate are deliberately NOT here yet — they are
 * later, after this first iteration is built and tested.
 */
export type Slideshow = {
  id: string;
  name: string;
  items: SlideshowItem[];
};

export type LastSaved = {
  slideshowId: string;
  savedAt: number;
};

export type SlideshowLibrary = {
  slideshows: Slideshow[];
  activeId: string | null;
  lastSaved: LastSaved | null;
};

export const EMPTY_LIBRARY: SlideshowLibrary = {
  slideshows: [],
  activeId: null,
  lastSaved: null,
};

/** Default name for a new slideshow, Oct 30, 2026 decision. */
export const DEFAULT_SLIDESHOW_NAME = 'My slideshow';

/**
 * Next default name that does not collide with an existing
 * slideshow: "My slideshow" if free, otherwise
 * "My slideshow 2", "My slideshow 3", and so on. Used for
 * the create dialog's prefill and for auto-creating a
 * slideshow when Add is tapped with an empty library.
 */
export function nextDefaultName(slideshows: readonly Slideshow[]): string {
  const names = new Set(slideshows.map(s => s.name));
  if (!names.has(DEFAULT_SLIDESHOW_NAME)) {
    return DEFAULT_SLIDESHOW_NAME;
  }
  let n = 2;
  while (names.has(`${DEFAULT_SLIDESHOW_NAME} ${n}`)) {
    n += 1;
  }
  return `${DEFAULT_SLIDESHOW_NAME} ${n}`;
}

export function isValidSlideshow(value: unknown): value is Slideshow {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<Slideshow>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.name === 'string' &&
    Array.isArray(candidate.items) &&
    candidate.items.every(isValidSlideshowItem)
  );
}

export function isValidLibrary(value: unknown): value is SlideshowLibrary {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<SlideshowLibrary>;
  if (!Array.isArray(candidate.slideshows)) {
    return false;
  }
  if (!candidate.slideshows.every(isValidSlideshow)) {
    return false;
  }
  const ids = new Set(candidate.slideshows.map(s => s.id));
  if (ids.size !== candidate.slideshows.length) {
    return false;
  }
  if (
    candidate.activeId !== null &&
    (typeof candidate.activeId !== 'string' ||
      !ids.has(candidate.activeId))
  ) {
    return false;
  }
  if (candidate.lastSaved !== null && candidate.lastSaved !== undefined) {
    const last = candidate.lastSaved as Partial<LastSaved>;
    if (
      typeof last.slideshowId !== 'string' ||
      !ids.has(last.slideshowId) ||
      typeof last.savedAt !== 'number'
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Migration from the old single-queue storage: an old queue
 * becomes one slideshow named "My slideshow", made active.
 * An empty old queue migrates to an empty library, not to an
 * empty slideshow — an empty library is a valid state now
 * (delete-last is allowed), and Add auto-creates a default
 * slideshow when there is none. Returns null when the input
 * is not a valid old queue at all.
 */
export function libraryFromOldQueue(
  oldItems: unknown,
  newId: string,
): SlideshowLibrary | null {
  if (!Array.isArray(oldItems)) {
    return null;
  }
  const items = oldItems.filter(isValidSlideshowItem);
  if (items.length === 0) {
    return EMPTY_LIBRARY;
  }
  return {
    slideshows: [{id: newId, name: DEFAULT_SLIDESHOW_NAME, items}],
    activeId: newId,
    lastSaved: null,
  };
}

export function activeSlideshow(
  library: SlideshowLibrary,
): Slideshow | null {
  if (library.activeId === null) {
    return null;
  }
  return library.slideshows.find(s => s.id === library.activeId) ?? null;
}

export function createSlideshow(
  library: SlideshowLibrary,
  id: string,
  name: string,
): SlideshowLibrary {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return library;
  }
  return {
    ...library,
    slideshows: [...library.slideshows, {id, name: trimmed, items: []}],
    activeId: id,
  };
}

export function renameSlideshow(
  library: SlideshowLibrary,
  id: string,
  name: string,
): SlideshowLibrary {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return library;
  }
  return {
    ...library,
    slideshows: library.slideshows.map(s =>
      s.id === id ? {...s, name: trimmed} : s,
    ),
  };
}

/**
 * Delete a slideshow. Deleting the active one falls back to
 * the first remaining slideshow, or to no active slideshow
 * when the library is now empty — delete-last is allowed,
 * and an empty library is valid (Add auto-creates a default
 * slideshow when there is none).
 */
export function deleteSlideshow(
  library: SlideshowLibrary,
  id: string,
): SlideshowLibrary {
  const slideshows = library.slideshows.filter(s => s.id !== id);
  const lastSaved =
    library.lastSaved?.slideshowId === id ? null : library.lastSaved;
  return {
    slideshows,
    activeId:
      library.activeId === id
        ? (slideshows[0]?.id ?? null)
        : library.activeId,
    lastSaved,
  };
}

export function setActiveSlideshow(
  library: SlideshowLibrary,
  id: string,
): SlideshowLibrary {
  if (!library.slideshows.some(s => s.id === id)) {
    return library;
  }
  return {...library, activeId: id};
}

export type AddResult = {
  added: boolean;
  /** Name of the slideshow the item went to, or would have gone to if full. */
  name: string;
  /** True when this add created the slideshow it went to. */
  created: boolean;
};

/**
 * Add an item to a named slideshow, and make that slideshow
 * active (so the Add button's label stays truthful about
 * where the next tap-add goes). Returns added=false when
 * that slideshow is full at 10 — nothing is added, and no
 * other slideshow is silently substituted.
 */
export function addItemToSlideshow(
  library: SlideshowLibrary,
  slideshowId: string,
  item: SlideshowItem,
): {library: SlideshowLibrary; result: AddResult} {
  const target = library.slideshows.find(s => s.id === slideshowId);
  if (!target) {
    return {library, result: {added: false, name: '', created: false}};
  }
  if (isQueueFull(target.items)) {
    return {
      library,
      result: {added: false, name: target.name, created: false},
    };
  }
  return {
    library: {
      ...library,
      slideshows: library.slideshows.map(s =>
        s.id === slideshowId ? {...s, items: appendItem(s.items, item)} : s,
      ),
      activeId: slideshowId,
    },
    result: {added: true, name: target.name, created: false},
  };
}

/**
 * Add an item to the active slideshow. When there is no
 * active slideshow (empty library), a default-named
 * slideshow is created first and the item goes there, so
 * Add is never blocked by an empty library.
 */
export function addItemToActive(
  library: SlideshowLibrary,
  item: SlideshowItem,
  newId: string,
): {library: SlideshowLibrary; result: AddResult} {
  const active = activeSlideshow(library);
  if (!active) {
    const name = nextDefaultName(library.slideshows);
    const created = createSlideshow(library, newId, name);
    const added = addItemToSlideshow(created, newId, item);
    return {
      library: added.library,
      result: {...added.result, created: true},
    };
  }
  return addItemToSlideshow(library, active.id, item);
}

/** Item operations on the active slideshow only. */
export function removeItemFromActive(
  library: SlideshowLibrary,
  itemId: string,
): SlideshowLibrary {
  const active = activeSlideshow(library);
  if (!active) {
    return library;
  }
  return {
    ...library,
    slideshows: library.slideshows.map(s =>
      s.id === active.id ? {...s, items: removeItem(s.items, itemId)} : s,
    ),
  };
}

export function moveItemInActive(
  library: SlideshowLibrary,
  itemId: string,
  direction: 'up' | 'down',
): SlideshowLibrary {
  const active = activeSlideshow(library);
  if (!active) {
    return library;
  }
  return {
    ...library,
    slideshows: library.slideshows.map(s =>
      s.id === active.id
        ? {...s, items: moveItem(s.items, itemId, direction)}
        : s,
    ),
  };
}

export function clearActive(
  library: SlideshowLibrary,
): SlideshowLibrary {
  const active = activeSlideshow(library);
  if (!active) {
    return library;
  }
  return {
    ...library,
    slideshows: library.slideshows.map(s =>
      s.id === active.id ? {...s, items: []} : s,
    ),
  };
}

export function markSlideshowSaved(
  library: SlideshowLibrary,
  slideshowId: string,
  savedAt: number,
): SlideshowLibrary {
  if (!library.slideshows.some(s => s.id === slideshowId)) {
    return library;
  }
  return {
    ...library,
    lastSaved: {slideshowId, savedAt},
  };
}

function pixelsEqual(a: readonly RGB[], b: readonly RGB[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (p, i) => p[0] === b[i][0] && p[1] === b[i][1] && p[2] === b[i][2],
    )
  );
}

/**
 * Edit in Draw (Oct 30, 2026): replace one slideshow item's
 * pixels in place. Order, id, and label are unchanged, so
 * the item stays in the same cycle position. The detail
 * gains an " · Edited" marker on a real change, so a
 * "Photo · Smart · Sat 2.5" detail does not keep claiming
 * to describe pixels that have since been repainted — but
 * only on a real change: saving an unpainted grid back is
 * a no-op, not a spurious edit marker. Unknown slideshow
 * or item ids, and unchanged pixels, leave the library
 * untouched (the item may have been deleted while Draw
 * was open, in which case there is nothing to update).
 */
export function updateItemPixels(
  library: SlideshowLibrary,
  slideshowId: string,
  itemId: string,
  pixels: RGB[],
): SlideshowLibrary {
  const target = library.slideshows.find(s => s.id === slideshowId);
  const item = target?.items.find(i => i.id === itemId);
  if (!target || !item || pixelsEqual(item.pixels, pixels)) {
    return library;
  }
  const detail = item.detail.endsWith(' · Edited')
    ? item.detail
    : `${item.detail} · Edited`;
  return {
    ...library,
    slideshows: library.slideshows.map(s =>
      s.id === slideshowId
        ? {
            ...s,
            items: s.items.map(i =>
              i.id === itemId
                ? {...i, pixels: pixels.map(p => [...p] as RGB), detail}
                : i,
            ),
          }
        : s,
    ),
  };
}

/** Frozen item construction, shared by the provider's add paths. */
export function makeSlideshowItem(
  id: string,
  label: string,
  detail: string,
  pixels: RGB[],
): SlideshowItem {
  return {id, label, detail, pixels: [...pixels]};
}
