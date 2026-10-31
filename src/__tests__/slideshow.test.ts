import {
  appendItem,
  isQueueFull,
  MAX_SLIDESHOW_ITEMS,
  isValidPixels,
  isValidSlideshowItem,
  moveItem,
  removeItem,
  type SlideshowItem,
} from '../slideshow/queue';
import type {RGB} from '../conversion/convert';

function blackGrid(): RGB[] {
  return Array.from({length: 256}, () => [0, 0, 0] as RGB);
}

function item(id: string, label: string): SlideshowItem {
  return {id, label, detail: 'test', pixels: blackGrid()};
}

describe('slideshow queue', () => {
  test('append does not mutate the input', () => {
    const items = [item('1', 'One')];
    const next = appendItem(items, item('2', 'Two'));
    expect(next).toHaveLength(2);
    expect(items).toHaveLength(1);
  });

  test('remove by id, unknown id is a no-op', () => {
    const items = [item('1', 'One'), item('2', 'Two')];
    expect(removeItem(items, '1')).toHaveLength(1);
    expect(removeItem(items, '1')[0].id).toBe('2');
    expect(removeItem(items, 'nope')).toHaveLength(2);
  });

  test('move up/down swaps one step, edges are no-ops', () => {
    const items = [item('1', 'One'), item('2', 'Two'), item('3', 'Three')];
    expect(moveItem(items, '2', 'up').map(i => i.id)).toEqual(['2', '1', '3']);
    expect(moveItem(items, '2', 'down').map(i => i.id)).toEqual([
      '1',
      '3',
      '2',
    ]);
    expect(moveItem(items, '1', 'up').map(i => i.id)).toEqual([
      '1',
      '2',
      '3',
    ]);
    expect(moveItem(items, '3', 'down').map(i => i.id)).toEqual([
      '1',
      '2',
      '3',
    ]);
    expect(moveItem(items, 'nope', 'up').map(i => i.id)).toEqual([
      '1',
      '2',
      '3',
    ]);
  });

  test('pixel and item validation', () => {
    expect(isValidPixels(blackGrid())).toBe(true);
    expect(isValidPixels(Array.from({length: 255}, () => [0, 0, 0]))).toBe(
      false,
    );
    expect(isValidPixels([[0, 0, 300]])).toBe(false);
    expect(isValidSlideshowItem(item('1', 'One'))).toBe(true);
    expect(isValidSlideshowItem({id: '1', label: 'One'})).toBe(false);
    expect(isValidSlideshowItem(null)).toBe(false);
  });

  test('queue cap is 10, matching the panel wrap limit', () => {
    expect(MAX_SLIDESHOW_ITEMS).toBe(10);
    const nine = Array.from({length: 9}, (_, i) => item(`${i}`, 'x'));
    const ten = [...nine, item('9', 'x')];
    const eleven = [...ten, item('10', 'x')];
    expect(isQueueFull(nine)).toBe(false);
    expect(isQueueFull(ten)).toBe(true);
    expect(isQueueFull(eleven)).toBe(true);
  });
});
