import React, {useState} from 'react';
import {Button, StyleSheet, Text, View} from 'react-native';
import type {RGB} from '../conversion/convert';
import {shareImage} from '../export/shareSlideshowItem';

/**
 * "Share image…" button, shared by Draw, Photo, and
 * Slideshow (Nov 7, 2026).
 *
 * Shares the given 16x16 pixels as an upscaled PNG
 * through the system share sheet — no slideshow add
 * required. Feedback lives right here, under the button,
 * not in the screen's status line at the top (which is
 * off-screen when this button is in view). Disabled while
 * a share is in flight or while the caller says the
 * screen is busy (sending / saving).
 */
interface ShareImageButtonProps {
  label: string;
  pixels: readonly RGB[];
  disabled?: boolean;
}

export function ShareImageButton({
  label,
  pixels,
  disabled = false,
}: ShareImageButtonProps) {
  const [sharing, setSharing] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  async function onShare() {
    if (sharing) {
      return;
    }
    setSharing(true);
    setExportStatus('Preparing image…');
    try {
      const outcome = await shareImage({label, pixels});
      setExportStatus(
        outcome === 'shared'
          ? 'Shared — pick Photos, Files, or another app in the sheet.'
          : 'Share cancelled — nothing was saved.',
      );
    } catch (e) {
      setExportStatus(
        `Share failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setSharing(false);
    }
  }

  return (
    <>
      <View style={styles.button}>
        <Button
          title={sharing ? 'Preparing…' : 'Share image…'}
          onPress={onShare}
          disabled={sharing || disabled}
        />
      </View>
      {exportStatus ? (
        <Text style={styles.note}>{exportStatus}</Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  button: {marginVertical: 4, width: '100%'},
  note: {marginTop: 8, color: '#555', textAlign: 'center'},
});
