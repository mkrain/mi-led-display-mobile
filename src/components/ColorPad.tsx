import React, {memo, useRef, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import type {RGB} from '../conversion/convert';
import {hsvToRgb, rgbToHue, rgbToSaturation} from '../conversion/color';
import {rgbToCss} from './PixelGrid';

/**
 * 2D colour pad (Oct 30, 2026), replacing the 1D hue strip.
 * It mirrors the original app's gradient bar, as shown in the
 * video of the original app: horizontal selects the hue band, and
 * vertical, within that band, locks the dominant channel at
 * 255 and varies the other two. In HSV terms with value fixed
 * at 1: X = hue (0-360 across), Y = saturation (0 at the top,
 * pale colours close to white, to 1 at the bottom, pure hue).
 * The top lightening is saturation, NOT alpha — the panel
 * takes RGB only, with no alpha byte, so there is no
 * transparency to preserve.
 *
 * React Native has no CSS gradient, so the pad is a grid of
 * segments: 36 hues x 12 saturations. The segment grid is a
 * memoised component with no props, so dragging the indicator
 * re-renders only the ring, not 432 segment Views on every
 * move event. The pad is 120px tall (taller than the old
 * 48px strip, like the original bar) so vertical drags have
 * usable resolution. Saturation runs 0 at the top row (white,
 * all hues converge) to 1 at the bottom row (pure hue).
 *
 * Coordinates use the same page-coordinate + measure-on-
 * gesture-start method as PixelGrid: locationX/Y are relative
 * to the segment actually touched, so they would bias picks.
 * Scrolling is locked during a pad gesture via onDragStart /
 * onDragEnd, so a vertical drag on the pad paints a colour
 * instead of scrolling the screen.
 */
const HUE_STEPS = 36;
const SAT_STEPS = 12;
const PAD_HEIGHT = 120;

const PadSegments = memo(function PadSegments() {
  return (
    <View style={styles.segments}>
      {Array.from({length: SAT_STEPS}, (_row, satIndex) => (
        <View key={satIndex} style={styles.segmentRow}>
          {Array.from({length: HUE_STEPS}, (_cell, hueIndex) => (
            <View
              key={hueIndex}
              style={[
                styles.segment,
                {
                  backgroundColor: rgbToCss(
                    hsvToRgb(
                      (hueIndex * 360) / HUE_STEPS,
                      satIndex / (SAT_STEPS - 1),
                      1,
                    ),
                  ),
                },
              ]}
            />
          ))}
        </View>
      ))}
    </View>
  );
});

interface ColorPadProps {
  color: RGB;
  onColorChange: (color: RGB) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export function ColorPad({
  color,
  onColorChange,
  onDragStart,
  onDragEnd,
}: ColorPadProps) {
  const [width, setWidth] = useState(0);
  const padRef = useRef<View | null>(null);
  const padPageRef = useRef<{x: number; y: number} | null>(null);

  function measurePad(callback?: () => void) {
    if (!padRef.current) {
      if (callback) {
        callback();
      }
      return;
    }
    padRef.current.measureInWindow((x, y) => {
      padPageRef.current = {x, y};
      if (callback) {
        callback();
      }
    });
  }

  function pickAtPage(pageX: number, pageY: number) {
    if (width <= 0) {
      return;
    }
    const origin = padPageRef.current;
    if (!origin) {
      return;
    }
    const hueFraction = Math.min(1, Math.max(0, (pageX - origin.x) / width));
    const satFraction = Math.min(
      1,
      Math.max(0, (pageY - origin.y) / PAD_HEIGHT),
    );
    onColorChange(hsvToRgb(hueFraction * 360, satFraction, 1));
  }

  function pickAtLocation(locationX: number, locationY: number) {
    if (width <= 0) {
      return;
    }
    const hueFraction = Math.min(1, Math.max(0, locationX / width));
    const satFraction = Math.min(1, Math.max(0, locationY / PAD_HEIGHT));
    onColorChange(hsvToRgb(hueFraction * 360, satFraction, 1));
  }

  const hue = rgbToHue(color);
  const sat = rgbToSaturation(color);
  const indicator =
    hue === null || width <= 0
      ? null
      : {
          left: Math.min(width - 28, Math.max(0, (hue / 360) * width - 14)),
          top: Math.min(PAD_HEIGHT - 28, Math.max(0, sat * PAD_HEIGHT - 14)),
        };

  return (
    <View
      ref={padRef}
      style={styles.pad}
      onLayout={event => {
        setWidth(event.nativeEvent.layout.width);
        measurePad();
      }}
      onStartShouldSetResponder={() => true}
      onResponderGrant={event => {
        if (onDragStart) {
          onDragStart();
        }
        const {pageX, pageY, locationX, locationY} = event.nativeEvent;
        measurePad(() => {
          if (padPageRef.current) {
            pickAtPage(pageX, pageY);
          } else {
            pickAtLocation(locationX, locationY);
          }
        });
      }}
      onResponderMove={event => {
        if (padPageRef.current) {
          pickAtPage(event.nativeEvent.pageX, event.nativeEvent.pageY);
        } else {
          pickAtLocation(
            event.nativeEvent.locationX,
            event.nativeEvent.locationY,
          );
          measurePad();
        }
      }}
      onResponderRelease={() => {
        if (onDragEnd) {
          onDragEnd();
        }
      }}
      onResponderTerminate={() => {
        if (onDragEnd) {
          onDragEnd();
        }
      }}
    >
      <PadSegments />
      {indicator ? (
        <View
          style={[styles.indicator, {left: indicator.left, top: indicator.top}]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    height: PAD_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    width: '100%',
    marginVertical: 8,
  },
  segments: {flex: 1},
  segmentRow: {flex: 1, flexDirection: 'row'},
  segment: {flex: 1},
  indicator: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'transparent',
  },
});
