import React, {useEffect, useRef} from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {maxPan} from '../photos/cropBox';

export const CROP_TILE_SIZE = 320;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

type Props = {
  uri: string;
  imageWidth: number;
  imageHeight: number;
  /** Committed crop state from PhotoState (restored on tab switch). */
  zoom: number;
  panX: number;
  panY: number;
  /** Called on gesture release with the committed zoom/pan. */
  onCropCommit: (zoom: number, panX: number, panY: number) => void;
  /**
   * Called when a tile gesture starts (true) and ends (false).
   * PhotoScreen uses it to lock page scrolling only while a gesture
   * is in progress — the native ScrollView can still scroll under a
   * JS PanResponder, so capture handlers alone did not stop the
   * whole screen moving with the photo (Oct 29, 2026).
   */
  onGestureActive?: (active: boolean) => void;
};

/**
 * Pinch-to-zoom + drag-to-pan crop editor, built on core
 * PanResponder + Animated (no new native dependency).
 *
 * The image is shown with cover fit in a square tile, so the tile's
 * visible window is the crop. During a gesture only Animated values
 * move (no React state, no 16x16 recompute per frame); on release
 * the committed zoom/pan go to PhotoState, the preview recomputes
 * once, and PhotoScreen switches the mode to ManualCrop so the
 * custom crop is what sends.
 *
 * This component is only rendered in Edit-crop mode (see
 * PhotoScreen). That is deliberate, Oct 29, 2026: when one tile
 * tried to be both picker button and crop editor, tap, drag, and
 * page-scroll gestures fought each other. In select mode the tile
 * is a plain tappable image with no PanResponder at all, so taps
 * and scrolling work normally; in edit mode this responder owns
 * the tile, and a tap does nothing (it must not open the picker
 * after a small drag).
 */
