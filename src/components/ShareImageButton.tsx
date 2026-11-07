import React, {useState} from 'react';
import {Button, StyleSheet, Text, View} from 'react-native';
import type {RGB} from '../conversion/convert';
import {shareImage} from '../export/shareSlideshowItem';
import {ToolButton} from './ActionToolbar';

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
  /**
   * 'full' (default): a full-width Button with a status
   * note under it, as Slideshow uses it. 'tool': a
   * single tool button for an ActionToolbar row, with
   * feedback reported through onResult to the screen's
   * status line instead of a note under the button
   * (there is no room for one in a toolbar row, and a
   * note there would shift the layout).
   */
  variant?: 'full' | 'tool';
  onResult?: (message: string) => void;
}

export function ShareImageButton({
  label,
  pixels,
  disabled = false,
  variant = 'full',
  onResult,
}: ShareImageButtonProps) {
  const [sharing, setSharing] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  async function onShare() {
    if (sharing) {
      return;
    }
    setSharing(true);
    const report = (message: string) => {
      setExportStatus(message);
      onResult?.(message);
    };
    report('Preparing image…');
    try {
      const outcome = await shareImage({label, pixels});
      report(
        outcome === 'shared'
          ? 'Shared — pick Photos, Files, or another app in the sheet.'
          : 'Share cancelled — nothing was saved.',
      );
    } catch (e) {
      report(
        `Share failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setSharing(false);
    }
  }

  if (variant === 'tool') {
    return (
      <ToolButton
        label="Share"
        icon="⤴️"
        onPress={onShare}
        disabled={sharing || disabled}
        accessibilityLabel="Share image"
      />
    );
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
