import React, {useState} from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type {RGB} from '../conversion/convert';
import {useSlideshowState} from '../state/SlideshowState';
import {MAX_SLIDESHOW_ITEMS} from '../slideshow/queue';
import {ToolButton} from './ActionToolbar';

/**
 * Split "Add to slideshow" button, shared by Photo and Draw
 * (Oct 30, 2026, multiple-slideshows first iteration).
 *
 * Main part: adds the given pixels to the active slideshow
 * in one tap — creating a default-named slideshow first
 * when the library is empty, since delete-last is allowed.
 * The button label names the destination, so the target is
 * visible before tapping.
 *
 * ▾ part: opens a picker listing the slideshows (name,
 * count, active marker, full marker) plus "＋ New
 * slideshow…". Picking a target adds there AND makes it
 * active, so the next tap-add goes there too and the main
 * label stays truthful. Picking "New" creates a
 * default-named slideshow, makes it active, and adds there.
 *
 * A full target reports "[Name] is full (10 items, panel
 * limit)" and adds nothing — it never silently substitutes
 * another slideshow. It also opens the picker, so the
 * alternatives are offered at the tap point instead of
 * only in the status line at the top of the screen (which
 * is off-screen when the Add button is in view). Picking
 * a full target inside the picker re-opens the picker,
 * so the user can pick another slideshow or Cancel.
 *
 * No icon library is used (that would need a native
 * rebuild): ▾ is plain text.
 */
interface AddToSlideshowButtonProps {
  label: string;
  detail: string;
  pixels: RGB[];
  onResult: (message: string) => void;
  /**
   * 'full' (default): the split full-width button, main
   * tap adds to the active slideshow, ▾ opens the picker.
   * 'tool': a single tool button for an ActionToolbar
   * row — tap adds to the active slideshow, and the
   * picker is still reachable: a full target opens it,
   * and the ▾ is part of the button label. The picker
   * modal itself is unchanged.
   */
  variant?: 'full' | 'tool';
}

export function AddToSlideshowButton({
  label,
  detail,
  pixels,
  onResult,
  variant = 'full',
}: AddToSlideshowButtonProps) {
  const {
    slideshows,
    activeSlideshow,
    addItem,
    addItemToSlideshow,
    addItemToNewSlideshow,
  } = useSlideshowState();
  const [pickerVisible, setPickerVisible] = useState(false);

  function report(result: {added: boolean; name: string; created: boolean}) {
    if (result.added) {
      onResult(
        result.created
          ? `Created '${result.name}' and added.`
          : `Added to ${result.name}.`,
      );
    } else {
      // Full (or unknown) target: report it, and offer the
      // alternatives right here. Gate on a non-empty name so
      // an unknown-target failure does not open the picker.
      if (result.name) {
        setPickerVisible(true);
      }
      onResult(
        `${result.name} is full (${MAX_SLIDESHOW_ITEMS} items, panel limit). Remove one first.`,
      );
    }
  }

  const activeName = activeSlideshow?.name ?? 'slideshow';

  // The picker modal is shared by both variants: full
  // reaches it from the ▾, tool reaches it from a full
  // target (via report) — and, in tool form, from a
  // long-press on the Add button, since there is no
  // room for a separate ▾ in a toolbar row.
  const pickerModal = (
    <Modal
      visible={pickerVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setPickerVisible(false)}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Add to which slideshow?</Text>
          {slideshows.map(s => {
            const full = s.items.length >= MAX_SLIDESHOW_ITEMS;
            return (
              <TouchableOpacity
                key={s.id}
                style={styles.pickerRow}
                onPress={() => {
                  setPickerVisible(false);
                  report(
                    addItemToSlideshow(s.id, label, detail, pixels),
                  );
                }}
              >
                <Text style={styles.pickerRowText}>
                  {s.id === activeSlideshow?.id ? '✓ ' : ''}
                  {s.name} — {s.items.length} {s.items.length === 1 ? 'item' : 'items'}
                  {full ? ' (full)' : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={styles.pickerRow}
            onPress={() => {
              setPickerVisible(false);
              report(addItemToNewSlideshow(label, detail, pixels));
            }}
          >
            <Text style={[styles.pickerRowText, styles.pickerNew]}>
              ＋ New slideshow…
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.pickerRow}
            onPress={() => setPickerVisible(false)}
          >
            <Text style={[styles.pickerRowText, styles.pickerCancel]}>
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  if (variant === 'tool') {
    return (
      <>
        <ToolButton
          label="Add"
          icon="＋"
          onPress={() => report(addItem(label, detail, pixels))}
          onLongPress={() => setPickerVisible(true)}
          accessibilityLabel={`Add to ${activeName}`}
        />
        {pickerModal}
      </>
    );
  }

  return (
    <View style={styles.splitRow}>
      <TouchableOpacity
        style={styles.main}
        onPress={() => report(addItem(label, detail, pixels))}
      >
        <Text style={styles.mainText}>＋ Add to {activeName}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.chev}
        onPress={() => setPickerVisible(true)}
        accessibilityLabel="Choose slideshow to add to"
      >
        <Text style={styles.chevText}>▾</Text>
      </TouchableOpacity>
      {pickerModal}
    </View>
  );
}

const styles = StyleSheet.create({
  splitRow: {flexDirection: 'row', marginVertical: 4, width: '100%'},
  main: {
    flex: 1,
    backgroundColor: '#007aff',
    paddingVertical: 12,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
    alignItems: 'center',
  },
  mainText: {color: '#fff', fontSize: 16, fontWeight: '600'},
  chev: {
    backgroundColor: '#005bb5',
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
  },
  chevText: {color: '#fff', fontSize: 18},
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {backgroundColor: '#fff', borderRadius: 16, padding: 16},
  modalTitle: {fontSize: 16, fontWeight: '700', marginBottom: 8},
  pickerRow: {paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee'},
  pickerRowText: {fontSize: 16},
  pickerNew: {color: '#007aff'},
  pickerCancel: {color: '#555'},
});
