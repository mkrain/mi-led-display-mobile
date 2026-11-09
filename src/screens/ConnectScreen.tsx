import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Button, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View} from 'react-native';
import Slider from '@react-native-community/slider';
import {useFocusEffect} from '@react-navigation/native';
import {
  connectToDisplay,
  disconnectDisplay,
  mtuStatusSuffix,
  refreshConnection,
  requestAndroidPermissions,
  scanAllPeripherals,
  scanForDisplay,
  sendBrightness,
  waitForBleReady,
  writeCommand,
} from '../ble/device';
import {powerOffCommand, powerOnCommand} from '../ble/protocol';
import {loadAutoConnect, saveAutoConnect} from '../settings/autoConnect';
import {loadLastDevice} from '../settings/lastDevice';
import {useConnectionState} from '../state/ConnectionState';
import {useBrightnessState} from '../state/BrightnessState';
import {BottomMenu} from '../components/BottomMenu';
import type {Peripheral} from 'react-native-ble-manager';

/** Shorten a UUID for display only — the full id is still used to connect. */
function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

/**
 * Strongest signal first: the display sitting next to the phone should
 * be near the top, instead of buried in an alphabetical list of 29
 * neighbours' gadgets. Ties fall back to name.
 */
function sortDevices(devices: Peripheral[]): Peripheral[] {
  return [...devices].sort((a, b) => {
    const rssiDiff = (b.rssi ?? -999) - (a.rssi ?? -999);
    if (rssiDiff !== 0) {
      return rssiDiff;
    }
    return (a.name ?? '').localeCompare(b.name ?? '');
  });
}

