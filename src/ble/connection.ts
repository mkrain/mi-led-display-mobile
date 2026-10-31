/**
 * Single source of truth for the panel connection.
 *
 * The Oct 30, 2026 bug: ConnectScreen kept connection state in its
 * own React useState, while device.ts kept a separate module-level
 * peripheral id, and neither listened for a panel-initiated drop.
 * The result was a banner that could say "Not connected" while
 * sends still worked (module id still set), and, in reverse, a
 * banner that could say "Connected" after the panel had dropped.
 *
 * This module is the one holder. device.ts writes it on connect,
 * disconnect, connect-timeout, and panel-initiated disconnect;
 * ConnectionState.tsx mirrors it into React state above the
 * navigator, so a screen remount cannot lose it; ConnectScreen
 * reads it instead of keeping its own copy. No other file should
 * keep its own "are we connected" boolean.
 *
 * Pure state, no BLE, no React — fully unit-testable.
 */

export type ConnectionInfo = {
  id: string;
  name: string | null;
};

let current: ConnectionInfo | null = null;

type Listener = (connection: ConnectionInfo | null) => void;
const listeners = new Set<Listener>();

export function getConnection(): ConnectionInfo | null {
  return current;
}

export function setConnection(info: ConnectionInfo | null): void {
  if (current?.id === info?.id && current?.name === info?.name) {
    return;
  }
  current = info;
  for (const listener of listeners) {
    listener(current);
  }
}

export function clearConnection(): void {
  setConnection(null);
}

/** Subscribe to connection changes. Returns an unsubscribe function. */
export function subscribeConnection(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
