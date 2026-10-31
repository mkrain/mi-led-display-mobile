# MI LED Display - mobile app

A bare React Native (TypeScript) phone app for the Merkury Innovations
Matrix LED Display (MI-LNL62-999W). It replaces the stock "Matrix Panel
Plus" app.

## Stack

Bare React Native, no Expo. BLE needs a native module
(`react-native-ble-manager`). Expo Go cannot run native BLE modules.
A dev build would still need the native build work, plus the Expo
layer on top.

Versions pinned at scaffold time. See `package.json` for the exact
list.

- React Native 0.81.4, React 19.1.0, Node >= 20
- `react-native-ble-manager` 12.6.0
- `@react-navigation/native` 7.x, `@react-navigation/native-stack` 7.x
- `react-native-screens` 4.24.0
- `react-native-image-crop-picker` 0.52.0
- `@react-native-async-storage/async-storage` 2.2.0
- `@react-native-community/slider` 4.5.6

## Screens

Four tabs, reached from the bottom menu on every screen: Connect,
Draw, Photo, Slideshow.

- Connect: scan for the display, connect, disconnect, and power
  on or off. It remembers the last connected device and can
  reconnect to it directly on load, with a scan fallback. An
  auto-connect toggle is available.
- Draw: a 16x16 grid. Tap or drag to paint. Colour comes from a
  2D pad (horizontal: hue, vertical: saturation), RGB sliders,
  or a palette strip. An eraser paints black, which is the
  panel off state. Send shows the grid on the panel for about
  5 minutes. Add to slideshow stores the grid in a slideshow.
- Photo: pick a photo, or use the built-in demo image. Pinch
  to zoom and drag to crop. Pick a trim mode, adjust saturation
  and brightness, and preview the 16x16 result. Saturation
  starts at 2.5. Brightness starts at 1. Send shows the photo
  on the panel for about 5 minutes. Add to slideshow stores
  the preview in a slideshow.
- Slideshow: a library of named slideshows. One slideshow is
  active at a time. Add, remove, and reorder items in the
  active slideshow. Save sends the active slideshow to the
  panel. The panel holds one set at a time, with a limit of
  10 items per slideshow.

## Panel behaviour

Send is temporary. A sent picture shows for about 5 minutes,
then the panel returns to its saved cycle. Disconnecting
returns to the saved cycle sooner.

Save is permanent, within the panel limit. Saving wipes the
current panel set, then saves the active slideshow in order
and sets slideshow mode. The sequence is Reset, reconnect,
save each item in order, then slideshow mode. A Reset plus
save in one burst creates a blank slot, so the app never
does that.

The panel has no query command. The app cannot read back
what is currently saved on the panel. "Last saved" in the
app means the last save this app performed.

## Protocol

Device name: "MI Matrix Display". Service
`0000ffd0-0000-1000-8000-00805f9b34fb`. Characteristic
`0000ffd1-0000-1000-8000-00805f9b34fb`. Every command
starts with `BC` and ends with `55`.

A full picture is 16x16, 256 RGB pixels, row-major, in 8
blocks of 32 pixels. The send sequence is init, 8 blocks,
end. Saved images use the same blocks plus a checksum byte,
which is the truncated sum of the bytes after `BC`.

A single pixel command takes a position PP and a check
byte QQ, where QQ equals PP minus 1. The panel protocol is
RGB only. There is no alpha channel. Black means off.

See `src/ble/protocol.ts` for the full command list.

## Protocol sources and thanks

This app is an independent implementation. It was developed
with two public sources as reference. Neither project's code
is copied into this repo. The protocol bytes in
`src/ble/protocol.ts` were verified against this panel on
device.

- offe/mi-led-display, by Oscar Lindberg (MIT): protocol
  research, Bluetooth snoop captures, and Python reference
  implementations. https://github.com/offe/mi-led-display
- LostBeard/SpawnDev.MatrixLEDDisplay (MIT): command labels
  used as investigative leads. Some labels did not survive
  device testing. The 0x13 and 0x15 commands do not hold a
  picture on the panel, so the app does not use them that
  way. https://github.com/LostBeard/SpawnDev.MatrixLEDDisplay

## Building

Prerequisites: Xcode and CocoaPods for iOS, Android Studio
and the Android SDK for Android, Node >= 20.

```sh
npm install

# iOS (first time, and after any native dependency change)
bundle install
bundle exec pod install
npm run ios

# Android (emulator running, or a device connected)
npm run android
```

To run the dev server separately:

```sh
npm start
```

Checks that run on any machine:

```sh
npm test          # Jest: protocol bytes, conversion, slideshow library
npx tsc --noEmit  # TypeScript
npm run lint      # ESLint
```

iOS has been tested on a physical iPhone. Android builds
have not been tested yet.

## BLE permissions

- iOS: `NSBluetoothAlwaysUsageDescription` and
  `NSBluetoothPeripheralUsageDescription` are set in
  `ios/MiLedDisplay/Info.plist`. The app must be in the
  foreground for BLE. No background BLE mode is enabled.
- Android: `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT`
  (Android 12+) plus the legacy Bluetooth and location
  permissions are in
  `android/app/src/main/AndroidManifest.xml`. The Connect
  screen requests them at runtime before scanning.

## Conversion modes (Photo screen)

Goal: a recognizable result at 16x16. Downscaling runs in
linear light: sRGB to linear, resize, back to sRGB.
Sharpening and saturation are separate steps after the
resize. The conversion function defaults to sharpen 0.8
and saturation 1.15. The Photo screen starts at saturation
2.5.

- Smart (default): colorful trim if found, otherwise
  center crop, then fill.
- Full: squish the whole image to 16x16.
- CenterCrop: center square crop, then fill.
- Fit: preserve aspect, letterbox on black.
- ManualCrop: crop to a caller-supplied box, then fill.
- TrimColorful: crop to the bounding box of pixels with
  channel spread above 30, then fill. This isolates a
  purple pendant from a white background and a grey
  watermark with spread below 10, where a near-white trim
  fails because the watermark spans the full width.

Known limit: 3 stacked letters in 16 rows give about 5
rows per letter. A full-frame pendant will never be
legible at 16x16. Legibility at that size needs a
different mode, such as letter-by-letter cycling,
scrolling, or simplified block letters.

## License

MIT. See LICENSE. Reuse is allowed for personal and
commercial use, as long as the copyright and license notice
stay with the code.
