import React, {useRef} from 'react';
import {Platform, StatusBar, StyleSheet, View} from 'react-native';
import type {RGB} from '../conversion/convert';

export function rgbToCss([r, g, b]: RGB): string {
  return `rgb(${r},${g},${b})`;
}

interface PixelGridProps {
  pixels: RGB[];
  cellSize?: number;
  /** When given, the grid paints: tap a cell, or drag across cells. */
  onPixelPress?: (index: number) => void;
  /** Called when a paint gesture starts / ends, so a parent ScrollView can lock scrolling during the drag. */
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

/**
 * Renders a 16x16 grid with hard pixels (plain Views, no smoothing).
 *
 * Without onPixelPress, this is a static preview (Photo, Slideshow)
 * and takes no touches. With onPixelPress (Draw only), the grid
 * itself is the responder: touching down paints the cell under
 * the finger, and dragging across the grid paints each new cell
 * entered — the stock app's touch drawing.
 *
 * Coordinates, Oct 30, 2026 fix: do NOT use locationX/Y. Those
 * are relative to the view that was actually touched, so a touch
 * on any cell reported coordinates inside that cell and the
 * first paint always landed at (0,0), the top left, no matter
 * where the finger was. Instead, paint from pageX/pageY minus
 * the grid's measured position on screen (measureInWindow),
 * which is independent of which child view got the touch.
 * The grid position is re-measured on EVERY gesture start,
 * before painting — measuring only once at layout was the
 * second bug: if you scrolled or navigated after layout, the
 * stored top was stale by the scroll amount, and a centre
 * touch painted ~5 rows low. Scrolling is locked during the
 * gesture, so the position measured at gesture start stays
 * valid for the whole drag. If measuring has not completed
 * yet, locationX/Y are used as a fallback rather than
 * painting nothing.
 *
 * Android, Oct 31, 2026: pageY and measureInWindow do NOT
 * share a coordinate system on Android. Diagnostic taps
 * (Samsung A15, diag build 05272f3) proved it exactly:
 * top-left centre tap gave pageY - originY = 35.76 for a
 * true offset of 10.66 (locationY, cell-relative), and a
 * row-8 centre tap gave 194.51 for a true offset of
 * 169.41 — both excesses reduce to the same 25.10 once
 * the finger's position inside the cell (locationY) is
 * subtracted, while X was exact both times (excess
 * +0.98 / -1.22, pure finger placement). So pageY runs
 * ~25 higher than measureInWindow, the status-bar height,
 * and every tap painted one row low. The fix is to
 * subtract StatusBar.currentHeight from pageY on Android
 * only; iOS shares the window system, so it is untouched
 * (currentHeight is undefined there, and the Platform
 * guard keeps it 0 regardless). Do NOT "fix" this by
 * shifting a row, and do NOT revert to locationX/Y — the
 * Oct 30 bug proved location is cell-relative.
 */
export function PixelGrid({
  pixels,
  cellSize = 20,
  onPixelPress,
  onDragStart,
  onDragEnd,
}: PixelGridProps) {
  const lastIndexRef = useRef<number | null>(null);
  const gridRef = useRef<View | null>(null);
  const gridPageRef = useRef<{x: number; y: number} | null>(null);

  function measureGrid(callback?: () => void) {
    if (!gridRef.current) {
      if (callback) {
        callback();
      }
      return;
    }
    gridRef.current.measureInWindow((x, y) => {
      gridPageRef.current = {x, y};
      if (callback) {
        callback();
      }
    });
  }

  function paintAtPage(pageX: number, pageY: number) {
    const origin = gridPageRef.current;
    if (!origin || !onPixelPress) {
      return;
    }
    // Android status-bar offset (Oct 31, 2026, see header):
    // pageY is ~25 higher than measureInWindow's system,
    // X is unaffected. Subtract it before dividing, or
    // every tap paints one row low. iOS: 0.
    const adjustedY =
      Platform.OS === 'android'
        ? pageY - (StatusBar.currentHeight ?? 0)
        : pageY;
    const col = Math.floor((pageX - origin.x) / cellSize);
    const row = Math.floor((adjustedY - origin.y) / cellSize);
    if (col < 0 || col >= 16 || row < 0 || row >= 16) {
      return;
    }
    const index = row * 16 + col;
    if (index === lastIndexRef.current) {
      return;
    }
    lastIndexRef.current = index;
    onPixelPress(index);
  }

  function paintAtLocation(x: number, y: number) {
    if (!onPixelPress) {
      return;
    }
    const col = Math.floor(x / cellSize);
    const row = Math.floor(y / cellSize);
    if (col < 0 || col >= 16 || row < 0 || row >= 16) {
      return;
    }
    const index = row * 16 + col;
    if (index === lastIndexRef.current) {
      return;
    }
    lastIndexRef.current = index;
    onPixelPress(index);
  }

  return (
    <View
      ref={gridRef}
      style={[styles.grid, {width: cellSize * 16}]}
      onLayout={() => measureGrid()}
      onStartShouldSetResponder={onPixelPress ? () => true : undefined}
      onResponderGrant={event => {
        if (!onPixelPress) {
          return;
        }
        lastIndexRef.current = null;
        if (onDragStart) {
          onDragStart();
        }
        const {pageX, pageY, locationX, locationY} = event.nativeEvent;
        // Always re-measure before the first paint: the layout
        // measurement can be stale by however far the ScrollView
        // has moved the grid since layout, and that stale offset
        // is exactly the ~5-row error seen on device. The first
        // paint waits for the measure callback (a frame at most)
        // rather than painting at a stale position.
        measureGrid(() => {
          if (gridPageRef.current) {
            paintAtPage(pageX, pageY);
          } else {
            paintAtLocation(locationX, locationY);
          }
        });
      }}
      onResponderMove={event => {
        if (gridPageRef.current) {
          paintAtPage(event.nativeEvent.pageX, event.nativeEvent.pageY);
        } else {
          paintAtLocation(
            event.nativeEvent.locationX,
            event.nativeEvent.locationY,
          );
          measureGrid();
        }
      }}
      onResponderRelease={() => {
        lastIndexRef.current = null;
        if (onDragEnd) {
          onDragEnd();
        }
      }}
      onResponderTerminate={() => {
        lastIndexRef.current = null;
        if (onDragEnd) {
          onDragEnd();
        }
      }}
    >
      {pixels.map((pixel, index) => (
        <View
          key={index}
          style={[
            styles.cell,
            {width: cellSize, height: cellSize, backgroundColor: rgbToCss(pixel)},
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#000',
  },
  cell: {},
});
