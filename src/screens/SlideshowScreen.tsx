import React, {useState} from 'react';
import {
  Alert,
  Button,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {PixelGrid} from '../components/PixelGrid';
import {BottomMenu} from '../components/BottomMenu';
import {useSlideshowState} from '../state/SlideshowState';
import {useDrawState} from '../state/DrawState';
import {StackActions, useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../App';
import {saveSlideshowReplace} from '../ble/device';
import {shareSlideshowItem} from '../export/shareSlideshowItem';
import type {RGB} from '../conversion/convert';
import {MAX_SLIDESHOW_ITEMS} from '../slideshow/queue';
import {nextDefaultName} from '../slideshow/library';

/**
 * Slideshows library screen (Oct 30, 2026, first
 * multiple-slideshows iteration).
 *
 * The panel holds ONE set at a time, so this is an
 * app-local library: several named slideshows are stored
 * here, one is active, and only the active set is ever
 * sent to the panel. Saving is Replace semantics (proven
 * manually by the Reset-only test): Reset-only, reconnect,
 * save each item in order, then slideshow mode — behind a
 * confirm dialog that names the slideshow and the count.
 * It is deliberately NOT Reset+Save in one burst, which
 * was proven to inject a blank slot. On failure the local
 * slideshow stays intact for a retry, and the error message
 * says what happened to the panel set.
 *
 * "Last saved" is the last Replace save THIS app
 * performed, not a read-back: the panel has no query
 * command, so after a restart, or if another app
 * overwrote the panel, the badge is not a guarantee of
 * what is on the panel now. Move-between-slideshows and
 * duplicate are deliberately NOT here yet — later, after
 * this first iteration is built and tested.
 */
export function SlideshowScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const {setPixels: setDrawPixels, setEditingItem} = useDrawState();
  const {
    slideshows,
    activeSlideshow,
    items,
    activeId,
    lastSaved,
    setActiveSlideshow,
    createSlideshow,
    renameSlideshow,
    deleteSlideshow,
    removeItemById,
    moveItemById,
    clearQueue,
    markSlideshowSaved,
  } = useSlideshowState();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  // Share export (Nov 6, 2026): one selected item at a
  // time, through the system share sheet. Local feedback
  // lives here, next to the button, not in saveStatus at
  // the bottom of the screen.
  const [sharing, setSharing] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  async function onShareSelected() {
    if (!selected || sharing) {
      return;
    }
    setSharing(true);
    setExportStatus('Preparing image…');
    try {
      const outcome = await shareSlideshowItem({
        label: selected.label,
        pixels: selected.pixels,
      });
      setExportStatus(
        outcome === 'shared'
          ? 'Shared — pick Photos, Files, or another app in the sheet.'
          : 'Share cancelled — nothing was saved.',
      );
    } catch (e) {
      setExportStatus(
        `Share failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setSharing(false);
    }
  }
  // Name modal, shared by create and rename: mode 'create'
  // prefill is the next default name, mode 'rename' prefill
  // is the slideshow's current name.
  const [nameModal, setNameModal] = useState<{
    mode: 'create' | 'rename';
    id: string | null;
    name: string;
  } | null>(null);
  const selected =
    items.find(item => item.id === selectedId) ?? items[0] ?? null;

  function confirmDelete(id: string, name: string) {
    Alert.alert(
      `Delete ${name}?`,
      'This only deletes the local slideshow. It does not change anything saved on the panel.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteSlideshow(id);
            setSelectedId(null);
          },
        },
      ],
    );
  }

  function confirmClear() {
    if (!activeSlideshow) {
      return;
    }
    Alert.alert(
      `Clear ${activeSlideshow.name}?`,
      'This only clears the local slideshow. It does not change anything saved on the panel.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Clear slideshow',
          style: 'destructive',
          onPress: () => {
            clearQueue();
            setSelectedId(null);
          },
        },
      ],
    );
  }

  function confirmSave() {
    if (!activeSlideshow || items.length === 0 || saving) {
      return;
    }
    // Backstop for a slideshow created before the cap (e.g. a
    // stored 14-item queue): the panel wraps and silently
    // drops the oldest items over 10, so saving an over-limit
    // slideshow must be blocked, not silently lossy.
    if (items.length > MAX_SLIDESHOW_ITEMS) {
      setSaveStatus(
        `${activeSlideshow.name} has ${items.length} items — the panel keeps only the last ${MAX_SLIDESHOW_ITEMS}. Remove items until ${MAX_SLIDESHOW_ITEMS} or fewer, then save.`,
      );
      return;
    }
    Alert.alert(
      `Erase panel set & save ${activeSlideshow.name} (${items.length} ${items.length === 1 ? 'item' : 'items'})?`,
      'This wipes everything currently saved on the panel, then saves this slideshow in order and sets slideshow mode. The panel set is gone until the save finishes — if it fails partway, save again; the slideshow itself is kept.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Erase & save',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            setSaveStatus('Starting…');
            try {
              await saveSlideshowReplace(
                items.map(item => item.pixels),
                setSaveStatus,
              );
              markSlideshowSaved(activeSlideshow.id);
              setSaveStatus(
                `Saved ${activeSlideshow.name} (${items.length} ${items.length === 1 ? 'item' : 'items'}) to the panel. Watch past 5 min.`,
              );
            } catch (e) {
              setSaveStatus(
                `Save failed: ${e instanceof Error ? e.message : String(e)}`,
              );
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header row: + New lives here, in the library's
            scope, not on the seam between the library list
            and the active slideshow below (Oct 30 fix: the
            mid-screen button read as belonging to either
            section). */}
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Slideshows</Text>
          <TouchableOpacity
            onPress={() =>
              setNameModal({
                mode: 'create',
                id: null,
                name: nextDefaultName(slideshows),
              })
            }
            disabled={saving}
          >
            <Text
              style={[styles.headerNew, saving && styles.headerNewDisabled]}
            >
              ＋ New
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.sectionHeader}>My slideshows</Text>
        {/* Library list: tap a row to make it active. The
            active slideshow is the editing target and the
            next Save target, and the Add button's destination
            in Photo/Draw. */}
        {slideshows.map(s => {
          const isActive = s.id === activeId;
          const isLastSaved = lastSaved?.slideshowId === s.id;
          return (
            <View key={s.id} style={styles.libRow}>
              <TouchableOpacity
                style={styles.libText}
                onPress={() => {
                  setActiveSlideshow(s.id);
                  setSelectedId(null);
                }}
                disabled={saving}
              >
                <Text style={styles.libName}>{s.name}</Text>
                <Text style={styles.libMeta}>
                  {s.items.length} {s.items.length === 1 ? 'item' : 'items'}
                </Text>
                {isActive ? (
                  <Text style={[styles.badge, styles.badgeActive]}>
                    Active ✓
                  </Text>
                ) : null}
                {isLastSaved && lastSaved ? (
                  <Text style={[styles.badge, styles.badgeSaved]}>
                    Last saved ·{' '}
                    {new Date(lastSaved.savedAt).toLocaleDateString()}
                  </Text>
                ) : null}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() =>
                  setNameModal({mode: 'rename', id: s.id, name: s.name})
                }
                disabled={saving}
              >
                <Text style={styles.libCtrl}>✎</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => confirmDelete(s.id, s.name)}
                disabled={saving}
              >
                <Text style={[styles.libCtrl, styles.libCtrlDelete]}>✕</Text>
              </TouchableOpacity>
            </View>
          );
        })}
        {lastSaved ? (
          <Text style={styles.note}>
            “Last saved” is the last Replace save this app
            performed — the panel cannot be read back, so it
            is not a guarantee of what is on the panel now.
          </Text>
        ) : null}
        <Modal
          visible={nameModal !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setNameModal(null)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                {nameModal?.mode === 'rename'
                  ? 'Rename slideshow'
                  : 'New slideshow'}
              </Text>
              <TextInput
                style={styles.modalInput}
                value={nameModal?.name ?? ''}
                onChangeText={name =>
                  setNameModal(prev => (prev ? {...prev, name} : prev))
                }
                autoFocus
                placeholder="Slideshow name"
              />
              <View style={styles.button}>
                <Button
                  title="Save"
                  disabled={(nameModal?.name.trim().length ?? 0) === 0}
                  onPress={() => {
                    if (!nameModal) {
                      return;
                    }
                    if (nameModal.mode === 'create') {
                      createSlideshow(nameModal.name);
                    } else if (nameModal.id) {
                      renameSlideshow(nameModal.id, nameModal.name);
                    }
                    setSelectedId(null);
                    setNameModal(null);
                  }}
                />
              </View>
              <View style={styles.button}>
                <Button title="Cancel" onPress={() => setNameModal(null)} />
              </View>
            </View>
          </View>
        </Modal>
        {/* Active slideshow's items, as before, now scoped
            to the active slideshow, under their own header
            so the library/active boundary is explicit. */}
        {activeSlideshow ? (
          <Text style={styles.sectionHeader}>Active slideshow</Text>
        ) : null}
        {!activeSlideshow ? (
          <Text style={styles.empty}>
            No slideshows yet. Create one above, or add a photo
            from Photo or graffiti from Draw — Add will create
            “My slideshow” for you.
          </Text>
        ) : items.length === 0 ? (
          <Text style={styles.empty}>
            {activeSlideshow.name} is empty. Add photos from Photo
            or graffiti from Draw with “＋ Add to {activeSlideshow.name}”.
            Nothing here touches the panel until you save it.
          </Text>
        ) : (
          <>
            <Text style={styles.status}>
              {activeSlideshow.name} · {items.length}{' '}
              {items.length === 1 ? 'item' : 'items'} · order
              = panel cycle order
            </Text>
            {selected ? (
              <View style={styles.preview}>
                <PixelGrid pixels={selected.pixels} cellSize={12} />
                <Text style={styles.previewLabel}>
                  {selected.label}
                </Text>
                <Text style={styles.previewDetail}>{selected.detail}</Text>
                <View style={styles.button}>
                  <Button
                    title="Edit in Draw"
                    onPress={() => {
                      // Edit in Draw (Oct 30, 2026): load a
                      // deep copy of the item's pixels into
                      // Draw, record the editing target, and
                      // move to Draw. PopTo replaces this
                      // screen with Draw if Draw is not in
                      // the stack yet, like the bottom menu.
                      // Pixel-level only: a photo item's
                      // source photo is not stored with it,
                      // so crop/mode/saturation cannot be
                      // reopened from here.
                      if (!activeSlideshow) {
                        return;
                      }
                      setDrawPixels(
                        selected.pixels.map(
                          p => [p[0], p[1], p[2]] as RGB,
                        ),
                      );
                      setEditingItem({
                        slideshowId: activeSlideshow.id,
                        itemId: selected.id,
                        slideshowName: activeSlideshow.name,
                        label: selected.label,
                      });
                      navigation.dispatch(StackActions.popTo('Draw'));
                    }}
                  />
                </View>
                <View style={styles.button}>
                  <Button
                    title={sharing ? 'Preparing…' : 'Share image…'}
                    onPress={onShareSelected}
                    disabled={sharing || saving}
                  />
                </View>
                {exportStatus ? (
                  <Text style={styles.note}>{exportStatus}</Text>
                ) : null}
              </View>
            ) : null}
            {items.map((item, index) => (
              <View key={item.id} style={styles.row}>
                <TouchableOpacity onPress={() => setSelectedId(item.id)}>
                  <PixelGrid pixels={item.pixels} cellSize={3} />
                </TouchableOpacity>
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>
                    {index + 1}. {item.label}
                  </Text>
                  <Text style={styles.rowDetail}>{item.detail}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => moveItemById(item.id, 'up')}
                  disabled={index === 0 || saving}
                >
                  <Text
                    style={[
                      styles.ctrl,
                      (index === 0 || saving) && styles.ctrlDisabled,
                    ]}
                  >
                    ↑
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => moveItemById(item.id, 'down')}
                  disabled={index === items.length - 1 || saving}
                >
                  <Text
                    style={[
                      styles.ctrl,
                      (index === items.length - 1 || saving) &&
                        styles.ctrlDisabled,
                    ]}
                  >
                    ↓
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => removeItemById(item.id)}
                  disabled={saving}
                >
                  <Text
                    style={[
                      styles.ctrl,
                      styles.ctrlDelete,
                      saving && styles.ctrlDisabled,
                    ]}
                  >
                    ✕
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}
        <View style={styles.button}>
          <Button
            title={
              saving
                ? 'Saving slideshow…'
                : activeSlideshow
                  ? `Save ${activeSlideshow.name} to display`
                  : 'Save slideshow to display'
            }
            onPress={confirmSave}
            disabled={
              !activeSlideshow ||
              items.length === 0 ||
              saving ||
              items.length > MAX_SLIDESHOW_ITEMS
            }
          />
        </View>
        {items.length > MAX_SLIDESHOW_ITEMS ? (
          <Text style={styles.note}>
            This slideshow has {items.length} items — the panel
            keeps only the last {MAX_SLIDESHOW_ITEMS}, overwriting
            the oldest. Remove items until {MAX_SLIDESHOW_ITEMS} or
            fewer to save.
          </Text>
        ) : null}
        {saveStatus ? <Text style={styles.note}>{saveStatus}</Text> : null}
        {saving ? (
          <Text style={styles.note}>
            Keep this screen open until it finishes (~30s, the
            reconnect scan alone takes ~20s). Leaving the screen
            does not stop the save, but you will not see its
            result.
          </Text>
        ) : null}
        <Text style={styles.note}>
          Replace save: Reset-only, reconnect, save each item in
          order, then slideshow mode. The old panel set is wiped
          — if the save fails partway, the slideshow is kept and
          you can save again.
        </Text>
        {activeSlideshow && items.length > 0 ? (
          <View style={styles.button}>
            <Button
              title={`Clear ${activeSlideshow.name} (local only)`}
              onPress={confirmClear}
              disabled={saving}
            />
          </View>
        ) : null}
      </ScrollView>
      <BottomMenu />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1},
  container: {padding: 16, alignItems: 'center'},
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 8,
  },
  headerTitle: {fontSize: 22, fontWeight: 'bold'},
  headerNew: {fontSize: 16, fontWeight: '600', color: '#007aff'},
  headerNewDisabled: {color: '#ccc'},
  sectionHeader: {
    fontSize: 16,
    fontWeight: '700',
    alignSelf: 'flex-start',
    marginTop: 12,
    marginBottom: 4,
  },
  libRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    width: '100%',
  },
  libText: {flex: 1, marginRight: 8},
  libName: {fontSize: 16, fontWeight: '600'},
  libMeta: {fontSize: 13, color: '#555'},
  badge: {fontSize: 12, fontWeight: '700', marginTop: 2},
  badgeActive: {color: '#1a7a2e'},
  badgeSaved: {color: '#555'},
  libCtrl: {fontSize: 20, color: '#007aff', paddingHorizontal: 6},
  libCtrlDelete: {color: '#ff3b30'},
  status: {fontSize: 16, marginBottom: 12, marginTop: 16, textAlign: 'center'},
  empty: {fontSize: 16, lineHeight: 22, textAlign: 'center', color: '#555', marginTop: 16},
  preview: {alignItems: 'center', marginBottom: 16},
  previewLabel: {fontSize: 16, fontWeight: '600', marginTop: 8},
  previewDetail: {fontSize: 13, color: '#555'},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    width: '100%',
  },
  rowText: {flex: 1, marginLeft: 10},
  rowLabel: {fontSize: 16, fontWeight: '600'},
  rowDetail: {fontSize: 13, color: '#555'},
  ctrl: {fontSize: 22, color: '#007aff', paddingHorizontal: 6},
  ctrlDisabled: {color: '#ccc'},
  ctrlDelete: {color: '#ff3b30'},
  button: {marginVertical: 4, width: '100%'},
  note: {marginTop: 8, color: '#555', textAlign: 'center'},
  modalBackdrop: {flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24},
  modalCard: {backgroundColor: '#fff', borderRadius: 16, padding: 16},
  modalTitle: {fontSize: 16, fontWeight: '700', marginBottom: 12},
  modalInput: {borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, fontSize: 16, marginBottom: 8},
});
