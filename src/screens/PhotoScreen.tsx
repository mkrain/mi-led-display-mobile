import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Image, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View} from 'react-native';
import {PixelGrid} from '../components/PixelGrid';
import {BottomMenu} from '../components/BottomMenu';
import {AddToSlideshowButton} from '../components/AddToSlideshowButton';
import {ShareImageButton} from '../components/ShareImageButton';
import {ActionToolbar, ToolButton} from '../components/ActionToolbar';
import {loadAutoSend, saveAutoSend} from '../settings/autoSend';
import {usePhotoState} from '../state/PhotoState';
import {CropEditor, CROP_TILE_SIZE} from '../components/CropEditor';
import {cropBoxFromZoomPan} from '../photos/cropBox';
import Slider from '@react-native-community/slider';
import {
  convertImage,
  type ConversionMode,
  type RgbaImage,
} from '../conversion/convert';
import {pickPhoto} from '../photos/pickPhoto';
import {sendFullPicture} from '../ble/device';

const MODES: ConversionMode[] = [
  'Smart',
  'Full',
  'CenterCrop',
  'Fit',
  'TrimColorful',
  'ManualCrop',
];

/**
 * A small built-in demo image (gradient + a colorful subject block), so
 * the mode picker and 16x16 preview can be exercised without a photo.
 * It is NOT a photo: pick a real photo and the same convertImage() entry
 * point runs on the decoded RGBA instead.
 */
function demoImage(): RgbaImage {
  const width = 64;
  const height = 48;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const inSubject = x >= 20 && x < 44 && y >= 12 && y < 36;
      data[i] = inSubject ? 120 : Math.round((x / width) * 200); // R
      data[i + 1] = inSubject ? 40 : Math.round((y / height) * 220); // G
      data[i + 2] = inSubject ? 180 : 140; // B
      data[i + 3] = 255;
    }
  }
  return {data, width, height};
}


const MODE_SHORT: Record<ConversionMode, string> = {
  Smart: 'Trim or center crop',
  Full: 'Squish whole image',
  CenterCrop: 'Center square',
  Fit: 'Letterbox, keep aspect',
  TrimColorful: 'Colorful box only',
  ManualCrop: 'Center square (picked)',
};

const MODE_HELP: Record<ConversionMode, string> = {
  Smart: 'Default (recognizable): colorful trim if found, else center crop, then fill.',
  Full: 'Squish the whole image to 16x16 — the stock app behavior.',
  CenterCrop: 'Center square crop, then fill.',
  Fit: 'Preserve aspect, letterbox on black.',
  TrimColorful: 'Crop to the colorful bounding box (spread > 30), then fill.',
  ManualCrop: 'Caller-supplied box. Demo: the subject block. Picked photo: center square.',
};

