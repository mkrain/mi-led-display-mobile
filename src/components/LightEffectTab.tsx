import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

/**
 * Light effect subtab of the Mode screen (Nov 8, 2026):
 * placeholder. The stock Mode tab has two subtabs,
 * Lamplight and Light effect, and this half has not
 * been shown yet — no screenshots, no description of
 * its controls or what it sends to the panel. It is
 * built when Jeremiah shows the stock screen.
 */
export function LightEffectTab() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Light effect is not built yet.</Text>
      <Text style={styles.text}>
        Show the stock app&apos;s Light effect screen and it gets built next.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, padding: 16, alignItems: 'center', justifyContent: 'center'},
  text: {fontSize: 16, textAlign: 'center', marginBottom: 8},
});
