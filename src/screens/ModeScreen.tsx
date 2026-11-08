import React, {useState} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {BottomMenu} from '../components/BottomMenu';
import {LamplightTab} from '../components/LamplightTab';
import {LightEffectTab} from '../components/LightEffectTab';

/**
 * Mode tab (Nov 8, 2026): the stock app's Mode page has
 * two subtabs, Lamplight and Light effect. Lamplight is
 * the finished lamp UI; Light effect is a placeholder
 * until the stock screen is shown. The subtab defaults
 * to Lamplight on every visit — the choice is local
 * state, so switching bottom tabs resets it.
 */
export function ModeScreen() {
  const [subtab, setSubtab] = useState<'lamplight' | 'light-effect'>(
    'lamplight',
  );

  return (
    <View style={styles.screen}>
      <View style={styles.subtabBar}>
        <TouchableOpacity
          style={[
            styles.subtab,
            subtab === 'lamplight' ? styles.subtabSelected : undefined,
          ]}
          onPress={() => setSubtab('lamplight')}
          accessibilityLabel="Lamplight"
        >
          <Text
            style={[
              styles.subtabLabel,
              subtab === 'lamplight' ? styles.subtabLabelSelected : undefined,
            ]}
          >
            Lamplight
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.subtab,
            subtab === 'light-effect' ? styles.subtabSelected : undefined,
          ]}
          onPress={() => setSubtab('light-effect')}
          accessibilityLabel="Light effect"
        >
          <Text
            style={[
              styles.subtabLabel,
              subtab === 'light-effect'
                ? styles.subtabLabelSelected
                : undefined,
            ]}
          >
            Light effect
          </Text>
        </TouchableOpacity>
      </View>
      {subtab === 'lamplight' ? <LamplightTab /> : <LightEffectTab />}
      <BottomMenu />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1},
  subtabBar: {flexDirection: 'row', borderBottomWidth: 1, borderColor: '#999'},
  subtab: {flex: 1, paddingVertical: 12, alignItems: 'center'},
  subtabSelected: {borderBottomWidth: 3, borderColor: '#000'},
  subtabLabel: {fontSize: 16, color: '#555'},
  subtabLabelSelected: {color: '#000', fontWeight: 'bold'},
});
