import React, {useEffect, useRef, useState} from 'react';
import {ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Slider from '@react-native-community/slider';
import {PixelGrid, rgbToCss} from './PixelGrid';
import {ColorPad} from './ColorPad';
import {sendLampColour} from '../ble/device';
import {useConnectionState} from '../state/ConnectionState';
import {useLampState} from '../state/LampState';
import {LAMP_PRESETS, LAMP_PRESET_NAMES, lampGrid} from '../lamp/lamp';

/**
 * Lamplight subtab of the Mode screen (Nov 8, 2026): one
 * solid colour across the whole panel.
 *
 * Stock behaviour, from the PacketLogger traces: the
 * stock app sends lamp mode (00 0B), one 7-byte solid
 * colour write (0B), and a brightness write (00 10).
 * No slideshow, no frames, no 70-write save. The
 * colour is sent UNSCALED — brightness is a separate
 * panel parameter, not RGB scaling — so the preview
 * shows the scaled colour (what the panel looks
 * like) while the panel gets the raw colour plus the
 * brightness value. The stock lamp colour persists
 * 8+ minutes with the stock app closed, so it is a
 * stored write, not a live send.
 *
 * Auto-save is debounced, not per move event: dragging
 * the colour pad fires dozens of changes. The save runs
 * 1s after the last change. A change made while a save
 * is running waits and re-saves with the latest values
 * when the running save finishes. Nothing saves on
 * mount, and nothing saves while disconnected.
 *
 * Not in this pass: the stock tab's sun/moon row (it
 * sends no distinct BLE command, so its function is
 * still not known) and the heart favourites (app
 * storage, a second axis).
 */
export function LamplightTab() {
  const {color, setColor, brightness, setBrightness} = useLampState();
  const {connection} = useConnectionState();
  const [status, setStatus] = useState(
    'Pick a colour and a brightness. It saves to the panel on its own.',
  );
  const [scrollEnabled, setScrollEnabled] = useState(true);

  // Latest values for the debounced save, which runs
  // after the render that scheduled it.
  const colorRef = useRef(color);
  const brightnessRef = useRef(brightness);
  const connectionRef = useRef(connection);
  colorRef.current = color;
  brightnessRef.current = brightness;
  connectionRef.current = connection;
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);

  async function attemptSave() {
    if (savingRef.current) {
      pendingRef.current = true;
      return;
    }
    if (!connectionRef.current) {
      setStatus('Not connected — connect on the Connect tab first.');
      return;
    }
    savingRef.current = true;
    setStatus('Saving lamp colour…');
    try {
      // Raw colour, not the scaled grid: brightness is
      // a separate panel parameter (00 10), not RGB
      // scaling. The preview below shows the scaled
      // colour; the panel gets the raw colour plus the
      // brightness value.
      await sendLampColour(colorRef.current, brightnessRef.current);
      setStatus('Lamp saved — the panel shows this colour.');
    } catch (e) {
      setStatus(
        `Save failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      savingRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        attemptSave().catch(() => undefined);
      }
    }
  }

  useEffect(() => {
    // Nothing saves on mount: the panel keeps its own
    // last lamp colour, and there is no change to save.
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      attemptSave().catch(() => undefined);
    }, 1000);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, brightness]);

  const preview = lampGrid(color, brightness);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      scrollEnabled={scrollEnabled}
    >
      <Text style={styles.status}>{status}</Text>
      <PixelGrid pixels={preview} cellSize={20} />
      <Text style={styles.note}>
        Sends one colour write — no slideshow, no frames.
      </Text>
      <ColorPad
        color={color}
        onColorChange={setColor}
        onDragStart={() => setScrollEnabled(false)}
        onDragEnd={() => setScrollEnabled(true)}
      />
      <Text style={styles.padHint}>
        Horizontal: hue band · Vertical: saturation (top = pale, bottom =
        pure)
      </Text>
      <View style={styles.paletteStrip}>
        {LAMP_PRESETS.map((c, i) => (
          <TouchableOpacity
            key={i}
            accessibilityLabel={LAMP_PRESET_NAMES[i]}
            onPress={() => setColor(c)}
            style={[
              styles.stripSegment,
              {backgroundColor: rgbToCss(c)},
              c === color ? styles.stripSelected : undefined,
            ]}
          />
        ))}
      </View>
      <Text style={styles.rgbText}>
        R:{color[0]} G:{color[1]} B:{color[2]}
      </Text>
      <View style={styles.sliderRow}>
        <Text style={styles.sliderLabel}>Brightness</Text>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {padding: 16, alignItems: 'center'},
  status: {fontSize: 16, marginBottom: 12, textAlign: 'center'},
  note: {fontSize: 13, color: '#555', textAlign: 'center', marginVertical: 8},
  padHint: {fontSize: 13, color: '#555', textAlign: 'center', marginBottom: 4},
  paletteStrip: {flexDirection: 'row', width: '100%', height: 36, marginVertical: 4},
  stripSegment: {flex: 1, borderWidth: 1, borderColor: '#999', marginHorizontal: 1},
  stripSelected: {borderWidth: 3, borderColor: '#000'},
  rgbText: {fontSize: 16, marginTop: 12},
  sliderRow: {flexDirection: 'row', alignItems: 'center', marginVertical: 4, width: '100%'},
  sliderLabel: {fontSize: 16, width: 90},
  slider: {flex: 1},
  sliderValue: {fontSize: 16, width: 48, textAlign: 'right'},
});
