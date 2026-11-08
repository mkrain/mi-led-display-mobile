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
import {saveEffectToDevice} from '../ble/device';
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
  speedFactor,
} from '../effects/effects';
import type {RGB} from '../conversion/convert';

/**
 * Light effect subtab of the Mode screen (Nov 8, 2026):
 * the stock app's 7 swipeable effect presets, with a
 * live preview, the hue strip and palette, brightness
 * and speed sliders, a rotate control, a reverse
 * toggle, and a Save that writes the 8 frames to the
 * panel as a cycling slideshow.
 *
 * The preview shows the grid as the stock preview
 * does — unrotated, in preview orientation. Rotation
 * is a send-time transform only, so the preview does
 * not rotate; it does show reverse, since that is the
 * frame order the panel will play. The preview cycles
 * at the panel's rate (1 frame per second at 50%
 * speed), so what you see is what the panel plays.
 *
 * The palette is the effect's colour set. The hue
 * strip sets a working colour only — it never
 * overwrites a palette entry — and the preview and
 * the palette row show the palette with the selected
 * entry replaced by that working colour, so dragging
 * the pad stays live. Tapping a dot selects it, +
 * appends the working colour as a new dot, and the
 * trash removes the selected entry (never the last
 * one). Saving writes the shown palette and commits
 * it. Selection is by index, so duplicate colours in
 * the palette are handled. A new preset brings its
 * own default palette.
 *
 * The preview is a swipe target: swiping it left or
 * right changes the effect, wrapping at the ends
 * (past the last comes the first, before the first
 * comes the last). Only clearly horizontal moves
 * claim the touch, so vertical drags still scroll
 * the page. The dots below do the same by tapping.
 *
 * Save is explicit, not automatic: an effect save is
 * 70 writes at the proven pacing, about a second, and
 * the user will be scrubbing sliders. Nothing saves
 * while disconnected, and the button is disabled
 * while a save runs.
 *
 * Not in this pass: the heart favourites, and
 * auto-save on change.
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
    rotation,
    setRotation,
    reverse,
    setReverse,
  } = useEffectState();
  const {connection} = useConnectionState();
  const [status, setStatus] = useState(
    'Pick an effect. Save writes it to the panel as a looping animation.',
  );
  const [frameIndex, setFrameIndex] = useState(0);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const def = EFFECTS[effectIndex];

  // The palette as shown: the committed palette with
  // the selected entry replaced by the working colour.
  // The preview, the palette row, and the save all use
  // this, so what you see is what the panel gets.
  const displayPalette = effectivePalette(
    palette,
    selectedPaletteIndex,
    color,
  );

  // The preview frames: preview orientation, no
  // rotation, reverse applied so the preview shows
  // the motion the panel will play.
  const previewFrames = useMemo(
    () =>
      effectFrames(
        def,
        {palette: displayPalette, brightness, speed},
        EFFECT_FRAME_COUNT,
        0,
        reverse,
      ),
    [def, displayPalette, brightness, speed, reverse],
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
  }, [speed, effectIndex, displayPalette, brightness, reverse]);

  const preview = previewFrames[frameIndex] ?? previewFrames[0];

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

  async function save() {
    if (savingRef.current) {
      return;
    }
    if (!connection) {
      setStatus('Not connected — connect on the Connect tab first.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setStatus('Saving effect…');
    try {
      const frames = effectFrames(
        def,
        {palette: displayPalette, brightness, speed},
        EFFECT_FRAME_COUNT,
        rotation,
        reverse,
      );
      await saveEffectToDevice(frames);
      // Commit the shown palette: the panel now holds
      // it, so the app's palette matches what was
      // saved instead of the pre-pad version.
      setPalette(displayPalette);
      setStatus('Effect saved — the panel plays it on a loop.');
    } catch (e) {
      setStatus(
        `Save failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
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
      <View style={styles.controlRow}>
        <Text style={styles.controlLabel}>Rotate</Text>
        {[0, 1, 2, 3].map(q => (
          <TouchableOpacity
            key={q}
            accessibilityLabel={`Rotate ${q * 90} degrees`}
            onPress={() => setRotation(q)}
            style={[
              styles.choice,
              rotation === q ? styles.choiceSelected : undefined,
            ]}
          >
            <Text
              style={[
                styles.choiceLabel,
                rotation === q ? styles.choiceLabelSelected : undefined,
              ]}
            >
              {q * 90}°
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.controlRow}>
        <Text style={styles.controlLabel}>Direction</Text>
        <TouchableOpacity
          accessibilityLabel="Reverse direction"
          onPress={() => setReverse(!reverse)}
          disabled={!def.hasDirection}
          style={[
            styles.choice,
            reverse ? styles.choiceSelected : undefined,
            !def.hasDirection ? styles.choiceDisabled : undefined,
          ]}
        >
          <Text
            style={[
              styles.choiceLabel,
              reverse ? styles.choiceLabelSelected : undefined,
            ]}
          >
            {reverse ? 'Reversed' : 'Forward'}
          </Text>
        </TouchableOpacity>
        {!def.hasDirection ? (
          <Text style={styles.controlNote}>
            Random effect — no direction to reverse.
          </Text>
        ) : null}
      </View>
      <TouchableOpacity
        accessibilityLabel="Save effect to panel"
        onPress={save}
        disabled={saving || !connection}
        style={[
          styles.saveButton,
          saving || !connection ? styles.saveButtonDisabled : undefined,
        ]}
      >
        <Text style={styles.saveButtonLabel}>
          {saving ? 'Saving…' : 'Save effect to panel'}
        </Text>
      </TouchableOpacity>
      <Text style={styles.note}>
        Swipe the preview left or right to change effect — it wraps
        around at the ends. Saves 8 frames. The panel cycles them at
        about a second each. Rotation defaults to 90° — the stock app
        sends the grid rotated, so the panel matches what the stock
        app shows.
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
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 6,
    width: '100%',
  },
  controlLabel: {fontSize: 16, width: 90},
  controlNote: {fontSize: 13, color: '#555', marginLeft: 8},
  choice: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#999',
    borderRadius: 8,
    marginHorizontal: 4,
  },
  choiceSelected: {backgroundColor: '#000', borderColor: '#000'},
  choiceDisabled: {opacity: 0.4},
  choiceLabel: {fontSize: 16},
  choiceLabelSelected: {color: '#fff'},
  saveButton: {
    backgroundColor: '#000',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 12,
    width: '100%',
    alignItems: 'center',
  },
  saveButtonDisabled: {opacity: 0.4},
  saveButtonLabel: {fontSize: 16, color: '#fff', fontWeight: 'bold'},
});