export function PhotoScreen() {
  // Photo + options live in PhotoState (above the navigator), not
  // in local state: switching tabs recreates this screen, and local
  // state was lost with it (Oct 29, 2026). Context state survives.
  const {
    picked,
    setPicked,
    mode,
    setMode,
    saturation,
    setSaturation,
    brightness,
    setBrightness,
    modeView,
    setModeView,
    cropZoom,
    setCropZoom,
    cropPanX,
    cropPanY,
    setCropPan,
  } = usePhotoState();
  // Auto-send: persisted toggle, default off. When on, every change
  // to the preview (mode, slider, picked photo) sends to the display
  // after a short settle delay, so a slider drag sends once at the
  // end instead of once per tick.
  const [autoSend, setAutoSend] = useState(false);
  const autoSendRef = useRef(false);
  // Edit-crop mode, local (not in PhotoState): turning it off is
  // safe because the committed crop is already in PhotoState.
  // Off = tile is a picker button, page scrolls normally.
  // On = tile is the crop editor, gestures belong to it alone.
  const [cropEditing, setCropEditing] = useState(false);
  // True only while a tile gesture is in progress (Oct 29, 2026):
  // the page is locked for exactly that window, so a crop drag or
  // pinch moves the photo, not the whole screen — and unlocked
  // between gestures, so the form always scrolls normally.
  const [cropGestureActive, setCropGestureActive] = useState(false);
  const [status, setStatus] = useState('Pick a photo, then Send.');
  const [busy, setBusy] = useState(false);

  const source: RgbaImage = useMemo(
    () => (picked ? picked.image : demoImage()),
    [picked],
  );
  const sourceLabel = picked
    ? `${picked.fileName ?? 'Picked photo'} (${picked.width}x${picked.height})`
    : 'Demo image (64x48)';

  const pixels = useMemo(() => {
    try {
      return convertImage(source, {
        mode,
        // Saturation and brightness come straight from the sliders.
        // Crop and mapping are unchanged; only these factors differ.
        saturation,
        brightness,
        // ManualCrop needs a box: demo subject block for the demo
        // image; for a picked photo, the pinch/pan crop editor's
        // committed window (centre square at zoom 1, pan 0).
        box:
          mode === 'ManualCrop'
            ? picked
              ? cropBoxFromZoomPan(
                  picked.width,
                  picked.height,
                  CROP_TILE_SIZE,
                  cropZoom,
                  cropPanX,
                  cropPanY,
                )
              : {x: 20, y: 12, width: 24, height: 24}
            : undefined,
      });
    } catch (e) {
      setStatus(`Conversion failed: ${e instanceof Error ? e.message : String(e)}`);
      return Array.from({length: 256}, () => [0, 0, 0] as const);
    }
  }, [mode, saturation, brightness, picked, source, cropZoom, cropPanX, cropPanY]);

  useEffect(() => {
    let cancelled = false;
    loadAutoSend().then(value => {
      if (!cancelled) {
        setAutoSend(value);
        autoSendRef.current = value;
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onAutoSendChange(enabled: boolean) {
    setAutoSend(enabled);
    autoSendRef.current = enabled;
    await saveAutoSend(enabled);
    if (enabled) {
      setStatus('Auto-send on.');
    }
  }

  /**
   * Auto-send effect. Debounced 500 ms: a slider drag recomputes
   * pixels on every tick, but the timeout resets on each tick, so
   * only the settled value is sent. Mode taps and photo picks are
   * single changes, so they send 500 ms after the tap. Skipped on
   * the first render (no change has happened yet) and while a manual
   * send is in progress, so sends never overlap.
   */
  const firstPixelsRef = useRef(true);
  const prevPixelsRef = useRef(pixels);
  const busyRef = useRef(false);
  busyRef.current = busy;
  useEffect(() => {
    if (firstPixelsRef.current) {
      firstPixelsRef.current = false;
      prevPixelsRef.current = pixels;
      return;
    }
    // Toggling auto-send on (including restoring the persisted
    // setting on launch) must not itself send: only an actual
    // preview change sends. Pixels identity is stable between
    // changes (useMemo), so an identity check is enough.
    if (pixels === prevPixelsRef.current) {
      return;
    }
    prevPixelsRef.current = pixels;
    if (!autoSend) {
      return;
    }
    const timer = setTimeout(() => {
      if (busyRef.current) {
        return;
      }
      // Silent on success (Oct 29 jitter fix, round 2): previously
      // every crop commit cycled the status through "Custom crop
      // applied" → "Auto-sending…" → "Auto-sent …", so the top line
      // flickered three times per gesture and video frames caught
      // both texts at once. Auto-send success is the expected case
      // and needs no announcement; the status stays on the last
      // user action. Only a failure writes the status, and it is a
      // short stable string, so repeated failures are a no-op.
      sendFullPicture(pixels).catch(e => {
        const message = e instanceof Error ? e.message : String(e);
        setStatus(
          message.includes('Not connected')
            ? 'Auto-send failed: not connected.'
            : 'Auto-send failed.',
        );
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [pixels, autoSend]);

  async function onPickPhoto() {
    setBusy(true);
    setStatus('Opening photo picker…');
    try {
      const photo = await pickPhoto();
      if (photo === null) {
        setStatus('Photo pick cancelled.');
      } else {
        setPicked(photo);
        // A new photo starts from the centre-square crop.
        setCropZoom(1);
        setCropPan(0, 0);
        // No "Picked …" sentence here: the image name + dimensions
        // below the preview already say that, and repeating it in
        // the status line was redundant.
        setStatus('Ready to send.');
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    setBusy(true);
    setStatus('Sending…');
    try {
      await sendFullPicture(pixels);
      setStatus(`Sent (${mode}).`);
    } catch (e) {
      setStatus(`Send failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  // Slideshow library (Oct 30, multiple slideshows): the
  // shared split Add button freezes the CURRENT preview
  // pixels at tap time, with the source name and mode as
  // the label/detail. It works with no panel connection,
  // because nothing here touches BLE — the queue is saved
  // to the panel from the Slideshow tab, not here.

  return (
    <View style={styles.screen}>
    <ScrollView
      contentContainerStyle={styles.container}
      scrollEnabled={!cropGestureActive}
    >
      {/* Page scrolling is locked only while a crop gesture is in
          progress (see cropGestureActive above). The CropEditor's
          capture-phase claim alone did not stop the native
          ScrollView moving the whole screen under a tile drag. */}
      {/* Fixed-height status + help containers (Oct 29 jitter fix):
          status and help text change length as you crop and send
          (one line vs two), and without a fixed height every change
          pushed the toggle, tile, and grid up or down. Height 44
          holds two 16 pt lines, so siblings never move. */}
      <View style={styles.statusWrap}>
        <Text style={styles.status} numberOfLines={1}>{status}</Text>
      </View>
      {/* Crop editor / picker tile, split by an explicit mode toggle
          (Oct 29, 2026: tap, drag, and page-scroll fought each other
          when one tile did all three). The toggle sits right above
          the tile, next to the picker. Off: plain tappable tile,
          no gesture responder, scrolling works. On: CropEditor
          owns the tile, pinch/pan commit on release and switch to
          ManualCrop. A plain tap in edit mode does nothing. */}
      {picked && cropEditing ? (
        <CropEditor
          uri={picked.uri}
          imageWidth={picked.width}
          imageHeight={picked.height}
          zoom={cropZoom}
          panX={cropPanX}
          panY={cropPanY}
          onCropCommit={(z, x, y) => {
            setCropZoom(z);
            setCropPan(x, y);
            setMode('ManualCrop');
            setStatus('Custom crop applied (ManualCrop).');
          }}
          onGestureActive={setCropGestureActive}
        />
      ) : picked ? (
        <TouchableOpacity
          style={styles.previewTile}
          onPress={onPickPhoto}
          disabled={busy}
        >
          <Image
            source={{uri: picked.uri}}
            style={styles.previewImage}
            resizeMode="contain"
          />
          <View style={styles.previewBadge}>
            <Text style={styles.previewBadgeText}>Tap to change photo</Text>
          </View>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.previewTile}
          onPress={onPickPhoto}
          disabled={busy}
        >
          <View style={styles.previewPlaceholder}>
            <Text style={styles.previewPlaceholderGlyph}>▣</Text>
            <Text style={styles.previewPlaceholderText}>Tap to pick a photo</Text>
          </View>
          <View style={styles.previewBadge}>
            <Text style={styles.previewBadgeText}>Tap to pick</Text>
          </View>
        </TouchableOpacity>
      )}
      <Text style={styles.note}>{sourceLabel}</Text>
      {picked ? (
        <View style={styles.photoLinks}>
          <TouchableOpacity
            onPress={() => {
              setCropZoom(1);
              setCropPan(0, 0);
              setStatus('Crop reset to centre square.');
            }}
            disabled={busy}
          >
            <Text style={styles.viewLink}>Reset crop</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setPicked(null);
              setStatus('Back to demo image.');
            }}
            disabled={busy}
          >
            <Text style={styles.viewLink}>Use demo image</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <PixelGrid pixels={pixels} cellSize={20} />
      {/* Action toolbar (Nov 7, 2026): Send / Share / Add
          as three equal tool buttons in the shared
          ActionToolbar, same row Draw uses — Send to the
          panel, Share through the sheet, Add to the active
          slideshow (long-press Add for the picker, or tap
          it when the active slideshow is full). The
          full-width Send / Share / Add buttons that used
          to sit at the bottom are gone; the actions live
          here now, right under the preview they act on. */}
      <ActionToolbar>
        <ToolButton
          label="Send"
          icon="📲"
          onPress={send}
          disabled={busy}
          accessibilityLabel="Send to display"
        />
        <ShareImageButton
          label={picked?.fileName ?? 'Demo image'}
          pixels={pixels}
          disabled={busy}
          variant="tool"
          onResult={setStatus}
        />
        <AddToSlideshowButton
          label={picked?.fileName ?? 'Demo image'}
          detail={`Photo · ${mode} · Sat ${saturation}`}
          pixels={pixels}
          onResult={setStatus}
          variant="tool"
        />
        {/* Edit crop as a toggle button in the toolbar
            (Nov 7, 2026), not a label plus a separate
            on/off switch: same ToolButton as the rest of
            the row, active while editing, disabled with
            no photo picked. The crop editor itself still
            only renders for a picked photo in edit mode. */}
        <ToolButton
          label="Crop"
          icon="✂️"
          onPress={() => setCropEditing(!cropEditing)}
          active={cropEditing}
          disabled={!picked}
          accessibilityLabel="Edit crop"
        />
      </ActionToolbar>
      {/* Trim/mode picker, directly under the 16x16 preview
          (Oct 30, 2026 cleanup): it used to sit at the very
          bottom, past the sliders and all the buttons, so the
          trim options were hidden below the pictures. Now the
          picker and its help text sit right under the preview
          they control, before auto-send, sliders, and Send.
          "View as list" stacks the same cards vertically; it
          is a small text link, not a second control set. */}
      <View style={styles.modeHeader}>
        <Text style={styles.modeLabel}>Trim mode</Text>
        <TouchableOpacity
          onPress={() =>
            setModeView(modeView === 'carousel' ? 'list' : 'carousel')
          }
        >
          <Text style={styles.viewLink}>
            {modeView === 'carousel' ? 'View as list' : 'View as carousel'}
          </Text>
        </TouchableOpacity>
      </View>
      {modeView === 'carousel' ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carousel}
        >
          {MODES.map(m => (
            <TouchableOpacity
              key={m}
              style={[styles.modeCard, m === mode && styles.modeCardActive]}
              onPress={() => setMode(m)}
            >
              <Text style={styles.modeCardTitle}>{m}</Text>
              <Text style={styles.modeCardSub}>{MODE_SHORT[m]}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        <View style={styles.modeList}>
          {MODES.map(m => (
            <TouchableOpacity
              key={m}
              style={[styles.modeRow, m === mode && styles.modeCardActive]}
              onPress={() => setMode(m)}
            >
              <Text style={styles.modeCardTitle}>{m}{m === mode ? ' ✓' : ''}</Text>
              <Text style={styles.modeCardSub}>{MODE_SHORT[m]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <View style={styles.modeHelpWrap}>
        <Text style={styles.modeHelp} numberOfLines={2}>{MODE_HELP[mode]}</Text>
      </View>
      {/* Sliders, below the mode picker. Dragging updates the 16x16
          preview live. Saturation 0–3 (2.5 = A/B winner, 1.15 = old
          default for over-saturated photos); brightness 0.5–1. */}
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>
          Auto-send to display on change
        </Text>
        <Switch value={autoSend} onValueChange={onAutoSendChange} />
      </View>
      <Text style={styles.switchHint}>
        Sends after a short pause when you change a mode, move a slider,
        or pick a photo. Off by default.
      </Text>
      <View style={styles.sliderBlock}>
        <Text style={styles.sliderLabel}>
          Saturation: {saturation.toFixed(1)}
        </Text>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={3}
          step={0.1}
          value={saturation}
          onValueChange={setSaturation}
        />
        <Text style={styles.sliderLabel}>
          Brightness: {brightness.toFixed(2)}
        </Text>
        <Slider
          style={styles.slider}
          minimumValue={0.5}
          maximumValue={1}
          step={0.05}
          value={brightness}
          onValueChange={setBrightness}
        />
      </View>
    </ScrollView>
    <BottomMenu />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1},
  container: {padding: 16, alignItems: 'center'},
  status: {fontSize: 16, textAlign: 'center'},
  // Single-line status (Nov 7, 2026): the old 44px
  // two-line wrap made "Ready." look odd and took up
  // a lot of space. One line, 24px, still fixed height
  // so a status change never pushes the page — same
  // jitter rule as before, just smaller.
  statusWrap: {height: 24, justifyContent: 'center', width: '100%', marginBottom: 8},
  note: {color: '#555', marginBottom: 12, textAlign: 'center'},
  previewTile: {
    // 320x320 to match the 16x16 grid below it (16 x 20):
    // the tile used to be 200x200, noticeably smaller
    // than Draw's grid, which made the Photo page look
    // off-scale next to Draw.
    width: 320,
    height: 320,
    // Square, like Draw's grid: the tile used to be
    // rounded (borderRadius 12), which looked off next
    // to Draw's square grid.
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#e5e5ea',
    overflow: 'hidden',
    marginBottom: 8,
  },
  previewImage: {width: '100%', height: '100%'},
  photoLinks: {flexDirection: 'row', gap: 16, marginBottom: 8},
  previewPlaceholder: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  previewPlaceholderGlyph: {fontSize: 40, color: '#888'},
  previewPlaceholderText: {fontSize: 14, color: '#555', marginTop: 8},
  previewBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  previewBadgeText: {color: '#fff', fontSize: 12, fontWeight: '600'},
  modeHelp: {textAlign: 'center'},
  modeHelpWrap: {height: 44, justifyContent: 'center', width: '100%', marginVertical: 12},
  button: {marginVertical: 4, width: '100%'},
  sliderBlock: {width: '100%', marginVertical: 4},
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 8,
  },
  switchLabel: {fontSize: 15, fontWeight: '600', flex: 1, marginRight: 8},
  switchHint: {fontSize: 12, color: '#555', width: '100%', marginBottom: 8},
  sliderLabel: {fontSize: 14, fontWeight: '600'},
  slider: {width: '100%', height: 40},
  modeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginTop: 16,
    marginBottom: 8,
  },
  modeLabel: {fontSize: 16, fontWeight: 'bold'},
  viewLink: {fontSize: 14, color: '#007aff'},
  carousel: {gap: 10, paddingRight: 16},
  modeCard: {
    width: 140,
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  modeCardActive: {borderColor: '#007aff', backgroundColor: '#eaf3ff'},
  modeCardTitle: {fontSize: 14, fontWeight: '700'},
  modeCardSub: {fontSize: 12, color: '#555', marginTop: 4},
  modeList: {width: '100%', gap: 8},
  modeRow: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
});
