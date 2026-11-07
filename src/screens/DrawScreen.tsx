import React, {useState} from 'react';
import {Button, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Slider from '@react-native-community/slider';
import {PixelGrid, rgbToCss} from '../components/PixelGrid';
import {ColorPad} from '../components/ColorPad';
import {BottomMenu} from '../components/BottomMenu';
import {AddToSlideshowButton} from '../components/AddToSlideshowButton';
import {ShareImageButton} from '../components/ShareImageButton';
import {ActionToolbar, ToolButton} from '../components/ActionToolbar';
import type {RGB} from '../conversion/convert';
import {sendFullPicture} from '../ble/device';
import {blankGrid, useDrawState} from '../state/DrawState';
import {useSlideshowState} from '../state/SlideshowState';
import {StackActions, useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../App';

const PALETTE: RGB[] = [
  [0, 0, 0],
  [255, 255, 255],
  [255, 0, 0],
  [255, 152, 0],
  [255, 255, 0],
  [0, 255, 0],
  [0, 0, 255],
  [255, 0, 255],
];
const PALETTE_NAMES = [
  'Black',
  'White',
  'Red',
  'Orange',
  'Yellow',
  'Green',
  'Blue',
  'Magenta',
];

export function DrawScreen() {
  // Grid + colour live in DrawState above the navigator, not
  // here: tab switches that pop Draw off the stack used to
  // destroy this screen and reset it to a blank grid.
  const {pixels, setPixels, color, setColor, tool, setTool, editingItem, setEditingItem} =
    useDrawState();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const {updateItemPixels} = useSlideshowState();
  const [status, setStatus] = useState('Tap a pixel to paint it, then Send.');
  const [busy, setBusy] = useState(false);
  const [rgbModalVisible, setRgbModalVisible] = useState(false);
  // Scroll lock during a paint drag (Oct 30, 2026): the grid
  // sits inside a ScrollView, and without this a vertical drag
  // across the grid would scroll the screen instead of painting.
  // The grid calls these via PixelGrid's onDragStart/onDragEnd.
  const [scrollEnabled, setScrollEnabled] = useState(true);

  function paint(index: number) {
    // Eraser is a tool, not a colour: it paints black (the
    // panel's off state), resetting that pixel, whatever the
    // selected colour is.
    const paintColor: RGB = tool === 'erase' ? [0, 0, 0] : color;
    setPixels(prev => {
      const next = [...prev];
      next[index] = paintColor;
      return next;
    });
  }

  // Picking a colour always returns to the paint tool, so a
  // colour pick is never silently swallowed by a forgotten
  // eraser. All colour pickers (swatch, hue strip, RGB sliders)
  // go through this helper.
  function selectColor(nextColor: RGB) {
    setColor(nextColor);
    if (tool !== 'paint') {
      setTool('paint');
    }
  }

  async function send() {
    setBusy(true);
    setStatus('Sending…');
    try {
      await sendFullPicture(pixels);
      setStatus('Sent full picture.');
    } catch (e) {
      setStatus(`Send failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
    <ScrollView contentContainerStyle={styles.container} scrollEnabled={scrollEnabled}>
      <Text style={styles.status}>{status}</Text>
      {editingItem ? (
        <View style={styles.editBanner}>
          <Text style={styles.editBannerText}>
            Editing {editingItem.label} from {editingItem.slideshowName}.
            Save changes updates that item in place. Cancel
            leaves it unchanged.
          </Text>
          <View style={styles.button}>
            <Button
              title="Save changes to slideshow"
              onPress={() => {
                updateItemPixels(
                  editingItem.slideshowId,
                  editingItem.itemId,
                  pixels,
                );
                setEditingItem(null);
                navigation.dispatch(StackActions.popTo('Slideshow'));
              }}
            />
          </View>
          <View style={styles.button}>
            <Button
              title="Cancel edit"
              onPress={() => {
                setEditingItem(null);
                navigation.dispatch(StackActions.popTo('Slideshow'));
              }}
            />
          </View>
        </View>
      ) : null}
      <PixelGrid
        pixels={pixels}
        cellSize={20}
        onPixelPress={paint}
        onDragStart={() => setScrollEnabled(false)}
        onDragEnd={() => setScrollEnabled(true)}
      />
      {/* Tool row (Nov 7, 2026, toolbar): Draw / Erase /
          Clear / Share as four equal tool buttons in the
          shared ActionToolbar, same row Photo uses. Draw
          and Erase are a toggle (active = current tool);
          Clear blanks the grid immediately, no confirmation;
          Share opens the share sheet for the current grid.
          Share feedback goes to the status line at the top
          (via onResult), since a toolbar row has no room
          for a note under the button. */}
      <ActionToolbar>
        <ToolButton
          label="Draw"
          icon="✏️"
          onPress={() => setTool('paint')}
          active={tool === 'paint'}
          accessibilityLabel="Draw"
        />
        <ToolButton
          label="Erase"
          icon="🧽"
          onPress={() => setTool('erase')}
          active={tool === 'erase'}
          accessibilityLabel="Erase"
        />
        <ToolButton
          label="Clear"
          icon="🗑️"
          onPress={() => setPixels(blankGrid())}
          disabled={busy}
          accessibilityLabel="Clear grid"
        />
        <ShareImageButton
          label={editingItem ? editingItem.label : 'Graffiti'}
          pixels={pixels}
          disabled={busy}
          variant="tool"
          onResult={setStatus}
        />
      </ActionToolbar>
      <Text style={styles.label}>Color</Text>
      <ColorPad
        color={color}
        onColorChange={selectColor}
        onDragStart={() => setScrollEnabled(false)}
        onDragEnd={() => setScrollEnabled(true)}
      />
      <Text style={styles.padHint}>
        Horizontal: hue band · Vertical: saturation (top = pale,
        bottom = pure)
      </Text>
      {/* Quick colours as a single horizontal strip (Oct 30,
          2026 cleanup): the same 8 colours as the old
          2-row 48px circles, in the same order, but one
          36px-tall row instead of two wrapped rows — about
          68px less screen space. A custom colour (from the
          pad or the RGB sliders) highlights no segment, as
          before. */}
      <View style={styles.paletteStrip}>
        {PALETTE.map((c, i) => (
          <TouchableOpacity
            key={i}
            accessibilityLabel={PALETTE_NAMES[i]}
            onPress={() => selectColor(c)}
            style={[
              styles.stripSegment,
              {backgroundColor: rgbToCss(c)},
              c === color ? styles.stripSelected : undefined,
            ]}
          />
        ))}
      </View>
      {/* RGB values + current-colour swatch, both tappable:
          tapping either opens the RGB slider selector (below),
          like the stock app. The values always show the current
          colour, whether it came from a swatch, the hue strip,
          or the sliders themselves. Format is R:0 G:255 B:111. */}
      <TouchableOpacity
        style={styles.rgbRow}
        onPress={() => setRgbModalVisible(true)}
      >
        <Text style={styles.rgbText}>
          R:{color[0]} G:{color[1]} B:{color[2]}
        </Text>
        <View
          style={[styles.currentSwatch, {backgroundColor: rgbToCss(color)}]}
        />
      </TouchableOpacity>
      <Modal
        visible={rgbModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRgbModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View
              style={[styles.modalPreview, {backgroundColor: rgbToCss(color)}]}
            />
            {(['R', 'G', 'B'] as const).map((channel, channelIndex) => (
              <View key={channel} style={styles.sliderRow}>
                <Text style={styles.sliderLabel}>{channel}</Text>
                <Slider
                  style={styles.slider}
                  minimumValue={0}
                  maximumValue={255}
                  step={1}
                  value={color[channelIndex]}
                  onValueChange={value => {
                    const next: RGB = [
                      channelIndex === 0 ? Math.round(value) : color[0],
                      channelIndex === 1 ? Math.round(value) : color[1],
                      channelIndex === 2 ? Math.round(value) : color[2],
                    ];
                    selectColor(next);
                  }}
                />
                <Text style={styles.sliderValue}>{color[channelIndex]}</Text>
              </View>
            ))}
            <View style={styles.button}>
              <Button title="Done" onPress={() => setRgbModalVisible(false)} />
            </View>
          </View>
        </View>
      </Modal>
      <View style={styles.button}>
        <Button title={busy ? 'Sending…' : 'Send full picture'} onPress={send} disabled={busy} />
      </View>
      <AddToSlideshowButton
        label="Graffiti"
        detail="Draw · 16×16 grid"
        pixels={pixels}
        onResult={setStatus}
      />
    </ScrollView>
    <BottomMenu />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1},
  container: {padding: 16, alignItems: 'center'},
  status: {fontSize: 16, marginBottom: 12, textAlign: 'center'},
  editBanner: {
    width: '100%',
    backgroundColor: '#eaf3ff',
    borderWidth: 1,
    borderColor: '#bcd6ff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  editBannerText: {fontSize: 14, lineHeight: 20, color: '#234', marginBottom: 4},
  label: {fontSize: 16, marginTop: 16, marginBottom: 8},
  padHint: {fontSize: 13, color: '#555', textAlign: 'center', marginBottom: 4},
  paletteStrip: {flexDirection: 'row', width: '100%', height: 36, marginVertical: 4},
  stripSegment: {flex: 1, borderWidth: 1, borderColor: '#999', marginHorizontal: 1},
  stripSelected: {borderWidth: 3, borderColor: '#000'},
  rgbRow: {alignItems: 'center', marginTop: 12},
  rgbText: {fontSize: 16, color: '#007aff'},
  currentSwatch: {width: 64, height: 28, borderRadius: 4, marginTop: 8, borderWidth: 1, borderColor: '#999'},
  modalBackdrop: {flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24},
  modalCard: {backgroundColor: '#fff', borderRadius: 16, padding: 16},
  modalPreview: {height: 40, borderRadius: 8, marginBottom: 16},
  sliderRow: {flexDirection: 'row', alignItems: 'center', marginVertical: 4},
  sliderLabel: {fontSize: 16, width: 20},
  slider: {flex: 1},
  sliderValue: {fontSize: 16, width: 36, textAlign: 'right'},
  button: {marginVertical: 4, width: '100%'},
});
