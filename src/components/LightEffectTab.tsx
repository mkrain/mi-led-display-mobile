import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
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
  effectFrames,
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
 * The palette is the effect's colour set: tapping a
 * dot selects it, dragging the hue strip edits the
 * selected entry live, + adds the current colour, and
 * the trash removes the selected entry (never the
 * last one). A new preset brings its own default
 * palette.
 *
 * Save is explicit, not automatic: an effect save is
 * 70 writes at the proven pacing, about a second, and
 * the user will be scrubbing sliders. Nothing saves
 * while disconnected, and the button is disabled
 * while a save runs.
 *
 * Not in this pass: swiping the preview to change
 * presets (the dots do that), the heart favourites,
 * and auto-save on change.
 */
export function LightEffectTab() {
  const {
    effectIndex,
    setEffectIndex,
    palette,
    setPalette,
    color,
    setColor,
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

  // The preview frames: preview orientation, no
  // rotation, reverse applied so the preview shows
  // the motion the panel will play.
  const previewFrames = useMemo(
    () =>
      effectFrames(
        def,
        {palette, brightness, speed},
        EFFECT_FRAME_COUNT,
        0,
        reverse,
      ),
    [def, palette, brightness, speed, reverse],
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
  }, [speed, effectIndex, palette, brightness, reverse]);

  const preview = previewFrames[frameIndex] ?? previewFrames[0];

  function onHueChange(next: RGB) {
    // Editing the selected palette entry live: if the
    // current colour is a palette entry, that entry
    // becomes the new colour. Otherwise just select
    // the new colour — + adds it to the palette.
    const idx = palette.findIndex(
      c => c[0] === color[0] && c[1] === color[1] && c[2] === color[2],
    );
    setColor(next);
    if (idx >= 0) {
      const nextPalette = [...palette];
      nextPalette[idx] = next;
      setPalette(nextPalette);
    }
  }

  function addColour() {
    if (palette.length >= def.maxPaletteColors) {
      return;
    }
    if (
      palette.some(
        c => c[0] === color[0] && c[1] === color[1] && c[2] === color[2],
      )
    ) {
      return;
    }
    setPalette([...palette, color]);
  }

  function removeColour() {
    if (palette.length <= 1) {
      return;
    }
    const idx = palette.findIndex(
      c => c[0] === color[0] && c[1] === color[1] && c[2] === color[2],
    );
    if (idx < 0) {
      return;
    }
    const nextPalette = palette.filter((_, i) => i !== idx);
    setPalette(nextPalette);
    setColor(nextPalette[0]);
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
        {palette, brightness, speed},
        EFFECT_FRAME_COUNT,
        rotation,
        reverse,
      );
      await saveEffectToDevice(frames);
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

  const selectedPaletteIndex = palette.findIndex(
    c => c[0] === color[0] && c[1] === color[1] && c[2] === color[2],
  );

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      scrollEnabled={scrollEnabled}
    >
      <Text style={styles.status}>{status}</Text>
      <PixelGrid pixels={preview} cellSize={20} />
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
        {palette.map((c, i) => (
          <TouchableOpacity
            key={i}
            accessibilityLabel={`Palette colour ${i + 1}`}
            onPress={() => setColor(c)}
            style={[
              styles.paletteDot,
              {backgroundColor: rgbToCss(c)},
              i === selectedPaletteIndex
                ? styles.paletteDotSelected
                : undefined,
            ]}
          />
        ))}
        {palette.length < def.maxPaletteColors ? (
          <TouchableOpacity
            accessibilityLabel="Add colour"
            onPress={addColour}
            style={styles.paletteButton}
          >
            <Text style={styles.paletteButtonLabel}>+</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          accessibilityLabel="Remove colour"
          onPress={removeColour}
          style={styles.paletteButton}
        >
          <Text style={styles.paletteButtonLabel}>×</Text>
        </TouchableOpacity>
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
        Saves 8 frames. The panel cycles them at about a second each.
        Rotation defaults to 90° — the stock app sends the grid
        rotated, so the panel matches what the stock app shows.
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
