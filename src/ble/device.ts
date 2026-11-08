/**
 * BLE transport wrapper around react-native-ble-manager (v12, new
 * architecture). This is the only file that talks to the native BLE stack;
 * protocol.ts owns the bytes, this file owns scan / connect / write.
 *
 * Untested on hardware: the iOS build, the Android build, and the real
 * "MI Matrix Display" connection have NOT been run yet — the VM cannot do
 * them. They are run on a developer's Mac / phone (see mobile/README.md).
 * In particular, a 100-byte full-picture block needs an MTU above
 * the Android default: iOS/macOS negotiate a larger MTU
 * automatically, Android stays at 23-byte ATT (20-byte payload)
 * unless the app asks, so an unnegotiated Android link splits
 * or truncates full-picture blocks and the panel shows a
 * garbled mosaic instead of the image (Oct 31, 2026, both
 * Draw and Photo on Samsung A15). connectToDisplay therefore
 * requests a larger MTU on Android after connect (see
 * requestMtuIfAndroid), and reports the granted MTU so a
 * too-small grant is visible instead of a silent garble.
 */

import {PermissionsAndroid, Platform} from 'react-native';
import BleManager from 'react-native-ble-manager';
import type {Peripheral} from 'react-native-ble-manager';
import {
  CHARACTERISTIC_UUID,
  DEVICE_NAME,
  SERVICE_UUID,
  type PixelGrid,
  effectSaveCommands,
  fullPictureCommands,
  lampAllSlotsCommands,
  lampSlotSaveCommands,
  resetCommand,
  resetSavedPictureCommands,
  savedPictureCommands,
  slideshowCommand,
} from './protocol';
import {
  clearConnection,
  getConnection,
  setConnection,
  type ConnectionInfo,
} from './connection';
import {saveLastDevice} from '../settings/lastDevice';

export type {Peripheral};
export type {ConnectionInfo};

let started = false;
let disconnectListenerRegistered = false;

async function ensureStarted(): Promise<void> {
  if (!started) {
    await BleManager.start({showAlert: false});
    started = true;
  }
  // Panel-initiated drops must clear the shared connection state,
  // or the banner and the send paths will keep believing a dead
  // link is live (Oct 30, 2026). ble-manager v12's disconnect event
  // carries {peripheral: id}, not a Peripheral object, so compare
  // the id, not the object. Registered once, for the app lifetime.
  if (!disconnectListenerRegistered) {
    disconnectListenerRegistered = true;
    BleManager.onDisconnectPeripheral(event => {
      const current = getConnection();
      if (current && event.peripheral === current.id) {
        clearConnection();
      }
    });
  }
}

/** Runtime Android permissions. iOS handles Bluetooth via Info.plist. */
export async function requestAndroidPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : 0;
  const permissions =
    apiLevel >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const result = await PermissionsAndroid.requestMultiple(permissions);
  return Object.values(result).every(v => v === PermissionsAndroid.RESULTS.GRANTED);
}

/**
 * Android runtime-permission gate for operations that touch the
 * adapter (connect, scan). Throws a friendly error when the
 * permission is not granted, instead of letting Android's
 * SecurityException ("Need android.permission.BLUETOOTH_CONNECT
 * permission for AttributionSource…") surface verbatim.
 * Idempotent: requesting an already-granted permission returns
 * immediately without showing a dialog.
 */
async function ensureAndroidPermissions(): Promise<void> {
  const granted = await requestAndroidPermissions();
  if (!granted) {
    throw new Error('Bluetooth permissions were not granted.');
  }
}

function isDisplay(peripheral: Peripheral): boolean {
  // Match Python (BleakScanner.discover() + `"MI Matrix Display" in name`):
  // substring, not exact — iOS may report a trailing space or a shortened
  // local name, and the name field is sometimes only filled after connect.
  return (
    peripheral.name?.includes(DEVICE_NAME) === true ||
    peripheral.advertising?.localName?.includes(DEVICE_NAME) === true
  );
}

