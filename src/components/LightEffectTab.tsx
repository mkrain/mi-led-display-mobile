import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Slider from '@react-native-community/slider';
import {PixelGrid, rgbToCss} from '../components/PixelGrid';
import {ColorPad} from '../components/ColorPad';
import {
  selectEffect,
  sendEffectBrightness,
  sendEffectPalette,
  sendEffectSpeed,
} from '../ble/device';
import {useConnectionState} from '../state/ConnectionState';
import {useEffectState} from '../state/EffectState';
import {
  EFFECTS,
  EFFECT_FRAME_COUNT,
  MAX_PALETTE_COLORS,
  effectFrames,
  effectivePalette,
  nextEffectIndex,
  prevEffectIndex,
  sendPalette,
  speedFactor,
} from '../effects/effects';
import type {RGB} from '../conversion/convert';

/**
 * Light effect subtab of the Mode screen (Nov 8, 2026):
 * the stock app's 7 swipeable effect presets, with a
 * live preview, the hue strip and palette, and
 * brightness and speed sliders.
 *
 * The stock app sends no frames (PacketLogger, Nov 8-9,
 * 2026): it sends effect mode (00 0A), an effect select
 * (0A 01, 1-7), a palette (0A 02), a speed (0A 07), and
 * a brightness (00 10), and the panel generates the
 * animation itself. This tab does the same. Picking an
 * effect sends the full sequence; a palette, speed, or
 * brightness change afterwards sends only that
 * parameter. Sends are debounced 300 ms, so dragging
 * a slider or the hue strip does not flood the panel —
 * the stock app sends a fresh palette on every drag
 * movement, but a short debounce is the same result
 * with fewer writes. Nothing sends on mount, and
 * nothing sends while disconnected.
 *
 * The preview is a presentation aid, not the panel's
 * pixels: it shows the effect's look (the same
 * generators the pre-trace build used for frames),
 * cycling at the panel's rate. For the random effects
 * (confetti, speckles) the preview re-randomizes
 * locally — the panel re-randomizes on its own, so
 * the preview and the panel never match cell for
 * cell. The preview shows the pattern and the
 * colours, not the exact arrangement.
 *
 * There is no rotate or reverse control: those were
 * for the frame-based save, and the panel generates
 * its own animation — there is no rotate or reverse
 * command in the traces. The preview shows the
 * effect in the stock app's preview orientation.
 *
 * The palette is the effect's colour set. The hue
 * strip sets a working colour only — it never
 * overwrites a palette entry — and the preview and
 * the palette row show the palette with the selected
 * entry replaced by that working colour, so dragging
 * the pad stays live. Tapping a dot selects it, +
 * appends the working colour as a new dot, and the
 * trash removes the selected entry (never the last
 * one). The send uses the shown palette, so what
 * you see is what the panel gets. A new preset
 * brings its own default palette.
 *
 * The preview is a swipe target: swiping it left or
 * right changes the effect, wrapping at the ends
 * (past the last comes the first, before the first
 * comes the last). Only clearly horizontal moves
 * claim the touch, so vertical drags still scroll
 * the page. The dots below do the same by tapping.
 *
 * Not in this pass: the heart favourites.
 */
