import ImageCropPicker from 'react-native-image-crop-picker';
import {pickImageFile} from '../pickImageFile';

const mockOpenPicker = ImageCropPicker.openPicker as jest.Mock;

describe('pickImageFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('opens the multi picker and takes the first selection', async () => {
    mockOpenPicker.mockResolvedValue([
      {
        mime: 'image/png',
        data: 'aGVsbG8=',
        filename: 'sheet.png',
      },
      {
        mime: 'image/jpeg',
        data: 'd29ybGQ=',
        filename: 'other.jpg',
      },
    ]);
    const picked = await pickImageFile();
    expect(picked?.mime).toBe('image/png');
    expect(picked?.base64).toBe('aGVsbG8=');
    expect(picked?.fileName).toBe('sheet.png');
    // multiple:true is deliberate: the single-pick
    // path always JPEG-compresses, the multi path
    // returns the original bytes untouched.
    expect(mockOpenPicker).toHaveBeenCalledWith({
      mediaType: 'photo',
      cropping: false,
      multiple: true,
      includeBase64: true,
    });
  });

  test('an empty selection is null, not an error', async () => {
    mockOpenPicker.mockResolvedValue([]);
    await expect(pickImageFile()).resolves.toBeNull();
  });

  test('a cancelled pick is null, not an error', async () => {
    mockOpenPicker.mockRejectedValue(new Error('cancelled'));
    await expect(pickImageFile()).resolves.toBeNull();
  });

  test('JPEG is accepted, other mimes and missing data throw plainly', async () => {
    mockOpenPicker.mockResolvedValue([
      {
        mime: 'image/jpeg',
        data: 'aGVsbG8=',
      },
    ]);
    await expect(pickImageFile()).resolves.toMatchObject({
      mime: 'image/jpeg',
    });

    mockOpenPicker.mockResolvedValue([
      {
        mime: 'image/heic',
        data: 'aGVsbG8=',
      },
    ]);
    await expect(pickImageFile()).rejects.toThrow(
      'Picked file is image/heic; only PNG and JPEG',
    );

    mockOpenPicker.mockResolvedValue([{mime: 'image/png'}]);
    await expect(pickImageFile()).rejects.toThrow('no image data');
  });
});
