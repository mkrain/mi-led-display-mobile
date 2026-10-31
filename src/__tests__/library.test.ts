import {
  addItemToActive,
  addItemToSlideshow,
  createSlideshow,
  deleteSlideshow,
  EMPTY_LIBRARY,
  isValidLibrary,
  libraryFromOldQueue,
  makeSlideshowItem,
  markSlideshowSaved,
  nextDefaultName,
  renameSlideshow,
  setActiveSlideshow,
  type SlideshowLibrary,
  updateItemPixels,
} from '../slideshow/library';
import type {RGB} from '../conversion/convert';

function blackGrid(): RGB[] {
  return Array.from({length: 256}, () => [0, 0, 0] as RGB);
}

function item(id: string) {
  return makeSlideshowItem(id, 'One', 'test', blackGrid());
}

function libraryWithTwo(): SlideshowLibrary {
  return {
    slideshows: [
      {id: 'a', name: 'My slideshow', items: [item('1')]},
      {id: 'b', name: 'Holiday', items: []},
    ],
    activeId: 'a',
    lastSaved: null,
  };
}

describe('slideshow library', () => {
  test('nextDefaultName avoids collisions', () => {
    expect(nextDefaultName([])).toBe('My slideshow');
    expect(nextDefaultName(libraryWithTwo().slideshows)).toBe(
      'My slideshow 2',
    );
  });

  test('migration: old queue becomes one active slideshow, empty queue becomes empty library', () => {
    const migrated = libraryFromOldQueue([item('1'), item('2')], 'm1');
    expect(migrated?.slideshows).toHaveLength(1);
    expect(migrated?.slideshows[0].name).toBe('My slideshow');
    expect(migrated?.slideshows[0].items).toHaveLength(2);
    expect(migrated?.activeId).toBe('m1');
    expect(libraryFromOldQueue([], 'm1')).toEqual(EMPTY_LIBRARY);
    expect(libraryFromOldQueue('nope', 'm1')).toBeNull();
  });

  test('create makes the new slideshow active, rename trims and ignores blank', () => {
    const created = createSlideshow(EMPTY_LIBRARY, 'n1', '  Weekend  ');
    expect(created.activeId).toBe('n1');
    expect(created.slideshows[0].name).toBe('Weekend');
    expect(renameSlideshow(created, 'n1', '  Holiday ')).toMatchObject({
      slideshows: [{name: 'Holiday'}],
    });
    expect(renameSlideshow(created, 'n1', '   ')).toBe(created);
  });

  test('delete active falls back to first remaining, delete-last leaves an empty library', () => {
    const lib = libraryWithTwo();
    const after = deleteSlideshow(lib, 'a');
    expect(after.activeId).toBe('b');
    expect(deleteSlideshow(after, 'b')).toEqual({
      slideshows: [],
      activeId: null,
      lastSaved: null,
    });
  });

  test('setActive ignores unknown ids', () => {
    const lib = libraryWithTwo();
    expect(setActiveSlideshow(lib, 'nope')).toBe(lib);
    expect(setActiveSlideshow(lib, 'b').activeId).toBe('b');
  });

  test('add to a slideshow makes it active and respects the 10-item cap', () => {
    const lib = libraryWithTwo();
    const {library, result} = addItemToSlideshow(lib, 'b', item('9'));
    expect(result.added).toBe(true);
    expect(result.name).toBe('Holiday');
    expect(library.activeId).toBe('b');
    expect(library.slideshows[1].items).toHaveLength(1);

    const full = {
      ...lib,
      slideshows: [
        {
          id: 'a',
          name: 'My slideshow',
          items: Array.from({length: 10}, (_, i) => item(`f${i}`)),
        },
        {id: 'b', name: 'Holiday', items: []},
      ],
    };
    const fullResult = addItemToSlideshow(full, 'a', item('x'));
    expect(fullResult.result.added).toBe(false);
    expect(fullResult.result.name).toBe('My slideshow');
    expect(fullResult.library.slideshows[0].items).toHaveLength(10);
  });

  test('add to active with an empty library auto-creates a default slideshow', () => {
    const {library, result} = addItemToActive(EMPTY_LIBRARY, item('1'), 'n1');
    expect(result).toEqual({
      added: true,
      name: 'My slideshow',
      created: true,
    });
    expect(library.slideshows).toHaveLength(1);
    expect(library.activeId).toBe('n1');
  });

  test('markSaved ignores unknown slideshows, library validation rejects bad shapes', () => {
    const lib = libraryWithTwo();
    expect(markSlideshowSaved(lib, 'nope', 123).lastSaved).toBeNull();
    expect(
      markSlideshowSaved(lib, 'b', 123).lastSaved,
    ).toEqual({slideshowId: 'b', savedAt: 123});
    expect(isValidLibrary(lib)).toBe(true);
    expect(isValidLibrary({slideshows: [], activeId: 'nope'})).toBe(false);
    expect(
      isValidLibrary({
        slideshows: [{id: 'a', name: 'X', items: []}],
        activeId: 'a',
        lastSaved: {slideshowId: 'nope', savedAt: 1},
      }),
    ).toBe(false);
  });

  test('updateItemPixels replaces pixels in place, marks Edited once, and is a no-op for unknown ids or unchanged pixels', () => {
    const lib = libraryWithTwo();
    const whiteGrid: RGB[] = Array.from({length: 256}, () => [255, 255, 255] as RGB);
    const updated = updateItemPixels(lib, 'a', '1', whiteGrid);
    expect(updated.slideshows[0].items[0].pixels).toEqual(whiteGrid);
    expect(updated.slideshows[0].items[0].label).toBe('One');
    expect(updated.slideshows[0].items[0].detail).toBe('test · Edited');
    expect(updated.slideshows[1]).toBe(lib.slideshows[1]);
    // Second edit does not stack the marker.
    const again = updateItemPixels(updated, 'a', '1', blackGrid());
    expect(again.slideshows[0].items[0].detail).toBe('test · Edited');
    expect(updateItemPixels(lib, 'nope', '1', whiteGrid)).toBe(lib);
    expect(updateItemPixels(lib, 'a', 'nope', whiteGrid)).toBe(lib);
    expect(updateItemPixels(lib, 'a', '1', blackGrid())).toBe(lib);
  });
});