/**
 * Android MTU (Oct 31, 2026): request 512, take whatever the
 * panel grants. Returns the granted MTU, or null on iOS
 * (not applicable — CoreBluetooth negotiates MTU itself)
 * and on Android when negotiation fails. A failure must
 * never fail the connect: the link still works for short
 * commands, and a too-small grant is reported to the user
 * instead of silently garbling full pictures. A full-picture
 * block needs a grant of at least 104 (101-byte stored block
 * + 3 ATT bytes); a 100-byte live block needs 103.
 */
async function requestMtuIfAndroid(
  peripheralId: string,
): Promise<number | null> {
  if (Platform.OS !== 'android') {
    return null;
  }
  try {
    return await BleManager.requestMTU(peripheralId, 512);
  } catch {
    return null;
  }
}

export function mtuStatusSuffix(mtu: number | null): string {
  if (Platform.OS !== 'android') {
    return '';
  }
  if (mtu === null) {
    return ' MTU negotiation failed, full pictures may be garbled.';
  }
  return ` MTU ${mtu}.`;
}
export async function getBleState(): Promise<string> {
  await ensureStarted();
  return BleManager.checkState();
}

/**
 * Wait for CoreBluetooth to settle on a real state. 'unknown' is the
 * initial CBCentralManager state before it has reported anything — it
 * does NOT mean Bluetooth is off or permission was denied, and it
 * routinely appears immediately after BleManager.start() even when
 * Bluetooth is on and allowed. Polling here, instead of failing on the
 * first 'unknown', is what makes the scan actually start on a real phone.
 */
async function waitForBleState(timeoutMs = 5000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let state = await BleManager.checkState();
  while (state === 'unknown' && Date.now() < deadline) {
    await sleep(250);
    state = await BleManager.checkState();
  }
  return state;
}

async function requireBleOn(): Promise<void> {
  const state = await waitForBleState();
  if (state !== 'on') {
    throw new Error(
      `Bluetooth is ${state}. Turn Bluetooth on and allow MiLedDisplay to use it, then scan again.`,
    );
  }
}

/**
 * Wait for CoreBluetooth to settle, and return its state
 * (Oct 30, 2026, fast-reconnect status fix). The direct
 * reconnect used to burn its 8s timeout on a cold launch
 * while the radio was still 'unknown', then fall back to a
 * scan that DID wait — so a warm-up problem looked like a
 * slow panel. Callers that need a clear Bluetooth-off error
 * should let the scan path's requireBleOn throw it, and use
 * this only to decide whether a direct try is worth making.
 */
export async function waitForBleReady(timeoutMs = 5000): Promise<string> {
  await ensureStarted();
  return waitForBleState(timeoutMs);
}

/**
 * Run a scan for `seconds` and collect discoveries.
 *
 * CRITICAL ble-manager v12 iOS detail: the native scan() callback fires
 * IMMEDIATELY after scanning starts (SwiftBleManager.scan calls
 * callback([]) right after scanForPeripherals), not when the scan stops.
 * The scan only ends when its timer fires and emits onStopScan. The old
 * code awaited scan() and then immediately removed the discover
 * subscription and read the discovered list — i.e. after milliseconds,
 * not after `seconds` — which is exactly why pressing Scan returned
 * instantly with no devices, and only repeated presses (with earlier
 * scans still running in the background) ever showed anything.
 * This helper waits for onStopScan (with a seconds+5s fallback) before
 * returning, so the scan actually runs for the full duration.
 */
