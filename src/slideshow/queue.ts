import type {RGB} from '../conversion/convert';

/**
 * Slideshow queue, LOCAL ONLY (Oct 30, 2026).
 *
 * A queue item is a frozen 16x16 pixel grid plus a label. It is
 * frozen on purpose: once added, it no longer depends on the
 * picked photo (which only lives in memory in PhotoState) or on
 * the Draw grid (which is local to DrawScreen). That is what
 * lets the queue survive tab switches and app restarts, and what
 * lets a user add, remove, and reorder items before anything
 * touches the panel. No function here writes to BLE.
 *
 * Order in the array IS the panel cycle order: first item first.
 * Pure array operations, fully unit-testable; the provider in
 * state/SlideshowState.tsx owns persistence and React state.
 */
export type SlideshowItem = {
  id: string;
  label: string;
  detail: string;
  pixels: RGB[];
};

/**
 * Panel slideshow capacity, Oct 30, 2026: 10 items.
 *
 * The stock app only lets you add 10, and a device test the
 * same day proved the panel itself wraps: a 14-item Replace
 * save (3 different, 11 the same) kept only the LAST ~10, so
 * new saves overwrite the oldest slots instead of failing or
 * truncating the new items. The exact count (10 vs 11) could
 * not be told apart in that test because the 11 identical
 * images look the same in a cycle, so the cap here is the
 * conservative 10 from the stock app: if the panel actually
 * holds 11, capping at 10 under-uses it by one, but never
 * silently drops an item. The provider enforces this cap on
 * Add, and the Slideshow screen blocks Save over the cap, so
 * a queue can never reach the panel in a state where the
 * panel would silently drop its oldest items.
 */
export const MAX_SLIDESHOW_ITEMS = 10;

export function isQueueFull(items: readonly SlideshowItem[]): boolean {
  return items.length >= MAX_SLIDESHOW_ITEMS;
}

export function isValidPixels(pixels: unknown): pixels is RGB[] {
  if (!Array.isArray(pixels) || pixels.length !== 256) {
    return false;
  }
  return pixels.every(
    p =>
      Array.isArray(p) &&
      p.length === 3 &&
      p.every(v => Number.isInteger(v) && v >= 0 && v <= 255),
  );
}

export function isValidSlideshowItem(item: unknown): item is SlideshowItem {
  if (typeof item !== 'object' || item === null) {
    return false;
  }
  const candidate = item as Partial<SlideshowItem>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.label === 'string' &&
    typeof candidate.detail === 'string' &&
    isValidPixels(candidate.pixels)
  );
}

/** Append an item. Returns a new array; the input is untouched. */
export function appendItem(
  items: readonly SlideshowItem[],
  item: SlideshowItem,
): SlideshowItem[] {
  return [...items, item];
}

/** Remove an item by id. Unknown ids leave the array unchanged. */
export function removeItem(
  items: readonly SlideshowItem[],
  id: string,
): SlideshowItem[] {
  return items.filter(item => item.id !== id);
}

/**
 * Move an item one step up (towards the front, i.e. earlier in
 * the panel cycle) or down. Moving the first item up, or the
 * last item down, leaves the array unchanged. Returns a new array.
 */
export function moveItem(
  items: readonly SlideshowItem[],
  id: string,
  direction: 'up' | 'down',
): SlideshowItem[] {
  const index = items.findIndex(item => item.id === id);
  if (index === -1) {
    return [...items];
  }
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= items.length) {
    return [...items];
  }
  const next = [...items];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return next;
}