export function ConnectScreen() {
  // Connection state is SHARED, not local (Oct 30, 2026 fix): the
  // banner, the row toggles, and the send paths all read the same
  // ble/connection.ts state via ConnectionState, so a screen
  // remount cannot show "Not connected" while sends still work,
  // and a panel-initiated drop clears the banner. Do NOT add a
  // local connectedId/connectedName useState back here.
  const {connection, refresh} = useConnectionState();
  const connectedId = connection?.id ?? null;
  const connectedName = connection?.name ?? null;
  // MTU lives on the shared connection (Oct 31, 2026 fix), so
  // the banner and the initial status can show it on every
  // mount, not only in the transient status line set right
  // after a connect tap.
  const connectedMtu = connection?.mtu ?? null;
  const bannerMtu =
    Platform.OS === 'android' && connectedId
      ? connectedMtu !== null
        ? ` · MTU ${connectedMtu}`
        : ' · MTU unknown'
      : '';
  // Status is operation feedback, NOT a second connection truth.
  // It is initialised from the shared connection (a fresh Connect
  // instance must not start at "Not connected" while the banner
  // correctly says Connected — the Oct 30 screenshot bug), and
  // the effect below corrects it whenever the two disagree.
  const [status, setStatus] = useState(() =>
    connection
      ? connection.name
        ? `Connected to ${connection.name}.${mtuStatusSuffix(connectedMtu)}`
        : 'Connected.'
      : 'Not connected',
  );
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<Peripheral[]>([]);
  const [scanMode, setScanMode] = useState<'display' | 'all' | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Panel power state, as last commanded from here. The panel offers
  // no query command, so this starts at "on" (a panel that advertises
  // is on) and flips only after a power command succeeds.
  const [powerOn, setPowerOn] = useState(true);
  // Global panel brightness (Nov 9, 2026): one slider for the
  // whole panel, on this tab. Brightness (00 10) is a panel-wide
  // setting — the device test proved it dims a playing slideshow,
  // and the stock app keeps it in Settings — so it lives here,
  // not on the Lamp or Light effect tabs. The send is debounced
  // 300 ms: dragging the slider fires dozens of changes.
  // Nothing sends on mount, and nothing sends while disconnected.
  const {brightness, setBrightness} = useBrightnessState();
  const [brightnessStatus, setBrightnessStatus] = useState<string | null>(
    null,
  );
  const brightnessRef = useRef(brightness);
  const connectionRef = useRef(connection);
  brightnessRef.current = brightness;
  connectionRef.current = connection;
  const brightnessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const brightnessMountedRef = useRef(false);

  useEffect(() => {
    if (!brightnessMountedRef.current) {
      brightnessMountedRef.current = true;
      return;
    }
    if (brightnessTimerRef.current) {
      clearTimeout(brightnessTimerRef.current);
    }
    brightnessTimerRef.current = setTimeout(() => {
      if (!connectionRef.current) {
        setBrightnessStatus(
          'Not connected — brightness sends once connected.',
        );
        return;
      }
      sendBrightness(brightnessRef.current)
        .then(() =>
          setBrightnessStatus(`Brightness ${brightnessRef.current}% sent.`),
        )
        .catch(e =>
          setBrightnessStatus(
            `Brightness send failed: ${e instanceof Error ? e.message : String(e)}`,
          ),
        );
    }, 300);
    return () => {
      if (brightnessTimerRef.current) {
        clearTimeout(brightnessTimerRef.current);
      }
    };
  }, [brightness]);
  // Auto-connect: persisted toggle. When on, a display scan that finds
  // at least one "MI Matrix Display" connects to the first one (the
  // list is strongest-first, so this is the nearest panel) instead of
  // waiting for a row tap. Default off. Ref mirrors state so the async
  // scan callback sees the current value, not a stale closure.
  const [autoConnect, setAutoConnect] = useState(false);
  const autoConnectRef = useRef(false);
  const [autoConnectLoaded, setAutoConnectLoaded] = useState(false);
  // Auto-reconnect on load, once per mount: if the toggle is on
  // when the app loads, fast-reconnect (direct to the last
  // panel, scan only as fallback) without waiting for a tap.
  // Guarded by a ref, so a manual disconnect later does NOT
  // trigger another auto-scan, and a failed scan does not
  // retry in a loop; the user taps Scan to retry.
  const autoReconnectAttemptedRef = useRef(false);
  // Last device we were connected to (Oct 30, 2026): the
  // Disconnect fix showed a standalone row when the device was
  // not in the scanned list, but once you disconnected that row
  // vanished and there was no Connect button left at all — you
  // had to scan again to get one. Remembering the last device
  // lets the screen show a Connect row for it after disconnect,
  // even with an empty scanned list. Since the fast-reconnect
  // build it is also persisted (settings/lastDevice.ts) and is
  // the launch auto-reconnect's direct target. The ROW itself
  // never auto-connects on its own, so a manual disconnect
  // stays disconnected until you tap Connect — the launch
  // auto-reconnect runs once per mount, before any manual
  // disconnect, and does not re-run after one.
  const [lastDevice, setLastDevice] = useState<{
    id: string;
    name: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadAutoConnect().then(value => {
      if (!cancelled) {
        setAutoConnect(value);
        autoConnectRef.current = value;
        setAutoConnectLoaded(true);
      }
    });
    // Load the persisted last device (fast-reconnect, Oct 30,
    // 2026) so its Connect row shows on a fresh launch even
    // before any scan, and so auto-connect has a direct
    // target. It is only a row / a target, never an
    // auto-connect on its own.
    loadLastDevice().then(value => {
      if (!cancelled && value) {
        setLastDevice(value);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-sync with the OS every time Connect comes into focus: the
  // panel may have dropped while the user was on Photo/Draw, and
  // the banner must show that drop instead of a stale Connected.
  // refresh is stable (useCallback in the provider), so this does
  // not loop.
  useFocusEffect(
    useCallback(() => {
      refresh().catch(() => undefined);
    }, [refresh]),
  );

  // Correct the status text whenever it contradicts the shared
  // connection. Only the two connection strings are touched, so
  // scan results, errors, and other operation messages survive.
  useEffect(() => {
    if (connection && status === 'Not connected') {
      setStatus(
        connectedName
          ? `Connected to ${connectedName}.${mtuStatusSuffix(connectedMtu)}`
          : 'Connected.',
      );
    } else if (!connection && status.startsWith('Connected to')) {
      setStatus('Not connected');
    }
  }, [connection, connectedName, connectedMtu, status]);

  // Remember the last connected device while connected, so a
  // Connect row can be shown for it after disconnect even when
  // the scanned list is empty.
  useEffect(() => {
    if (connectedId) {
      setLastDevice({id: connectedId, name: connectedName});
    }
  }, [connectedId, connectedName]);

  // Auto-reconnect on load (see autoReconnectAttemptedRef above).
  // autoReconnect() is a hoisted function declaration below, so
  // calling it here is safe; it handles its own errors via run().
  useEffect(() => {
    if (!autoConnectLoaded || autoReconnectAttemptedRef.current) {
      return;
    }
    autoReconnectAttemptedRef.current = true;
    if (autoConnect && !connectedId) {
      // autoReconnect() handles its own errors via run(), so it
      // resolves even on failure; no floating-promise handling
      // needed.
      autoReconnect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnectLoaded, autoConnect, connectedId]);

  async function onAutoConnectChange(enabled: boolean) {
    setAutoConnect(enabled);
    autoConnectRef.current = enabled;
    await saveAutoConnect(enabled);
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setStatus(label);
    try {
      await fn();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      setStatus(`Error: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Scan for displays and, if auto-connect is on, connect to
   * the strongest one found. This is the inner work shared by
   * the manual Scan button and the auto-reconnect fallback —
   * it does NOT wrap itself in run(), its caller does.
   */
  async function scanAndConnect() {
    const granted = await requestAndroidPermissions();
    if (!granted) {
      throw new Error('Bluetooth permissions were not granted.');
    }
    const found = await scanForDisplay(20);
    const sorted = sortDevices(found);
    setDevices(sorted);
    setScanMode('display');
    if (sorted.length === 0) {
      setStatus(
        'No "MI Matrix Display" found. Make sure it is on and nearby, and not already connected to another app.',
      );
      return;
    }
    // Auto-connect only for the filtered display scan, never for
    // "Show all nearby devices" — there the first device could be
    // any neighbour's gadget, not the panel.
    if (autoConnectRef.current && !connectedId) {
      const first = sorted[0];
      const name = first.name ?? 'Unknown device';
      setStatus(`Auto-connecting to ${name}…`);
      // Shared state updates via device.ts's connection
      // notification — no local setConnectedId here.
      const mtu = await connectToDisplay(first.id, name);
      setStatus(`Auto-connected to ${name}.${mtuStatusSuffix(mtu)}`);
      return;
    }
    setStatus(
      `Found ${found.length} display(s). Tap Connect on one.`,
    );
  }

  async function scan() {
    await run('Scanning…', scanAndConnect);
  }

  /**
   * Fast reconnect (Oct 30, 2026): the stock app's speed, by
   * trying the last panel directly before scanning. Order:
   *   1. Adopt an OS-reported connection, if any — instant,
   *      and it also covers the case where the focus refresh
   *      had not yet run when this effect fired.
   *   2. Wait for Bluetooth to be ready (up to 5s for
   *      'unknown' to clear). The direct try used to burn
   *      its timeout on cold-launch radio warm-up.
   *   3. Direct connect to the persisted last device, with a
   *      SHORT 8s timeout. A panel in range and free connects
   *      in a couple of seconds; 8s is a fast-fail, not a
   *      proven panel timing — if it has not connected by
   *      then it is likely busy (connected to another app),
   *      out of range, or its id is stale, and the scan
   *      below is the right next step anyway. Worst case is
   *      8s + 20s scan + 15s connect ≈ 43s, only slightly
   *      worse than the old scan-first worst case, while
   *      the success case drops from ~20s+ to seconds.
   *   4. Fall back to the full scan, as before, with the
   *      status set to "Direct reconnect failed, scanning…"
   *      so a fallback is visible instead of looking like a
   *      slow direct try. A direct failure is otherwise
   *      swallowed on purpose: the scan is the fallback,
   *      not a second error to report.
   * Manual Scan is untouched — it still scans and lists.
   */
  async function autoReconnect() {
    await run('Reconnecting…', async () => {
      const adopted = await refreshConnection().catch(() => null);
      if (adopted) {
        setStatus(
          adopted.name
            ? `Connected to ${adopted.name}.`
            : 'Connected.',
        );
        return;
      }
      // Wait for Bluetooth to be ready BEFORE the direct try
      // (Oct 30, 2026): on a cold launch CoreBluetooth starts
      // 'unknown', and the direct try used to burn its 8s
      // timeout on that warm-up while the scan path waited.
      // If Bluetooth is not 'on' after waiting, skip the
      // direct try entirely — the scan below will throw the
      // clear "Bluetooth is off/unauthorized" error instead
      // of a misleading direct-connect failure.
      const bleState = await waitForBleReady().catch(() => 'unknown');
      const last = bleState === 'on' ? await loadLastDevice() : null;
      if (last) {
        const lastName = last.name ?? 'MI Matrix Display';
        setStatus(`Reconnecting to ${lastName}…`);
        try {
          const mtu = await connectToDisplay(last.id, last.name, 8000);
          setStatus(`Reconnected to ${lastName}.${mtuStatusSuffix(mtu)}`);
          return;
        } catch {
          // Fall through to the scan below, but SAY so: the
          // old code left the status at "Reconnecting to …"
          // for the whole 20s scan, so a scan fallback looked
          // like a slow direct try.
          setStatus('Direct reconnect failed, scanning…');
        }
      }
      await scanAndConnect();
    });
  }

  async function scanAll() {
    await run('Scanning all devices…', async () => {
      const found = await scanAllPeripherals(20);
      setDevices(sortDevices(found));
      setScanMode('all');
      setStatus(
        found.length > 0
          ? `Found ${found.length} nearby devices, strongest first. The display may be an Unknown device — try the strongest unknown ones first. Tapping the wrong device just fails in 15 seconds.`
          : 'No Bluetooth devices found at all. Check Bluetooth is on and the display is powered on.',
      );
    });
  }

  /**
   * One toggle per device row: Connect when disconnected, Disconnect
   * when connected. The standalone Disconnect/Connect sections above
   * reuse this same toggle for a device that is not in the scanned
   * list, so there is always exactly one toggle per device.
   */
  async function toggleConnect(device: Peripheral) {
    const name = device.name ?? 'Unknown device';
    if (connectedId === device.id) {
      await run('Disconnecting…', async () => {
        await disconnectDisplay();
        setStatus('Disconnected.');
      });
      return;
    }
    await run(`Connecting to ${name}…`, async () => {
      if (connectedId) {
        await disconnectDisplay();
      }
      const mtu = await connectToDisplay(device.id, name);
      setStatus(`Connected to ${name}.${mtuStatusSuffix(mtu)}`);
    });
  }

  async function togglePower() {
    const next = !powerOn;
    await run(next ? 'Powering on…' : 'Powering off…', async () => {
      await writeCommand(next ? powerOnCommand() : powerOffCommand());
      setPowerOn(next);
      setStatus(next ? 'Power on sent.' : 'Power off sent.');
    });
  }

  return (
    <View style={styles.screen}>
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>MI Matrix Display</Text>
      <View style={[styles.banner, connectedId ? styles.bannerConnected : styles.bannerDisconnected]}>
        <Text style={[styles.bannerText, connectedId ? styles.bannerTextConnected : styles.bannerTextDisconnected]}>
          {connectedId
            ? connectedName
              ? `● Connected to ${connectedName}${bannerMtu}`
              : `● Connected${bannerMtu}`
            : '○ Not connected'}
        </Text>
      </View>
      <Text style={styles.status}>{status}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {/* Standalone Disconnect, Oct 30, 2026: the Disconnect toggle
          used to live only in a scanned device row, so if you were
          connected without a scanned list in this instance — e.g.
          auto-reconnect on load, or an OS-adopted connection, or a
          fresh Connect instance before any scan — the banner said
          Connected but there was no Disconnect button anywhere.
          This section shows whenever connectedId is set and the
          scanned list does not already contain that device, so
          Disconnect is always reachable. When the device IS in the
          list, its row toggle is the Disconnect button and this
          section stays hidden to avoid two of them. */}
      {connectedId && !devices.some(device => device.id === connectedId) ? (
        <View style={[styles.row, styles.rowConnected]}>
          <View style={styles.rowText}>
            <Text style={styles.deviceName}>
              {connectedName ?? 'MI Matrix Display'}
            </Text>
            <Text style={styles.deviceDetail}>ID {shortId(connectedId)}</Text>
          </View>
          <TouchableOpacity
            style={[styles.toggle, styles.toggleConnected]}
            onPress={() =>
              run('Disconnecting…', async () => {
                await disconnectDisplay();
                setStatus('Disconnected.');
              })
            }
            disabled={busy}
          >
            <Text style={[styles.toggleText, styles.toggleTextConnected]}>
              Disconnect
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {/* Standalone Connect row, Oct 30, 2026: the mirror image
          of the Disconnect section above. After disconnecting a
          device that was never in the scanned list, the Disconnect
          section disappears and, without this, no Connect button
          remains — you would have to scan again. This row shows
          the last connected device with a Connect button. It is
          hidden when the device is already in the scanned list
          (its row toggle is the Connect button there), and it
          never auto-connects: tapping it is what connects. */}
      {!connectedId &&
      lastDevice &&
      !devices.some(device => device.id === lastDevice.id) ? (
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.deviceName}>
              {lastDevice.name ?? 'MI Matrix Display'}
            </Text>
            <Text style={styles.deviceDetail}>
              ID {shortId(lastDevice.id)}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.toggle, styles.toggleDisconnected]}
            onPress={() =>
              toggleConnect({
                id: lastDevice.id,
                name: lastDevice.name,
              } as Peripheral)
            }
            disabled={busy}
          >
            <Text style={[styles.toggleText, styles.toggleTextDisconnected]}>
              Connect
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <View style={styles.button}>
        <Button title={busy ? 'Working…' : 'Scan for display'} onPress={scan} disabled={busy} />
      </View>
      <View style={styles.button}>
        <Button title={busy ? 'Working…' : 'Show all nearby devices'} onPress={scanAll} disabled={busy} />
      </View>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>
          Auto-connect to first panel found
        </Text>
        <Switch
          value={autoConnect}
          onValueChange={onAutoConnectChange}
          disabled={busy}
        />
      </View>
      <Text style={styles.note}>
        When auto-connect is on, the app first tries the last
        panel it connected to (a few seconds), and only scans
        if that direct try fails. “Scan for display” itself
        still scans, then connects to the first “MI Matrix
        Display” found (strongest signal first) instead of
        waiting for a tap. The setting is saved and restored on
        next launch. It does not apply to “Show all nearby
        devices”.
      </Text>
      {devices.length > 0 ? (
        <Text style={styles.section}>
          {scanMode === 'all'
            ? 'Nearby devices (strongest first)'
            : 'Displays found'}
        </Text>
      ) : null}
      {devices.map(device => {
        const isConnected = connectedId === device.id;
        return (
          <View key={device.id} style={[styles.row, isConnected && styles.rowConnected]}>
            <View style={styles.rowText}>
              <Text style={styles.deviceName}>{device.name ?? 'Unknown device'}</Text>
              <Text style={styles.deviceDetail}>
                {typeof device.rssi === 'number' ? `${device.rssi} dBm · ` : ''}
                ID {shortId(device.id)}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.toggle, isConnected ? styles.toggleConnected : styles.toggleDisconnected]}
              onPress={() => toggleConnect(device)}
              disabled={busy}
            >
              <Text style={[styles.toggleText, isConnected ? styles.toggleTextConnected : styles.toggleTextDisconnected]}>
                {isConnected ? 'Disconnect' : 'Connect'}
              </Text>
            </TouchableOpacity>
          </View>
        );
      })}
      <View style={styles.powerRow}>
        <View style={styles.powerLeft}>
          <Text style={[styles.powerIcon, powerOn ? styles.powerIconOn : styles.powerIconOff]}>
            ⏻
          </Text>
          <View>
            <Text style={styles.powerLabel}>Power</Text>
            <Text style={styles.deviceDetail}>
              {powerOn ? 'Panel is on' : 'Panel is off'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.toggle, powerOn ? styles.toggleConnected : styles.togglePowerOff]}
          onPress={togglePower}
          disabled={busy || !connectedId}
        >
          <Text style={styles.toggleText}>
            {powerOn ? 'On' : 'Off'}
          </Text>
        </TouchableOpacity>
      </View>
      {/* Global panel brightness (Nov 9, 2026): one slider
          for the whole panel. It dims everything the panel
          shows — lamp, effects, and slideshows — and the
          panel keeps it until you change it. */}
      <View style={styles.brightnessRow}>
        <Text style={styles.brightnessLabel}>☀ Brightness</Text>
        <Slider
          style={styles.brightnessSlider}
          minimumValue={0}
          maximumValue={100}
          step={1}
          value={brightness}
          onValueChange={value => setBrightness(Math.round(value))}
          disabled={!connectedId}
          accessibilityLabel="Panel brightness"
        />
        <Text style={styles.brightnessValue}>{brightness}%</Text>
      </View>
      {brightnessStatus ? (
        <Text style={styles.brightnessStatus}>{brightnessStatus}</Text>
      ) : null}
      <Text style={styles.note}>
        Note: power, draw, and photo sends need a live connection first. If a
        send fails, check that the display is on and in range.
      </Text>
    </ScrollView>
    <BottomMenu />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1},
  container: {padding: 16},
  powerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    marginTop: 16,
  },
  powerLeft: {flexDirection: 'row', alignItems: 'center', gap: 10},
  powerIcon: {fontSize: 28, fontWeight: '900'},
  powerIconOn: {color: '#1a7a2e'},
  powerIconOff: {color: '#888'},
  powerLabel: {fontSize: 16, fontWeight: '600'},
  brightnessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    marginTop: 16,
  },
  brightnessLabel: {fontSize: 16, fontWeight: '600', width: 110},
  brightnessSlider: {flex: 1},
  brightnessValue: {fontSize: 16, width: 48, textAlign: 'right'},
  brightnessStatus: {fontSize: 13, color: '#555', textAlign: 'center'},
  title: {fontSize: 22, fontWeight: 'bold', marginBottom: 8},
  banner: {padding: 10, borderRadius: 8, marginBottom: 8},
  bannerConnected: {backgroundColor: '#d6f5dd'},
  bannerDisconnected: {backgroundColor: '#eee'},
  bannerText: {fontSize: 16, fontWeight: '600'},
  bannerTextConnected: {color: '#1a7a2e'},
  bannerTextDisconnected: {color: '#555'},
  status: {fontSize: 16, marginBottom: 8},
  error: {color: '#c00', marginBottom: 8},
  button: {marginVertical: 4},
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 8,
  },
  switchLabel: {fontSize: 16, flex: 1, marginRight: 8},
  section: {fontSize: 16, fontWeight: 'bold', marginTop: 16, marginBottom: 4},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    borderRadius: 8,
  },
  rowConnected: {backgroundColor: '#d6f5dd'},
  rowText: {flex: 1, marginRight: 8},
  deviceName: {fontSize: 16, fontWeight: '600'},
  deviceDetail: {fontSize: 13, color: '#555'},
  toggle: {paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20},
  toggleConnected: {backgroundColor: '#1a7a2e'},
  toggleDisconnected: {backgroundColor: '#007aff'},
  togglePowerOff: {backgroundColor: '#888'},
  toggleText: {fontSize: 15, fontWeight: '600'},
  toggleTextConnected: {color: '#fff'},
  toggleTextDisconnected: {color: '#fff'},
  note: {marginTop: 16, color: '#555'},
});
