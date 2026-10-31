import {cropBoxFromZoomPan, maxPan} from '../cropBox';

describe('cropBoxFromZoomPan', () => {
  test('zoom 1, no pan = centre square (cover fit)', () => {
    // Portrait 400x800 in a 200 tile: cover scale 0.5, displayed
    // 200x400, visible window is the centre 400x400 square.
    const box = cropBoxFromZoomPan(400, 800, 200, 1, 0, 0);
    expect(box).toEqual({x: 0, y: 200, width: 400, height: 400});
  });

  test('zoom 2, no pan = centre quarter', () => {
    const box = cropBoxFromZoomPan(400, 800, 200, 2, 0, 0);
    expect(box).toEqual({x: 100, y: 300, width: 200, height: 200});
  });

  test('pan to the top edge moves the window to the top', () => {
    // At zoom 1, max vertical pan is (400-200)/2 = 100 tile px.
    const box = cropBoxFromZoomPan(400, 800, 200, 1, 0, 100);
    expect(box.y).toBe(0);
    expect(box.height).toBe(400);
  });

  test('maxPan is zero on the axis the image exactly fills', () => {
    // Landscape 800x400: height exactly fills the tile at zoom 1,
    // width overflows, so only horizontal pan is possible.
    expect(maxPan(800, 400, 200, 1)).toEqual({x: 100, y: 0});
  });
});
