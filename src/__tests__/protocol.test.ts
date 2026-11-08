import {
  bytesToHex,
  fullPictureBlockCommand,
  fullPictureCommands,
  graffitiInitCommands,
  lampAllSlotsCommands,
  lampSlotSaveCommands,
  powerOffCommand,
  powerOnCommand,
  singlePixelCommand,
  resetCommand,
  resetSavedPictureCommands,
  savedPictureCommands,
  slideShowImageWriteChunkCommand,
  slideShowImageWriteDisableCommand,
  slideShowImageWriteEnableCommand,
  slideShowMarkerCommand,
  slideshowCommand,
  storedPictureBlockCommand,
  storedPictureChecksum,
  type RGB,
} from '../ble/protocol';

describe('protocol bytes', () => {
  test('power on/off', () => {
    expect(bytesToHex(powerOnCommand())).toBe('bcff010055');
    expect(bytesToHex(powerOffCommand())).toBe('bcff00ff55');
  });

  test('graffiti init and slideshow', () => {
    expect(graffitiInitCommands().map(bytesToHex)).toEqual([
      'bc00010155',
      'bc000d0d55',
    ]);
    expect(bytesToHex(slideshowCommand())).toBe('bc00121255');
  });

  test('single pixel, red top-left example from protocol.txt', () => {
    // BC 01 01 00 00 FF 00 00 FF 55 — PP = 0, QQ = 0xFF (PP - 1 mod 256).
    expect(bytesToHex(singlePixelCommand(0, 255, 0, 0))).toBe(
      'bc01010000ff0000ff55',
    );
    // PP = 1 gives QQ = 0. See the discrepancy comment in protocol.ts.
    expect(bytesToHex(singlePixelCommand(1, 255, 0, 0))).toBe(
      'bc01010001ff00000055',
    );
  });

  test('full picture: 10 commands, 8 blocks of 100 bytes', () => {
    const pixels: RGB[] = Array.from({length: 256}, () => [0, 0, 0] as RGB);
    pixels[0] = [255, 0, 0];
    pixels[255] = [0, 0, 255];
    const commands = fullPictureCommands(pixels);
    expect(commands).toHaveLength(10);
    expect(bytesToHex(commands[0])).toBe('bc0ff1080855');
    expect(bytesToHex(commands[9])).toBe('bc0ff2080955');
    for (let b = 0; b < 8; b++) {
      const block = commands[1 + b];
      expect(block).toHaveLength(100);
      expect(block[0]).toBe(0xbc);
      expect(block[1]).toBe(0x0f);
      expect(block[2]).toBe(b + 1);
      expect(block[99]).toBe(0x55);
    }
    // First block starts with the red pixel, last block ends with blue.
    expect(commands[1].slice(3, 6)).toEqual([255, 0, 0]);
    expect(commands[8].slice(96, 99)).toEqual([0, 0, 255]);
  });

  test('full picture block validation', () => {
    expect(() =>
      fullPictureBlockCommand(0, Array.from({length: 31}, () => [0, 0, 0] as RGB)),
    ).toThrow();
    expect(() =>
      fullPictureCommands(Array.from({length: 255}, () => [0, 0, 0] as RGB)),
    ).toThrow();
  });

  test('stored-image checksum format (101 bytes, NOT the live format)', () => {
    // All-black block 0: checksum = 0x0F + 0x01 + 0 = 0x10.
    const black: RGB[] = Array.from({length: 32}, () => [0, 0, 0] as RGB);
    expect(storedPictureChecksum(0, black)).toBe(0x10);
    const stored = storedPictureBlockCommand(0, black);
    expect(stored).toHaveLength(101);
    expect(stored[100]).toBe(0x55);
    expect(stored[99]).toBe(0x10);
    // Live block for the same pixels has no checksum byte.
    const live = fullPictureBlockCommand(0, black);
    expect(live).toHaveLength(100);
    expect(live[99]).toBe(0x55);
  });

  test('save-single, no Reset, no slideshow: 12 commands, stock-snoop brackets', () => {
    const pixels: RGB[] = Array.from({length: 256}, () => [0, 0, 0] as RGB);
    pixels[0] = [255, 0, 0];
    pixels[255] = [0, 0, 255];
    const commands = savedPictureCommands(pixels);
    expect(commands).toHaveLength(12);
    // Open/close use the stock-snoop trailing bytes (sum+1), NOT the
    // truncated-sum CRC (02/03) that SpawnDev's code would produce.
    expect(bytesToHex(commands[0])).toBe('bc0011f10355');
    expect(bytesToHex(commands[11])).toBe('bc0011f20455');
    // Live init/end frame the stored blocks, exactly as in the snoop.
    expect(bytesToHex(commands[1])).toBe('bc0ff1080855');
    expect(bytesToHex(commands[10])).toBe('bc0ff2080955');
    // 8 stored blocks, 101 bytes each, checksum before terminator.
    for (let b = 0; b < 8; b++) {
      const block = commands[2 + b];
      expect(block).toHaveLength(101);
      expect(block[0]).toBe(0xbc);
      expect(block[1]).toBe(0x0f);
      expect(block[2]).toBe(b + 1);
      expect(block[100]).toBe(0x55);
    }
    expect(commands[2].slice(3, 6)).toEqual([255, 0, 0]);
    expect(commands[9].slice(96, 99)).toEqual([0, 0, 255]);
    // No Reset and no slideshow anywhere in the sequence.
    const hex = commands.map(bytesToHex).join(' ');
    expect(hex).not.toContain('bc00151555');
    expect(hex).not.toContain('bc00121255');
    expect(() =>
      savedPictureCommands(Array.from({length: 255}, () => [0, 0, 0] as RGB)),
    ).toThrow();
  });

  test('reset + save-single: 13 commands, Reset first, no slideshow', () => {    const pixels: RGB[] = Array.from({length: 256}, () => [0, 0, 0] as RGB);
    pixels[0] = [255, 0, 0];
    const commands = resetSavedPictureCommands(pixels);
    expect(commands).toHaveLength(13);
    expect(bytesToHex(commands[0])).toBe('bc00151555');
    // The remaining 12 commands are exactly the no-Reset save sequence.
    expect(bytesToHex(commands[1])).toBe('bc0011f10355');
    expect(bytesToHex(commands[12])).toBe('bc0011f20455');
    const hex = commands.map(bytesToHex).join(' ');
    expect(hex).not.toContain('bc00121255');
    expect(() =>
      resetSavedPictureCommands(
        Array.from({length: 255}, () => [0, 0, 0] as RGB),
      ),
    ).toThrow();
  });

  test('reset-only: single Reset command, no save bracket', () => {
    // The Reset-only button must send exactly BC 00 15 15 55 and
    // nothing else — no open/init/blocks/close — so a later Save
    // can be judged on its own, without a burst save muddying it.
    expect(bytesToHex(resetCommand())).toBe('bc00151555');
  });

  test('lamp slot save: 14 commands, index 1 of a 1-image set, no Reset', () => {
    const pixels: RGB[] = Array.from({length: 256}, () => [255, 0, 0] as RGB);
    const commands = lampSlotSaveCommands(pixels);
    expect(commands).toHaveLength(14);
    // 0x11 brackets are the proven stock-snoop bytes.
    expect(bytesToHex(commands[0])).toBe('bc0011f10355');
    expect(bytesToHex(commands[12])).toBe('bc0011f20455');
    // 0x02 short commands use SpawnDev's plain truncated sum:
    // enable(1): 02+F1+01 = F4; disable(1): 02+F2+01 = F5.
    expect(bytesToHex(slideShowImageWriteEnableCommand(1))).toBe(
      'bc02f101f455',
    );
    expect(bytesToHex(slideShowImageWriteDisableCommand(1))).toBe(
      'bc02f201f555',
    );
    expect(bytesToHex(commands[1])).toBe('bc02f101f455');
    expect(bytesToHex(commands[11])).toBe('bc02f201f555');
    // Marker: 02+07+3C = 45.
    expect(bytesToHex(slideShowMarkerCommand())).toBe('bc02073c4555');
    expect(bytesToHex(commands[10])).toBe('bc02073c4555');
    // 8 chunks, 102 bytes each: BC 02 01 <chunk> + 96 bytes +
    // checksum + 55. All-red chunk 1: 02+01+01+32*255 = 1FE4 -> E4.
    // The checksum includes the chunk number, so each chunk is
    // one more than the last.
    for (let b = 0; b < 8; b++) {
      const chunk = commands[2 + b];
      expect(chunk).toHaveLength(102);
      expect(chunk[0]).toBe(0xbc);
      expect(chunk[1]).toBe(0x02);
      expect(chunk[2]).toBe(1);
      expect(chunk[3]).toBe(b + 1);
      expect(chunk[100]).toBe(0xe4 + b);
      expect(chunk[101]).toBe(0x55);
    }
    expect(commands[2].slice(4, 7)).toEqual([255, 0, 0]);
    expect(bytesToHex(commands[13])).toBe('bc00121255');
    const hex = commands.map(bytesToHex).join(' ');
    expect(hex).not.toContain('bc00151555');
    expect(() =>
      lampSlotSaveCommands(Array.from({length: 255}, () => [0, 0, 0] as RGB)),
    ).toThrow();
    expect(() =>
      slideShowImageWriteChunkCommand(
        1,
        9,
        Array.from({length: 32}, () => [0, 0, 0] as RGB),
      ),
    ).toThrow();
  });

  test('lamp all slots: 70 commands, same colour in slots 1-8, no Reset', () => {
    const pixels: RGB[] = Array.from({length: 256}, () => [255, 0, 0] as RGB);
    const commands = lampAllSlotsCommands(pixels);
    expect(commands).toHaveLength(70);
    expect(bytesToHex(commands[0])).toBe('bc0011f10355');
    // enable(8): 02+F1+08 = FB; disable(8): 02+F2+08 = FC.
    expect(bytesToHex(commands[1])).toBe('bc02f108fb55');
    expect(bytesToHex(commands[67])).toBe('bc02f208fc55');
    // 64 chunks: image 1-8, chunk 1-8 each, 102 bytes.
    // All-red chunk, image 1 chunk 1: 02+01+01+32*255 = 1FE4 -> E4.
    // Image 8 chunk 8: 02+08+08+32*255 = 1FF2 -> F2.
    for (let image = 1; image <= 8; image++) {
      for (let b = 0; b < 8; b++) {
        const chunk = commands[2 + (image - 1) * 8 + b];
        expect(chunk).toHaveLength(102);
        expect(chunk[0]).toBe(0xbc);
        expect(chunk[1]).toBe(0x02);
        expect(chunk[2]).toBe(image);
        expect(chunk[3]).toBe(b + 1);
        expect(chunk[100]).toBe((0xe4 + (image - 1) + b) % 256);
        expect(chunk[101]).toBe(0x55);
      }
    }
    expect(bytesToHex(commands[66])).toBe('bc02073c4555');
    expect(bytesToHex(commands[68])).toBe('bc0011f20455');
    expect(bytesToHex(commands[69])).toBe('bc00121255');
    const hex = commands.map(bytesToHex).join(' ');
    expect(hex).not.toContain('bc00151555');
    expect(() =>
      lampAllSlotsCommands(Array.from({length: 255}, () => [0, 0, 0] as RGB)),
    ).toThrow();
  });
});