async function scanAndCollect(
  seconds: number,
  keep: (peripheral: Peripheral) => boolean,
): Promise<Peripheral[]> {
  const found = new Map<string, Peripheral>();
  const discoverSub = BleManager.onDiscoverPeripheral(peripheral => {
    if (keep(peripheral)) {
      found.set(peripheral.id, peripheral);
    }
  });
  let stopSub: ReturnType<typeof BleManager.onStopScan> | undefined;
  const stopped = new Promise<void>(resolve => {
    stopSub = BleManager.onStopScan(() => {
      resolve();
    });
  });
  const fallback = sleep((seconds + 5) * 1000);
  try {
    // No service-UUID filter: the Python scripts use unfiltered
    // BleakScanner.discover() and match by name, and iOS only returns a
    // peripheral for a service-filtered scan if that service is in its
    // advertising packet — the FFD0 service may only appear in the GATT
    // database after connect, not in the advertisement.
    await BleManager.scan({seconds});
    await Promise.race([stopped, fallback]);
    await BleManager.stopScan().catch(() => undefined);
  } finally {
    discoverSub.remove();
    stopSub?.remove();
  }
  // Belt and braces: also check the discovered list after the scan.
  const discovered = await BleManager.getDiscoveredPeripherals();
  for (const peripheral of discovered) {
    if (keep(peripheral)) {
      found.set(peripheral.id, peripheral);
    }
  }
  return [...found.values()];
}

/**
 * Scan for the display for `seconds` and return matching peripherals.
 * Requests the Android runtime permission first (no-op when already
 * granted), so callers cannot hit Android's SecurityException.
 */
export async function scanForDisplay(seconds = 20): Promise<Peripheral[]> {
  await ensureAndroidPermissions();
  await ensureStarted();
  await requireBleOn();
  return scanAndCollect(seconds, isDisplay);
}

/**
 * Debug scan: every peripheral iOS sees, unfiltered by name or service.
 * Use this to tell "the display isn't advertising at all" apart from
 * "it's advertising under a different name/service".
 */
export async function scanAllPeripherals(seconds = 20): Promise<Peripheral[]> {
  await ensureStarted();
  await requireBleOn();
  return scanAndCollect(seconds, () => true);
}

/**
 * Connect and retrieve services for the display's service, with a timeout.
 * Without this, a connect to a stale/rotated UUID (BLE private addresses
 * rotate, so a UUID from an earlier scan may no longer be valid) or to a
 * peripheral that never answers can hang forever — and the Connect screen
 * stays "Connecting…" with its buttons disabled, which is exactly the
 * stuck state seen on hardware. On timeout we disconnect and throw, so
 * the screen unblocks with a real error instead.
 *
 * Returns the granted Android MTU, or null on iOS / when MTU
 * negotiation failed (see requestMtuIfAndroid). The MTU request
 * runs AFTER the connect timeout race, so a slow MTU negotiation
 * cannot burn the connect timeout, and it never throws.
 */
