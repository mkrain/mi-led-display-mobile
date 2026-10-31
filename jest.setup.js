/* global jest */
/**
 * Jest setup: react-native-ble-manager has no native module in the Jest
 * environment, and its constructor throws ("BleManagerModule not found")
 * on import. Stub it so screens that import src/ble/device.ts can render
 * in tests. This does not affect real builds.
 */
jest.mock('react-native-ble-manager', () => ({
  __esModule: true,
  default: {
    start: jest.fn().mockResolvedValue(undefined),
    scan: jest.fn().mockResolvedValue(undefined),
    stopScan: jest.fn().mockResolvedValue(undefined),
    getDiscoveredPeripherals: jest.fn().mockResolvedValue([]),
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    retrieveServices: jest.fn().mockResolvedValue({}),
    getConnectedPeripherals: jest.fn().mockResolvedValue([]),
    onDisconnectPeripheral: jest.fn(() => ({remove: jest.fn()})),
    write: jest.fn().mockResolvedValue(undefined),
    writeWithoutResponse: jest.fn().mockResolvedValue(undefined),
    onDiscoverPeripheral: jest.fn(() => ({remove: jest.fn()})),
    onStopScan: jest.fn(() => ({remove: jest.fn()})),
  },
}));

/**
 * Same idea for react-native-image-crop-picker: its native module is
 * missing in Jest, so stub openPicker. PhotoScreen only calls it from
 * the pick button, which tests do not press.
 */
jest.mock('react-native-image-crop-picker', () => ({
  __esModule: true,
  default: {
    openPicker: jest.fn().mockRejectedValue(new Error('cancelled')),
  },
}));

/**
 * AsyncStorage in Jest: an in-memory stub, so the auto-connect toggle
 * loads as off and saves do not touch real storage.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
  },
}));

/**
 * Community Slider in Jest: its native view is missing, so render a
 * plain View. PhotoScreen only reads its value, which tests do not
 * change.
 */
jest.mock('@react-native-community/slider', () => {
  const {View} = require('react-native');
  return {
    __esModule: true,
    default: View,
  };
});