export function LightEffectTab() {
  const {
    effectIndex,
    setEffectIndex,
    palette,
    setPalette,
    color,
    setColor,
    selectedPaletteIndex,
    setSelectedPaletteIndex,
    brightness,
    setBrightness,
    speed,
    setSpeed,
  } = useEffectState();
  const {connection} = useConnectionState();
  const [status, setStatus] = useState(
    'Pick an effect. It sends to the panel on its own.',
  );
  const [frameIndex, setFrameIndex] = useState(0);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const def = EFFECTS[effectIndex];

  // The palette as shown: the committed palette with
  // the selected entry replaced by the working colour.
  // The preview, the palette row, and the send all use
  // this, so what you see is what the panel gets.
  const displayPalette = effectivePalette(
    palette,
    selectedPaletteIndex,
    color,
  );
  // The palette as sent (rainbow appends its fixed
  // white step). Keyed as a string so the send effect
  // below only fires when the sent values change, not
  // on every render.
  const sendKey = JSON.stringify(sendPalette(def, displayPalette));

  // The preview frames: preview orientation, no
  // rotation, no reverse — the panel generates its
  // own animation, so the preview only shows the look.
  const previewFrames = useMemo(
    () =>
      effectFrames(
        def,
        {palette: displayPalette, brightness, speed},
        EFFECT_FRAME_COUNT,
        0,
        false,
      ),
    [def, displayPalette, brightness, speed],
  );

  // Advance the preview at the panel's rate: one
  // frame per second at 50% speed, faster or slower
  // with the speed slider. Paused at speed 0.
  useEffect(() => {
    setFrameIndex(0);
    if (speed <= 0) {
      return;
    }
    const interval = setInterval(
      () => {
        setFrameIndex(i => (i + 1) % EFFECT_FRAME_COUNT);
      },
      1000 / speedFactor(speed),
    );
    return () => clearInterval(interval);
  }, [speed, effectIndex, displayPalette, brightness]);

  const preview = previewFrames[frameIndex] ?? previewFrames[0];

  // Latest values for the debounced send, which runs
  // after the render that scheduled it.
  const effectIndexRef = useRef(effectIndex);
  const displayPaletteRef = useRef(displayPalette);
  const speedRef = useRef(speed);
  const brightnessRef = useRef(brightness);
  const defRef = useRef(def);
  const connectionRef = useRef(connection);
  effectIndexRef.current = effectIndex;
  displayPaletteRef.current = displayPalette;
  speedRef.current = speed;
  brightnessRef.current = brightness;
  defRef.current = def;
  connectionRef.current = connection;
  // What the panel last received, so a send only
  // writes what changed. Null until the first send.
  const lastSentRef = useRef<{
    effectIndex: number;
    paletteKey: string;
    speed: number;
    brightness: number;
  } | null>(null);
  const sendingRef = useRef(false);
  const pendingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);

  async function attemptSend() {
    if (sendingRef.current) {
      pendingRef.current = true;
      return;
    }
    if (!connectionRef.current) {
      setStatus('Not connected — connect on the Connect tab first.');
      return;
    }
    const last = lastSentRef.current;
    const paletteKey = JSON.stringify(
      sendPalette(defRef.current, displayPaletteRef.current),
    );
    const effectChanged =
      last === null || last.effectIndex !== effectIndexRef.current;
    const paletteChanged = last === null || last.paletteKey !== paletteKey;
    const speedChanged = last === null || last.speed !== speedRef.current;
    const brightnessChanged =
      last === null || last.brightness !== brightnessRef.current;
    if (
      !effectChanged &&
      !paletteChanged &&
      !speedChanged &&
      !brightnessChanged
    ) {
      return;
    }
    sendingRef.current = true;
    setStatus('Sending to panel…');
    try {
      if (effectChanged) {
        // A new effect gets the full sequence: mode,
        // select, palette, speed, brightness.
        await selectEffect(
          effectIndexRef.current + 1,
          sendPalette(defRef.current, displayPaletteRef.current),
          speedRef.current,
          brightnessRef.current,
        );
      } else {
        // Otherwise only the changed parameters, so a
        // palette drag does not re-select the effect
        // (and restart its animation).
        if (paletteChanged) {
          await sendEffectPalette(
            sendPalette(defRef.current, displayPaletteRef.current),
          );
        }
        if (speedChanged) {
          await sendEffectSpeed(speedRef.current);
        }
        if (brightnessChanged) {
          await sendEffectBrightness(brightnessRef.current);
        }
      }
      lastSentRef.current = {
        effectIndex: effectIndexRef.current,
        paletteKey,
        speed: speedRef.current,
        brightness: brightnessRef.current,
      };
      setStatus('Effect sent — the panel plays it.');
    } catch (e) {
      setStatus(
        `Send failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      sendingRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        attemptSend().catch(() => undefined);
      }
    }
  }

  useEffect(() => {
    // Nothing sends on mount: the panel keeps its own
    // last effect, and there is no change to send.
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      attemptSend().catch(() => undefined);
    }, 300);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectIndex, sendKey, speed, brightness]);

  // Swipe the preview to change effect, wrapping at the
  // ends. Created fresh each render so the release handler
  // sees the current effect index. Only clearly horizontal
  // moves claim the touch, so vertical drags still scroll
  // the page.
  const swipeResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_evt, gs) =>
      Math.abs(gs.dx) > Math.abs(gs.dy) && Math.abs(gs.dx) > 20,
    onPanResponderRelease: (_evt, gs) => {
      if (gs.dx < -50) {
        setEffectIndex(nextEffectIndex(effectIndex));
      } else if (gs.dx > 50) {
        setEffectIndex(prevEffectIndex(effectIndex));
      }
    },
  });

  function onHueChange(next: RGB) {
    // The hue strip sets the working colour only. It
    // never overwrites a palette entry — that is what
    // made + a no-op (the colour was already in the
    // palette, so the duplicate guard refused it) and
    // cost the selected dot its old colour. The
    // preview and the palette row show the working
    // colour in the selected slot, so dragging the pad
    // still updates live.
    setColor(next);
  }

  function addColour() {
    if (palette.length >= MAX_PALETTE_COLORS) {
      return;
    }
    // Append the working colour as a new dot and
    // select it. No duplicate guard: the working
    // colour is only in the palette once + is pressed,
    // and selection is by index, so a duplicate dot
    // is a copy, not an ambiguity.
    const nextPalette = [...palette, color];
    setPalette(nextPalette);
    setSelectedPaletteIndex(nextPalette.length - 1);
  }

  function removeColour() {
    if (palette.length <= 1) {
      return;
    }
    const nextPalette = palette.filter(
      (_, i) => i !== selectedPaletteIndex,
    );
    const nextIndex = Math.min(
      selectedPaletteIndex,
      nextPalette.length - 1,
    );
    setPalette(nextPalette);
    setSelectedPaletteIndex(nextIndex);
    setColor(nextPalette[nextIndex]);
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      scrollEnabled={scrollEnabled}
    >
      <Text style={styles.status}>{status}</Text>
      <View {...swipeResponder.panHandlers}>
        <PixelGrid pixels={preview} cellSize={20} />
      </View>
      <View style={styles.dotsRow}>
        {EFFECTS.map((e, i) => (
          <TouchableOpacity
            key={e.id}
            accessibilityLabel={e.name}
            onPress={() => setEffectIndex(i)}
            style={[
              styles.dot,
              i === effectIndex ? styles.dotSelected : undefined,
            ]}
          />
        ))}
      </View>
      <Text style={styles.effectName}>{def.name}</Text>
      <ColorPad
        color={color}
        onColorChange={onHueChange}
        onDragStart={() => setScrollEnabled(false)}
        onDragEnd={() => setScrollEnabled(true)}
      />
      <Text style={styles.padHint}>
        Horizontal: hue band · Vertical: saturation (top = pale, bottom =
        pure)
      </Text>
      <View style={styles.paletteRow}>
        <View style={styles.paletteDots}>
          {displayPalette.map((c, i) => (
            <TouchableOpacity
              key={i}
              accessibilityLabel={`Palette colour ${i + 1}`}
              onPress={() => {
                setSelectedPaletteIndex(i);
                setColor(displayPalette[i]);
              }}
              style={[
                styles.paletteDot,
                {backgroundColor: rgbToCss(c)},
                i === selectedPaletteIndex
                  ? styles.paletteDotSelected
                  : undefined,
              ]}
            />
          ))}
        </View>
        <View style={styles.paletteButtons}>
          <TouchableOpacity
            accessibilityLabel="Add colour"
            onPress={addColour}
            disabled={palette.length >= MAX_PALETTE_COLORS}
            style={[
              styles.paletteButton,
              palette.length >= MAX_PALETTE_COLORS
                ? styles.paletteButtonDisabled
                : undefined,
            ]}
          >
            <Text style={styles.paletteButtonLabel}>+</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityLabel="Remove colour"
            onPress={removeColour}
            style={styles.paletteButton}
          >
            <Text style={styles.paletteButtonLabel}>🗑️</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.rgbText}>
        R:{color[0]} G:{color[1]} B:{color[2]}
      </Text>
      <View style={styles.sliderRow}>
        <Text style={styles.sliderLabel}>☀ Brightness</Text>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={100}
          step={1}
          value={brightness}
          onValueChange={value => setBrightness(Math.round(value))}
          accessibilityLabel="Brightness"
        />
        <Text style={styles.sliderValue}>{brightness}%</Text>
      </View>
      <View style={styles.sliderRow}>
        <Text style={styles.sliderLabel}>⚡ Speed</Text>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={100}
          step={1}
          value={speed}
          onValueChange={value => setSpeed(Math.round(value))}
          accessibilityLabel="Speed"
        />
        <Text style={styles.sliderValue}>{speed}%</Text>
      </View>
      <Text style={styles.note}>
        Swipe the preview left or right to change effect — it wraps
        around at the ends. The panel generates the animation from
        the palette, so the preview shows the look, not the exact
        pixels — the random effects re-randomize on the panel.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {padding: 16, alignItems: 'center'},
  status: {fontSize: 16, marginBottom: 12, textAlign: 'center'},
  note: {fontSize: 13, color: '#555', textAlign: 'center', marginVertical: 8},
  padHint: {fontSize: 13, color: '#555', textAlign: 'center', marginBottom: 4},
  dotsRow: {flexDirection: 'row', marginTop: 12, marginBottom: 4},
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ccc',
    marginHorizontal: 4,
  },
  dotSelected: {backgroundColor: '#000'},
  effectName: {fontSize: 16, fontWeight: 'bold', marginBottom: 8},
  paletteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
    width: '100%',
  },
  // The dots take the left side and wrap if the
  // palette is full; the + and × sit in their own
  // container pinned to the right, so they never move
  // when a dot is added or removed.
  paletteDots: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    flexWrap: 'wrap',
  },
  paletteButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  paletteDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#999',
  },
  paletteDotSelected: {borderWidth: 3, borderColor: '#000'},
  paletteButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#888',
    marginHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // At the cap the + stays put but greys out, so the
  // trash never shifts when the last colour is added.
  paletteButtonDisabled: {opacity: 0.4},
  paletteButtonLabel: {fontSize: 20, color: '#fff'},
  rgbText: {fontSize: 16, marginTop: 12},
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
    width: '100%',
  },
  sliderLabel: {fontSize: 16, width: 110},
  slider: {flex: 1},
  sliderValue: {fontSize: 16, width: 48, textAlign: 'right'},
});
