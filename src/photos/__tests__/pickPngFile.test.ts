import ImageCropPicker from 'react-native-image-crop-picker';
import {pickPngFile} from '../pickPngFile';

const mockOpenPicker = ImageCropPicker.openPicker as jest.Mock;

describe('pickPngFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns the picked bytes, byte-identical', async () => {
    mockOpenPicker.mockResolvedValue({
      mime: 'image/png',
      data: 'aGVsbG8=',
      filename: 'sheet.png',
    });
    const picked = await pickPngFile();
    expect(picked?.bytes).toEqual(new Uint8Array([104, 101, 108, 108, 111]));
    expect(picked?.fileName).toBe('sheet.png');
    expect(mockOpenPicker).toHaveBeenCalledWith({
      mediaType: 'photo',
      cropping: false,
      multiple: false,
      includeBase64: true,
    });
  });

  test('a cancelled pick is null, not an error', async () => {
    mockOpenPicker.mockRejectedValue(new Error('cancelled'));
    await expect(pickPngFile()).resolves.toBeNull();
  });

  test('a non-PNG mime and missing data throw plainly', async () => {
    mockOpenPicker.mockResolvedValue({
      mime: 'image/jpeg',
      data: 'aGVsbG8=',
    });
    await expect(pickPngFile()).rejects.toThrow(
      'Picked file is image/jpeg, not a PNG',
    );

    mockOpenPicker.mockResolvedValue({mime: 'image/png'});
    await expect(pickPngFile()).rejects.toThrow('no image data');
  });
});