export async function connectToDisplay(
  peripheralId: string,
  name: string | null = null,
  timeoutMs = 15000,
): Promise<number | null> {
  // Android: permission first, or connect throws SecurityException.
  await ensureAndroidPermissions();
  await ensureStarted();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error('Connect timed out after 15s. Re-scan and try again — the display may have a new UUID, or be connected to another app.')),
      timeoutMs,
    );
  });
  try {
    // Race the whole connect + service discovery, not just connect:
    // retrieveServices can hang on its own, and a hang there left the
    // screen stuck on "Connecting…" even with the connect timeout in place.
    await Promise.race([
      (async () => {
        await BleManager.connect(peripheralId);
        await BleManager.retrieveServices(peripheralId, [SERVICE_UUID]);
      })(),
      timeout,
    ]);
    // MTU is requested before the connection is published, so
    // the banner / status never show "Connected" without an
    // MTU: the Oct 31 display bug was a status line that
    // vanished on screen remount, and publishing the MTU as
    // part of the connection (not as a status suffix) is the
    // fix. Still never throws: a failed request publishes
    // mtu null, which the banner reports as unknown.
    const mtu = await requestMtuIfAndroid(peripheralId);
    setConnection({id: peripheralId, name, mtu});
    // Persist the last device on every successful connect, so
    // the next launch can fast-reconnect to it directly instead
    // of paying for a full scan first. This covers manual
    // connects, auto-connects, and the Replace-save reconnect,
    // all of which go through this function. Best effort and
    // awaited, so a kill immediately after connect does not
    // lose it.
    await saveLastDevice({id: peripheralId, name});
    return mtu;
  } catch (error) {
    await BleManager.disconnect(peripheralId).catch(() => undefined);
    clearConnection();
    throw error;
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

export async function disconnectDisplay(): Promise<void> {
  const current = getConnection();
  if (current) {
    await BleManager.disconnect(current.id).catch(() => undefined);
    clearConnection();
  }
}

export function getConnectedPeripheralId(): string | null {
  return getConnection()?.id ?? null;
}

/**
 * Re-sync the shared connection state with what the OS actually
 * reports as connected. This is what makes a screen remount or an
 * app restart show the truth instead of a stale local banner:
 * - OS reports our display (by id, or by name if the id rotated):
 *   adopt it, so sends work and the banner shows Connected.
 * - OS reports no display and we thought we were connected: clear
 *   it, so sends fail fast with "Not connected" instead of writing
 *   into a dead link, and the banner shows Not connected.
 * - OS query errors: leave the current state alone — an error is
 *   not evidence of a disconnect.
 * Best-effort by design: callers swallow its errors.
 */
export async function refreshConnection(): Promise<ConnectionInfo | null> {
  // Best-effort status sync: never prompt and never throw for a
  // missing permission. On Android 12+, touching the adapter
  // without BLUETOOTH_CONNECT throws SecurityException, so check
  // silently first and report the current state instead.
  if (Platform.OS === 'android') {
    const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : 0;
    if (apiLevel >= 31) {
      const hasConnect = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      );
      if (!hasConnect) {
        return getConnection();
      }
    }
  }
  await ensureStarted();
  const current = getConnection();
  try {
    const connected = await BleManager.getConnectedPeripherals([SERVICE_UUID]);
    if (current && connected.some(p => p.id === current.id)) {
      return current;
    }
    const display = connected.find(isDisplay);
    if (display) {
      // Adopted connections did not go through
      // connectToDisplay, so they never got an MTU request.
      // Best effort, result stored: a failed request here
      // must not turn an adopted connection into an error,
      // and the banner must still show MTU unknown, not a
      // stale number from an earlier session.
      const mtu = await requestMtuIfAndroid(display.id).catch(() => null);
      const info: ConnectionInfo = {
        id: display.id,
        name: display.name ?? null,
        mtu,
      };
      setConnection(info);
      return info;
    }
    if (current) {
      clearConnection();
    }
    return null;
  } catch {
    return current;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Write one command (a number[] of bytes) without response. Mirrors the
 * Python scripts, which write and then pause briefly between commands.
 *
 * CRITICAL: ble-manager's writeWithoutResponse defaults maxByteSize to
 * 20, and the native side SPLITS any longer value into 20-byte chunks,
 * each sent as its own write. A 100-byte full-picture block was therefore
 * arriving as 5 fragments, none of which (after the first) starts with
 * 0xBC or ends with 0x55 — the panel applied only the first chunk's
 * ~5-6 pixels per block (the left column of even rows, and the first
 * pixels of the top row) and ignored the rest, leaving the old image
 * everywhere else. That is exactly the partial test-pattern seen on
 * hardware. Passing a maxByteSize above the longest command (101 bytes
 * for a stored block) sends each command as a single write, as Python
 * does. Small commands (power, graffiti init, single pixel) were under
 * 20 bytes, which is why they worked while full pictures did not.
 */
export async function writeCommand(command: number[]): Promise<void> {
  const current = getConnection();
  if (!current) {
    throw new Error('Not connected to a display. Connect first.');
  }
  await BleManager.writeWithoutResponse(
    current.id,
    SERVICE_UUID,
    CHARACTERISTIC_UUID,
    command,
    512,
  );
}

/** Write several commands in order, with a pause between each. */
export async function writeCommands(
  commands: readonly number[][],
  delayMs = 2,
): Promise<void> {
  for (const command of commands) {
    await writeCommand(command);
    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }
}

/**
 * Send a full 16x16 picture, mirroring draw_picture.py: init, 8 blocks
 * with ~25 ms between blocks, then the end command.
 */
export async function sendFullPicture(pixels: PixelGrid): Promise<void> {
  const commands = fullPictureCommands(pixels);
  // Init (2 ms), blocks (25 ms apart), end (2 ms) — same shape as Python.
  await writeCommand(commands[0]);
  await sleep(2);
  for (const block of commands.slice(1, -1)) {
    await writeCommand(block);
    await sleep(25);
  }
  await writeCommand(commands[commands.length - 1]);
  await sleep(2);
}

/**
 * Save a single 16x16 picture to the panel, NO Reset, NO slideshow.
 * Sequence (see savedPictureCommands in protocol.ts): open, init,
 * 8 stored blocks, end, close. Timing mirrors sendFullPicture:
 * 2 ms around the short frames, 25 ms between blocks.
 *
 * This is a TEST path, separate from sendFullPicture: it must never
 * be triggered by auto-send, which stays live-only. Only the manual
 * "Save to device (test)" button in PhotoScreen calls it, so a save
 * happens exactly once, when the user asks for it.
 */
export async function savePictureToDevice(pixels: PixelGrid): Promise<void> {
  const commands = savedPictureCommands(pixels);
  await writeCommand(commands[0]); // open
  await sleep(2);
  await writeCommand(commands[1]); // init
  await sleep(2);
  for (const block of commands.slice(2, -2)) {
    await writeCommand(block);
    await sleep(25);
  }
  await writeCommand(commands[commands.length - 2]); // end
  await sleep(2);
  await writeCommand(commands[commands.length - 1]); // close
  await sleep(2);
}

/**
 * Fast static save (Nov 8, 2026): the stock app's save, read
 * from offe's snoops/saves_to_device_with_summary.txt — open,
 * init, 8 stored blocks, end, close, then slideshow mode,
 * with NO Reset anywhere. The two Reset frames in that snoop
 * (lines 92, 181) are the researcher's manual reset at the
 * start of the session, before any save. Our Replace sequence
 * added Reset to cure the blank slot the Reset+Save burst
 * created, but Reset drops the link and forces a ~20s
 * reconnect scan, so a lamp colour took ~30s to apply where
 * the stock app applies it in about a second. This is the
 * fast path: the same stored blocks as a slideshow save,
 * then slideshow mode so the panel shows the saved set.
 * It APPENDS to the saved set — it does not wipe — so
 * repeated lamp changes accumulate images unless the panel
 * overwrites the slot; the Lamp device test settles that.
 */
export async function saveStaticPictureToDevice(
  pixels: PixelGrid,
): Promise<void> {
  await savePictureToDevice(pixels);
  await writeCommand(slideshowCommand());
  await sleep(2);
}

/**
 * Lamp slot save (Nov 8, 2026): writes one solid colour as
 * image index 1 of a 1-image set, via the 0x02 indexed-write
 * family (lampSlotSaveCommands in protocol.ts). Hypothesis
 * test, not a proven path: the plain save appends, so a lamp
 * colour must overwrite a slot to stay a single static
 * image. No Reset, so the link never drops. Timings follow
 * SpawnDev: 50 ms after the 0x11 bracket commands, 5 ms
 * between the 0x02 writes.
 */
export async function saveLampColor(pixels: PixelGrid): Promise<void> {
  await saveLampCommands(lampSlotSaveCommands(pixels));
}

/**
 * Lamp all-slots save (Nov 8, 2026): the same colour in all
 * 8 slots, count 8. The slot save proved a count-1 write
 * appends — the colour appeared at the end of the cycle —
 * so this tests whether a full 8-image transfer defines
 * the set. No Reset, so the link never drops.
 */
export async function saveLampColorAllSlots(
  pixels: PixelGrid,
): Promise<void> {
  await saveLampCommands(lampAllSlotsCommands(pixels));
}

/**
 * Light effect save (Nov 8, 2026): 8 different frames,
 * one per slot, same 70-command shape and same proven
 * pacing as the lamp all-slots save. The panel cycles
 * the 8 frames at about 1s each, so this is the stored
 * animation the stock app's Light effect plays with
 * the app closed. No Reset, so the link never drops.
 */
export async function saveEffectToDevice(
  frames: readonly PixelGrid[],
): Promise<void> {
  await saveLampCommands(effectSaveCommands(frames));
}

/**
 * Write a Lamp 0x02 sequence: 50 ms after the 0x11 bracket
 * commands (first and second-to-last), 5 ms between the
 * 0x02 writes, 2 ms after the trailing slideshow mode.
 * This is the proven pacing (Nov 8, 2026, all-slots
 * build): the colour lands static. Two faster variants
 * both failed on device — back-to-back writes with
 * 2 ms brackets showed no colour at all, and 50 ms
 * brackets with back-to-back chunks also showed no
 * colour — and worse, the failed sequences wedge the
 * panel: live Draw/Photo sends stop working until a
 * full slideshow save resets it. So an interrupted or
 * too-fast 0x02 sequence leaves the panel stuck in
 * write mode. Do not shorten these gaps without a
 * device test from a known-good panel state, and
 * note whether the panel was recovered (slideshow
 * send) between tests: a wedge from an earlier run
 * confounds the next run's result.
 */
async function saveLampCommands(commands: number[][]): Promise<void> {
  for (let i = 0; i < commands.length; i++) {
    await writeCommand(commands[i]);
    if (i === 0 || i === commands.length - 2) {
      await sleep(50);
    } else if (i === commands.length - 1) {
      await sleep(2);
    } else {
      await sleep(5);
    }
  }
}

/**
 * DESTRUCTIVE TEST, Oct 30, 2026: send ONLY the Reset command
 * (BC 00 15 15 55), with no save in the same burst. This is the
 * control the Reset+Save burst lacks: the manual Reset →
 * reconnect → Save test still cycled a blank slot, and the wipe
 * step there was Reset+Save, whose save part may itself have
 * created that blank slot. A Reset-alone run, followed by a
 * reconnect and a plain Save, separates "Reset does not wipe"
 * from "Reset+Save creates the blank slot". If Reset works as
 * labelled, this erases every image currently saved on the
 * panel — do not run it on a set you want to keep unless you
 * can re-save those images afterwards. Manual button only,
 * never auto-send. It deliberately does NOT wait or reconnect:
 * the panel is expected to drop the link on Reset, and the
 * reconnect is a separate manual step, so a drop is observable
 * instead of being papered over by an auto-reconnect.
 */
export async function resetPanelOnly(): Promise<void> {
  await writeCommand(resetCommand());
  await sleep(2);
}

/**
 * Automated Replace save (Oct 30, 2026): the sequence proven
 * manually by the Reset-only test — Reset-alone, reconnect,
 * then save each item in queue order, then slideshow mode.
 * This is deliberately NOT Reset+Save in one burst: that burst
 * was proven to inject a blank slot into the saved set, while
 * Reset-alone followed by a reconnect and a plain Save left a
 * single image with no blank and no flicker past 8 minutes.
 *
 * Steps, in order:
 *   1. Permissions first, BEFORE Reset: if the reconnect scan
 *      cannot run, the set must not be wiped.
 *   2. Reset-only (BC 00 15 15 55). If not connected, this
 *      throws before anything is wiped.
 *   3. Wait for the panel to drop the link (poll shared
 *      connection, up to 5s). If it is still connected, force
 *      a local disconnect so the reconnect scan starts clean.
 *   4. Scan for the display (full 20s scan, strongest first)
 *      and connect. If no display is found, throw with the
 *      panel state spelled out: the set WAS wiped, so the
 *      caller must say so and the user can retry — the queue
 *      itself is still local, so a retry re-wipes and re-saves.
 *   5. 1s settle after connect (assumption, not a snoop
 *      measurement: the manual test had human delay here,
 *      and a panel just back from Reset may not accept stored
 *      blocks instantly).
 *   6. Save each item in order with the proven no-Reset save
 *      (stored checksum blocks, 11 F1/F2 bracket).
 *   7. Slideshow mode (BC 00 12 12 55), the stock save flow's
 *      final command, so the panel cycles the new set.
 *
 * onProgress, if given, receives a stage message for the UI
 * to show during the ~30s this takes (scan alone is 20s).
 * The function itself never touches the local queue: on
 * failure the queue stays intact for a retry.
 */
export async function saveSlideshowReplace(
  items: readonly PixelGrid[],
  onProgress?: (message: string) => void,
): Promise<void> {
  if (items.length === 0) {
    throw new Error('Slideshow queue is empty.');
  }
  const progress = (message: string) => {
    if (onProgress) {
      onProgress(message);
    }
  };
  const granted = await requestAndroidPermissions();
  if (!granted) {
    throw new Error('Bluetooth permissions were not granted.');
  }
  progress('Resetting panel set…');
  await resetPanelOnly();
  progress('Waiting for panel to drop…');
  for (let waited = 0; waited < 5000 && getConnection(); waited += 250) {
    await sleep(250);
  }
  if (getConnection()) {
    await disconnectDisplay();
  }
  progress('Reconnecting… (scanning, ~20s)');
  const found = await scanForDisplay(20);
  if (found.length === 0) {
    throw new Error(
      'No display found after Reset. The panel set was wiped — reconnect and save the queue again.',
    );
  }
  const strongest = [...found].sort(
    (a, b) => (b.rssi ?? -999) - (a.rssi ?? -999),
  )[0];
  await connectToDisplay(
    strongest.id,
    strongest.name ?? 'MI Matrix Display',
  );
  await sleep(1000);
  for (let i = 0; i < items.length; i += 1) {
    progress(`Saving item ${i + 1} of ${items.length}…`);
    await savePictureToDevice(items[i]);
  }
  progress('Setting slideshow mode…');
  await writeCommand(slideshowCommand());
  await sleep(2);
}

/**
 * DESTRUCTIVE TEST: Reset the panel's saved set, then save a single
 * picture (see resetSavedPictureCommands in protocol.ts). No
 * slideshow at the end, mirroring the no-Reset save test, so a
 * hold cannot be credited to slideshow mode. Manual button only,
 * never auto-send. The 100 ms pause after Reset is an assumption,
 * not a snoop measurement: if the panel needs time to clear flash,
 * a 2 ms gap might send the save into a panel still erasing. If
 * this test shows the image but old images still cycle, the first
 * thing to vary is that pause, before concluding Reset is not a
 * wipe — but do not re-run it casually, because every run wipes
 * the set again.
 */
export async function resetAndSavePictureToDevice(
  pixels: PixelGrid,
): Promise<void> {
  const commands = resetSavedPictureCommands(pixels);
  await writeCommand(commands[0]); // Reset
  await sleep(100);
  await writeCommand(commands[1]); // open
  await sleep(2);
  await writeCommand(commands[2]); // init
  await sleep(2);
  for (const block of commands.slice(3, -2)) {
    await writeCommand(block);
    await sleep(25);
  }
  await writeCommand(commands[commands.length - 2]); // end
  await sleep(2);
  await writeCommand(commands[commands.length - 1]); // close
  await sleep(2);
}