export function CropEditor({
  uri,
  imageWidth,
  imageHeight,
  zoom,
  panX,
  panY,
  onCropCommit,
  onGestureActive,
}: Props) {
  const pan = useRef(new Animated.ValueXY({x: panX, y: panY})).current;
  const scale = useRef(new Animated.Value(zoom)).current;
  /**
   * Gesture state machine (Oct 29, 2026, focus-steal fix).
   *
   * The old code anchored everything at grant time, when only one
   * finger was down: startDist was 0, so a second finger landing
   * later could never start a pinch, and returning to one finger
   * resumed panning from the original grant anchor, jumping the
   * image. That is what "stealing focus" looked like on device.
   *
   * Now the anchor is set on *entering* each mode, not at grant:
   * - 'pan': one finger. Anchor = that finger's page position and
   *   the current pan. Re-entered (re-anchored) whenever the touch
   *   count drops back to one, so a pinch-then-pan does not jump.
   * - 'pinch': two fingers. Anchor = their distance, centroid, and
   *   the current zoom/pan, set the moment the second finger
   *   appears, not at grant.
   * - 'idle': no active gesture; release commits only if moved.
   *
   * All coordinates are page coordinates (pageX/pageY), not
   * locationX/Y: location coordinates jump when a finger crosses
   * a child boundary (image vs. badge vs. tile), page coordinates
   * do not. Distances and deltas are origin-independent anyway.
   */
  type TouchPoint = {id: number | string; x: number; y: number};
  const gesture = useRef({
    mode: 'idle' as 'idle' | 'pan' | 'pinch',
    startPanX: panX,
    startPanY: panY,
    startZoom: zoom,
    startTouch: null as TouchPoint | null,
    startDist: 0,
    startCentroid: {x: 0, y: 0},
    moved: false,
    pinched: false,
  }).current;

  // Keep Animated values in sync when committed state changes from
  // outside (reset, new photo, tab restore). This must be an effect,
  // not a render-phase setValue: calling setValue during render is
  // a side effect that can trigger re-render loops and LogBox
  // warnings mid-gesture (seen as a debugger banner in the Oct 29
  // video), which themselves shift layout.
  const panValue = pan as unknown as {x: {_value: number}; y: {_value: number}};
  const scaleValue = scale as unknown as {_value: number};
  const currentPanX = panValue.x._value;
  const currentPanY = panValue.y._value;
  const currentZoom = scaleValue._value;
  useEffect(() => {
    if (currentPanX !== panX || currentPanY !== panY) {
      pan.setValue({x: panX, y: panY});
    }
    if (currentZoom !== zoom) {
      scale.setValue(zoom);
    }
  }, [pan, panX, panY, scale, zoom, currentPanX, currentPanY, currentZoom]);

  const clampPan = (x: number, y: number, z: number) => {
    const max = maxPan(imageWidth, imageHeight, CROP_TILE_SIZE, z);
    return {
      x: Math.min(Math.max(-max.x, x), max.x),
      y: Math.min(Math.max(-max.y, y), max.y),
    };
  };

  const responder = useRef(
    PanResponder.create({
      // Capture phase (Oct 29 jitter fix, round 3): capture handlers
      // run before the parent ScrollView's bubble-phase handlers, so
      // a touch starting on the tile belongs to the tile before the
      // ScrollView can claim it for scrolling. That is what lets the
      // page stay scrollable (scrollEnabled is always true now) while
      // tile drags are never stolen — the previous fix disabled page
      // scrolling while editing, which froze the whole form and made
      // toggling the mode snap the content offset.
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onStartShouldSetPanResponder: () => true,
      // Claim the gesture on movement too, and refuse to hand it
      // back: without this, the parent ScrollView can terminate
      // the tile's responder mid-drag and steal the movement.
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: evt => {
        onGestureActive?.(true);
        const touches = (evt.nativeEvent.touches ?? []).map(t => ({
          id: t.identifier,
          x: t.pageX,
          y: t.pageY,
        }));
        gesture.mode = touches.length === 2 ? 'pinch' : 'pan';
        gesture.moved = false;
        gesture.pinched = false;
        // Read the LIVE Animated values, not the zoom/panX/panY
        // props: this PanResponder is created once in a ref, so its
        // handlers close over the first render's props. After the
        // first crop commits, those props are stale — a new gesture
        // would re-anchor to the original zoom/pan, jumping the
        // image back and making drags (especially horizontal ones
        // after a pinch, where panX was non-zero) appear dead, while
        // pinch re-anchoring (which already read live values) kept
        // working. This is the Oct 29 left/right-drag bug.
        if (touches.length === 2) {
          const [a, b] = touches;
          gesture.startDist = Math.hypot(a.x - b.x, a.y - b.y);
          gesture.startCentroid = {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2};
          gesture.startZoom = scaleValue._value;
          gesture.startPanX = panValue.x._value;
          gesture.startPanY = panValue.y._value;
        } else if (touches.length === 1) {
          gesture.startTouch = touches[0];
          gesture.startPanX = panValue.x._value;
          gesture.startPanY = panValue.y._value;
        }
      },
      onPanResponderMove: (evt, gestureState) => {
        const touches = (evt.nativeEvent.touches ?? []).map(t => ({
          id: t.identifier,
          x: t.pageX,
          y: t.pageY,
        }));
        if (Math.abs(gestureState.dx) > 10 || Math.abs(gestureState.dy) > 10) {
          gesture.moved = true;
        }
        if (touches.length === 2) {
          // Enter (or re-enter) pinch mode on the first move that
          // sees two fingers, anchoring at the *current* zoom/pan —
          // not at grant time, when only one finger was down.
          if (gesture.mode !== 'pinch') {
            gesture.mode = 'pinch';
            const [a, b] = touches;
            gesture.startDist = Math.hypot(a.x - b.x, a.y - b.y);
            gesture.startCentroid = {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2};
            gesture.startZoom = scaleValue._value;
            gesture.startPanX = panValue.x._value;
            gesture.startPanY = panValue.y._value;
          }
          if (gesture.startDist <= 0) {
            return;
          }
          gesture.pinched = true;
          const [a, b] = touches;
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          const centroid = {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2};
          const newZoom = Math.min(
            MAX_ZOOM,
            Math.max(MIN_ZOOM, gesture.startZoom * (dist / gesture.startDist)),
          );
          // Zoom about the tile centre, plus the centroid's own
          // movement: pan = startPan * zoom ratio + centroid delta.
          // Zooming about the centroid would need the tile's page
          // position, which this component does not measure; zoom
          // about centre is stable (no origin lookup to jump) and
          // the user re-centres with a drag afterwards, which is
          // the normal crop-editor flow anyway.
          const ratio = newZoom / gesture.startZoom;
          const dx = centroid.x - gesture.startCentroid.x;
          const dy = centroid.y - gesture.startCentroid.y;
          const clamped = clampPan(
            gesture.startPanX * ratio + dx,
            gesture.startPanY * ratio + dy,
            newZoom,
          );
          pan.setValue(clamped);
          scale.setValue(newZoom);
        } else if (touches.length === 1) {
          // Re-anchor pan whenever returning to one finger (e.g.
          // after a pinch), so the image does not jump back to the
          // grant-time anchor.
          if (gesture.mode !== 'pan' || !gesture.startTouch) {
            gesture.mode = 'pan';
            gesture.startTouch = touches[0];
            gesture.startPanX = panValue.x._value;
            gesture.startPanY = panValue.y._value;
          }
          const t = touches[0];
          const start = gesture.startTouch;
          const rawX = gesture.startPanX + (t.x - start.x);
          const rawY = gesture.startPanY + (t.y - start.y);
          pan.setValue(clampPan(rawX, rawY, scaleValue._value));
        }
      },
      onPanResponderRelease: () => {
        onGestureActive?.(false);
        // A tap (no drag, no pinch) in edit mode is a no-op: it
        // must not open the picker. Only a real gesture commits.
        if (!gesture.moved && !gesture.pinched) {
          gesture.mode = 'idle';
          return;
        }
        const finalZoom = scaleValue._value;
        const finalPan = {
          x: panValue.x._value,
          y: panValue.y._value,
        };
        gesture.mode = 'idle';
        onCropCommit(finalZoom, finalPan.x, finalPan.y);
      },
      onPanResponderTerminate: () => {
        // If the system takes the gesture anyway, unlock the page
        // and do not commit a half-finished crop.
        onGestureActive?.(false);
        gesture.mode = 'idle';
      },
    }),
  ).current;

  const baseScale = Math.max(
    CROP_TILE_SIZE / imageWidth,
    CROP_TILE_SIZE / imageHeight,
  );
  const displayedWidth = imageWidth * baseScale;
  const displayedHeight = imageHeight * baseScale;

  return (
    <View style={styles.tile} {...responder.panHandlers}>
      <Animated.Image
        source={{uri}}
        style={[
          styles.image,
          {
            width: displayedWidth,
            height: displayedHeight,
            transform: [{translateX: pan.x}, {translateY: pan.y}, {scale}],
          },
        ]}
        resizeMode="cover"
      />
      <View style={styles.badge} pointerEvents="none">
        <Text style={styles.badgeText}>Pinch to zoom · Drag to move</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: CROP_TILE_SIZE,
    height: CROP_TILE_SIZE,
    // Square, like Draw's grid and the preview tile.
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#e5e5ea',
    overflow: 'hidden',
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {position: 'absolute'},
  badge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  badgeText: {color: '#fff', fontSize: 12, fontWeight: '600'},
});
