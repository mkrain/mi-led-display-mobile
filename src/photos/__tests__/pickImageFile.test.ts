import ImageCropPicker from 'react-native-image-crop-picker';
import {pickImageFile} from '../pickImageFile';

const mockOpenPicker = ImageCropPicker.openPicker as jest.Mock;

describe('pickImageFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns the picked file, mime and base64', async () => {
    mockOpenPicker.mockResolvedValue({
      mime: 'image/png',
      data: 'aGVsbG8=',
      filename: 'sheet.png',
    });
    const picked = await pickImageFile();
    expect(picked?.mime).toBe('image/png');
    expect(picked?.base64).toBe('aGVsbG8=');
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
    await expect(pickImageFile()).resolves.toBeNull();
  });

  test('JPEG is accepted, other mimes and missing data throw plainly', async () => {
    mockOpenPicker.mockResolvedValue({
      mime: 'image/jpeg',
      data: 'aGVsbG8=',
    });
    await expect(pickImageFile()).resolves.toMatchObject({
      mime: 'image/jpeg',
    });

    mockOpenPicker.mockResolvedValue({
      mime: 'image/heic',
      data: 'aGVsbG8=',
    });
    await expect(pickImageFile()).rejects.toThrow(
      'Picked file is image/heic; only PNG and JPEG',
    );

    mockOpenPicker.mockResolvedValue({mime: 'image/png'});
    await expect(pickImageFile()).rejects.toThrow('no image data');
  });
});
