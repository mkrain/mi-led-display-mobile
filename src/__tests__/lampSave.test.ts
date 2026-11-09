import BleManager from 'react-native-ble-manager';
import {clearConnection, setConnection} from '../ble/connection';
import {
  selectEffect,
  sendEffectBrightness,
  sendEffectPalette,
  sendEffectSpeed,
  sendLampColour,
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

describe('sendLampColour', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearConnection();
    setConnection({id: 'abc', name: 'MI Matrix Display', mtu: 512});
  });

  afterEach(() => {
    clearConnection();
  });

  test('lamp mode + one colour write + brightness, no 0x0F/0x02/0x11', async () => {
    await sendLampColour([255, 0, 0], 29);
    const sent: number[][] = writes.mock.calls.map(call => call[3] as number[]);
    expect(sent).toHaveLength(3);
    expect(sent[0]).toEqual([0xbc, 0x00, 0x0b, 0x0b, 0x55]);
    expect(sent[1]).toEqual([0xbc, 0x0b, 0xff, 0x00, 0x00, 0x0a, 0x55]);
    expect(sent[2]).toEqual([0xbc, 0x00, 0x10, 0x1d, 0x2d, 0x55]);
    // No frames, no slideshow, no Reset: the colour is
    // one 7-byte write, not a 70-write save.
    expect(sent.some(bytes => bytes[1] === 0x0f)).toBe(false);
    expect(sent.some(bytes => bytes[1] === 0x02)).toBe(false);
    expect(sent.some(bytes => bytes[1] === 0x11)).toBe(false);
  });
});

describe('selectEffect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearConnection();
    setConnection({id: 'abc', name: 'MI Matrix Display', mtu: 512});
  });

  afterEach(() => {
    clearConnection();
  });

  test('effect 1: mode + select + palette + speed + brightness', async () => {
    const palette: [number, number, number][] = [
      [255, 0, 0],
      [255, 162, 0],
      [255, 255, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 0, 255],
      [255, 255, 255],
    ];
    await selectEffect(1, palette, 50, 100);
    const sent: number[][] = writes.mock.calls.map(call => call[3] as number[]);
    expect(sent).toHaveLength(5);
    expect(sent[0]).toEqual([0xbc, 0x00, 0x0a, 0x0a, 0x55]);
    expect(sent[1]).toEqual([0xbc, 0x0a, 0x01, 0x01, 0x0c, 0x55]);
    expect(sent[2]).toEqual([
      0xbc, 0x0a, 0x02, 0x07,
      0xff, 0x00, 0x00, 0xff, 0xa2, 0x00, 0xff, 0xff, 0x00,
      0x00, 0xff, 0x00, 0x00, 0x00, 0xff, 0xff, 0x00, 0xff,
      0xff, 0xff, 0xff, 0xaa, 0x55,
    ]);
    expect(sent[3]).toEqual([0xbc, 0x0a, 0x07, 0x32, 0x43, 0x55]);
    expect(sent[4]).toEqual([0xbc, 0x00, 0x10, 0x64, 0x74, 0x55]);
    expect(sent.some(bytes => bytes[1] === 0x0f)).toBe(false);
    expect(sent.some(bytes => bytes[1] === 0x02)).toBe(false);
    expect(sent.some(bytes => bytes[1] === 0x11)).toBe(false);
  });
});

describe('sendEffectPalette / sendEffectSpeed / sendEffectBrightness', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearConnection();
    setConnection({id: 'abc', name: 'MI Matrix Display', mtu: 512});
  });

  afterEach(() => {
    clearConnection();
  });

  test('palette update: mode + palette only, no re-select', async () => {
    await sendEffectPalette([[255, 0, 0], [0, 0, 255]]);
    const sent: number[][] = writes.mock.calls.map(call => call[3] as number[]);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toEqual([0xbc, 0x00, 0x0a, 0x0a, 0x55]);
    // 0A+02+02 = 0E; +FF (red) = 10D; +FF (blue) = 20C -> 0C.
    expect(sent[1]).toEqual([
      0xbc, 0x0a, 0x02, 0x02, 0xff, 0x00, 0x00, 0x00, 0x00, 0xff, 0x0c, 0x55,
    ]);
    // No effect select: re-selecting on every palette
    // drag could restart the animation.
    expect(sent.some(bytes => bytes[1] === 0x0a && bytes[2] === 0x01)).toBe(false);
  });

  test('speed update: one write', async () => {
    await sendEffectSpeed(81);
    const sent: number[][] = writes.mock.calls.map(call => call[3] as number[]);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual([0xbc, 0x0a, 0x07, 0x51, 0x62, 0x55]);
  });

  test('brightness update: one write', async () => {
    await sendEffectBrightness(48);
    const sent: number[][] = writes.mock.calls.map(call => call[3] as number[]);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual([0xbc, 0x00, 0x10, 0x30, 0x40, 0x55]);
  });
});
