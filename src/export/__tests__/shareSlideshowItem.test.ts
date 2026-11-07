import Share from 'react-native-share';
import {writeFile} from '@dr.pogodin/react-native-fs';
import base64js from 'base64-js';
import {shareFileName, shareImage, shareSlideshowItem} from '../shareSlideshowItem';
import type {RGB} from '../../conversion/convert';

const mockOpen = Share.open as jest.Mock;
const mockWriteFile = writeFile as jest.Mock;

function blackPixels(): RGB[] {
  return Array.from({length: 256}, () => [0, 0, 0] as RGB);
}

describe('shareSlideshowItem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOpen.mockResolvedValue({success: true, message: 'ok'});
    mockWriteFile.mockResolvedValue(undefined);
  });

  test('filename is sanitised and keeps .png', () => {
    expect(shareFileName('Smeargle Photo!')).toBe(
      'mi-led-smeargle-photo.png',
    );
    expect(shareFileName('  ')).toBe('mi-led-image.png');
    expect(shareFileName('Demo image')).toBe('mi-led-demo-image.png');
  });

  test('writes a PNG to the cache and opens the sheet with it', async () => {
    const outcome = await shareSlideshowItem({
      label: 'Smeargle Photo',
      pixels: blackPixels(),
    });
    expect(outcome).toBe('shared');
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const [path, data, encoding] = mockWriteFile.mock.calls[0];
    expect(path).toBe('/mock-cache/mi-led-smeargle-photo.png');
    expect(encoding).toBe('base64');
    // The written content is base64; decode it and check
    // the PNG signature on the resulting bytes.
    const bytes = base64js.toByteArray(data as string);
    expect(Array.from(bytes.subarray(0, 8))).toEqual([
      137, 80, 78, 71, 13, 10, 26, 10,
    ]);
    expect(mockOpen).toHaveBeenCalledWith({
      url: 'file:///mock-cache/mi-led-smeargle-photo.png',
      type: 'image/png',
      filename: 'mi-led-smeargle-photo.png',
    });
  });

  test('a dismissed sheet is a cancel, not an error', async () => {
    mockOpen.mockResolvedValue({
      success: false,
      message: 'ok',
      dismissedAction: true,
    });
    const outcome = await shareSlideshowItem({
      label: 'Demo image',
      pixels: blackPixels(),
    });
    expect(outcome).toBe('cancelled');
  });

  test('shareImage is the same share path, usable from Draw and Photo', async () => {
    // Draw shares its grid as "Graffiti", Photo shares its
    // converted preview under the photo filename — both go
    // through the same helper, with no slideshow involved.
    const outcome = await shareImage({
      label: 'Graffiti',
      pixels: blackPixels(),
    });
    expect(outcome).toBe('shared');
    expect(mockWriteFile).toHaveBeenCalledWith(
      '/mock-cache/mi-led-graffiti.png',
      expect.any(String),
      'base64',
    );
    expect(shareSlideshowItem).toBe(shareImage);
  });

  test('a cancel thrown as an error is a cancel, other errors throw', async () => {
    mockOpen.mockRejectedValue(new Error('User did not share'));
    await expect(
      shareSlideshowItem({label: 'Demo image', pixels: blackPixels()}),
    ).resolves.toBe('cancelled');

    mockOpen.mockRejectedValue(new Error('No app can open this'));
    await expect(
      shareSlideshowItem({label: 'Demo image', pixels: blackPixels()}),
    ).rejects.toThrow('No app can open this');
  });
});
