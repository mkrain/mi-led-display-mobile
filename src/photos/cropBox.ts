import type {CropBox} from '../conversion/convert';

/**
 * Crop box for a square tile, from a pinch/pan crop editor.
 *
 * The tile shows the image with "cover" fit: the image is scaled
 * uniformly so it fills the square tile, and the excess is cropped
 * (initially the centre square, matching ManualCrop's old default
 * for picked photos). Zoom multiplies that scale; pan moves the
 * image inside the tile, clamped so the image always covers the
 * tile (no empty gaps).
 *
 * Tile coordinates: origin at the tile's top-left, pan in tile
 * pixels from the centred position. The visible window, converted
 * back to source-image pixels, is always square (tile is square,
 * scale is uniform), so ManualCrop's fill to 16x16 is undistorted.
 */
export function cropBoxFromZoomPan(
  imageWidth: number,
  imageHeight: number,
  tileSize: number,
  zoom: number,
  panX: number,
  panY: number,
): CropBox {
  const baseScale = Math.max(tileSize / imageWidth, tileSize / imageHeight);
  const scale = baseScale * zoom;
  const displayedWidth = imageWidth * scale;
  const displayedHeight = imageHeight * scale;
  // Image origin in tile coordinates (centred, plus pan).
  const originX = (tileSize - displayedWidth) / 2 + panX;
  const originY = (tileSize - displayedHeight) / 2 + panY;
  // Tile bounds, converted back to source pixels.
  const x = Math.round((0 - originX) / scale);
  const y = Math.round((0 - originY) / scale);
  const size = Math.round(tileSize / scale);
  const clampedX = Math.min(Math.max(0, x), imageWidth - 1);
  const clampedY = Math.min(Math.max(0, y), imageHeight - 1);
  return {
    x: clampedX,
    y: clampedY,
    width: Math.min(size, imageWidth - clampedX),
    height: Math.min(size, imageHeight - clampedY),
  };
}

/** Pan clamp for a given zoom: the image must always cover the tile. */
export function maxPan(
  imageWidth: number,
  imageHeight: number,
  tileSize: number,
  zoom: number,
): {x: number; y: number} {
  const baseScale = Math.max(tileSize / imageWidth, tileSize / imageHeight);
  const scale = baseScale * zoom;
  return {
    x: Math.max(0, (imageWidth * scale - tileSize) / 2),
    y: Math.max(0, (imageHeight * scale - tileSize) / 2),
  };
}
