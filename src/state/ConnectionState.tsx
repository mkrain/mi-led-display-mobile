import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  getConnection,
  subscribeConnection,
  type ConnectionInfo,
} from '../ble/connection';
import {refreshConnection} from '../ble/device';

/**
 * Connection state, held above the navigator instead of inside
 * ConnectScreen. That is the Oct 30, 2026 fix: ConnectScreen kept
 * its own useState for the connected id, so a remount (or any
 * path that recreated the screen) showed "Not connected" while
 * sends still worked via device.ts's separate module id — and a
 * panel-initiated drop never updated the banner at all.
 *
 * This provider mirrors the single source of truth in
 * ble/connection.ts (written by device.ts on connect, disconnect,
 * timeout, and panel-initiated disconnect) and re-syncs with the
 * OS on mount, so it survives screen remounts. ConnectScreen
 * reads it; it must not keep its own connected id.
 */
export type ConnectionState = {
  connection: ConnectionInfo | null;
  refresh: () => Promise<void>;
};

const ConnectionStateContext = createContext<ConnectionState | null>(null);

export function ConnectionStateProvider({children}: {children: ReactNode}) {
  const [connection, setConnectionState] = useState<ConnectionInfo | null>(
    () => getConnection(),
  );

  useEffect(() => {
    const unsubscribe = subscribeConnection(setConnectionState);
    // Sync with the OS once on mount: covers a remount where the
    // UI state was lost but the OS link persists, and an app
    // restart where the OS still reports the panel as connected.
    // Best-effort — refreshConnection never throws on an OS error.
    refreshConnection().catch(() => undefined);
    return unsubscribe;
  }, []);

  const refresh = useCallback(async () => {
    await refreshConnection().catch(() => undefined);
  }, []);

  return (
    <ConnectionStateContext.Provider value={{connection, refresh}}>
      {children}
    </ConnectionStateContext.Provider>
  );
}

export function useConnectionState(): ConnectionState {
  const state = useContext(ConnectionStateContext);
  if (!state) {
    throw new Error(
      'useConnectionState must be used inside ConnectionStateProvider',
    );
  }
  return state;
}
