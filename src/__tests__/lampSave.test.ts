import BleManager from 'react-native-ble-manager';
import {clearConnection, setConnection} from '../ble/connection';
import {
  saveLampColor,
  saveLampColorAllSlots,
  saveStaticPictureToDevice,
} from '../ble/device';
import {solidGrid} from '../lamp/lamp';

const writes = BleManager.writeWithoutResponse as jest.Mock;

describe('saveStaticPictureToDevice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearConnection();
    setConnection({id: 'abc', name: 'MI Matrix Display', mtu: 512});
  });

  afterEach(() => {
    clearConnection();
  });

  test('saves open/init/blocks/end/close/slideshow, with no Reset', async () => {
    await saveStaticPictureToDevice(solidGrid([255, 0, 0]));
    const sent: number[][] = writes.mock.calls.map(call => call[3] as number[]);
    // open, init, 8 stored blocks, end, close, slideshow mode.
    expect(sent).toHaveLength(13);
    expect(sent[0]).toEqual([0xbc, 0x00, 0x11, 0xf1, 0x03, 0x55]);
    expect(sent[1]).toEqual([0xbc, 0x0f, 0xf1, 0x08, 0x08, 0x55]);
    for (let i = 0; i < 8; i += 1) {
      expect(sent[2 + i][0]).toBe(0xbc);
      expect(sent[2 + i][1]).toBe(0x0f);
      expect(sent[2 + i][2]).toBe(i + 1);
      expect(sent[2 + i]).toHaveLength(101);
      expect(sent[2 + i][100]).toBe(0x55);
    }
    expect(sent[10]).toEqual([0xbc, 0x0f, 0xf2, 0x08, 0x09, 0x55]);
    expect(sent[11]).toEqual([0xbc, 0x00, 0x11, 0xf2, 0x04, 0x55]);
    expect(sent[12]).toEqual([0xbc, 0x00, 0x12, 0x12, 0x55]);
    // The whole point of the fast path: no Reset (BC 00 15
    // 15 55) anywhere, so the link never drops and there
    // is no reconnect scan.
    expect(
      sent.some(
        bytes =>
          bytes.length === 5 &&
          bytes[1] === 0x00 &&
          bytes[2] === 0x15,
      ),
    ).toBe(false);
  });
});

describe('saveLampColor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearConnection();
    setConnection({id: 'abc', name: 'MI Matrix Display', mtu: 512});
  });

  afterEach(() => {
    clearConnection();
  });

  test('slot save: 14 writes, index 1 of 1, no Reset, no 0x0F chunks', async () => {
    await saveLampColor(solidGrid([255, 0, 0]));
    const sent: number[][] = writes.mock.calls.map(call => call[3] as number[]);
    expect(sent).toHaveLength(14);
    expect(sent[0]).toEqual([0xbc, 0x00, 0x11, 0xf1, 0x03, 0x55]);
    expect(sent[1]).toEqual([0xbc, 0x02, 0xf1, 0x01, 0xf4, 0x55]);
    for (let i = 0; i < 8; i += 1) {
      expect(sent[2 + i][0]).toBe(0xbc);
      expect(sent[2 + i][1]).toBe(0x02);
      expect(sent[2 + i][2]).toBe(1);
      expect(sent[2 + i][3]).toBe(i + 1);
      expect(sent[2 + i]).toHaveLength(102);
      expect(sent[2 + i][101]).toBe(0x55);
    }
    expect(sent[10]).toEqual([0xbc, 0x02, 0x07, 0x3c, 0x45, 0x55]);
    expect(sent[11]).toEqual([0xbc, 0x02, 0xf2, 0x01, 0xf5, 0x55]);
    expect(sent[12]).toEqual([0xbc, 0x00, 0x11, 0xf2, 0x04, 0x55]);
    expect(sent[13]).toEqual([0xbc, 0x00, 0x12, 0x12, 0x55]);
    // No Reset anywhere, and no 0x0F live/stored chunks:
    // the slot save must not be the append path in disguise.
    const hex = sent
      .map(bytes => bytes.map(b => b.toString(16).padStart(2, '0')).join(''))
      .join(' ');
    expect(hex).not.toContain('bc00151555');
    expect(sent.some(bytes => bytes[1] === 0x0f)).toBe(false);
  });
});

describe('saveLampColorAllSlots', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearConnection();
    setConnection({id: 'abc', name: 'MI Matrix Display', mtu: 512});
  });

  afterEach(() => {
    clearConnection();
  });

  test('all slots: 70 writes, count 8, indices 1-8, no Reset, no 0x0F', async () => {
    await saveLampColorAllSlots(solidGrid([255, 0, 0]));
    const sent: number[][] = writes.mock.calls.map(call => call[3] as number[]);
    expect(sent).toHaveLength(70);
    expect(sent[0]).toEqual([0xbc, 0x00, 0x11, 0xf1, 0x03, 0x55]);
    expect(sent[1]).toEqual([0xbc, 0x02, 0xf1, 0x08, 0xfb, 0x55]);
    for (let image = 1; image <= 8; image++) {
      for (let b = 0; b < 8; b++) {
        const chunk = sent[2 + (image - 1) * 8 + b];
        expect(chunk[0]).toBe(0xbc);
        expect(chunk[1]).toBe(0x02);
        expect(chunk[2]).toBe(image);
        expect(chunk[3]).toBe(b + 1);
        expect(chunk).toHaveLength(102);
        expect(chunk[101]).toBe(0x55);
      }
    }
    expect(sent[66]).toEqual([0xbc, 0x02, 0x07, 0x3c, 0x45, 0x55]);
    expect(sent[67]).toEqual([0xbc, 0x02, 0xf2, 0x08, 0xfc, 0x55]);
    expect(sent[68]).toEqual([0xbc, 0x00, 0x11, 0xf2, 0x04, 0x55]);
    expect(sent[69]).toEqual([0xbc, 0x00, 0x12, 0x12, 0x55]);
    const hex = sent
      .map(bytes => bytes.map(b => b.toString(16).padStart(2, '0')).join(''))
      .join(' ');
    expect(hex).not.toContain('bc00151555');
    expect(sent.some(bytes => bytes[1] === 0x0f)).toBe(false);
  });
});
