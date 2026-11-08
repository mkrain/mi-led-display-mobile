import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {StackActions, useNavigation, useRoute} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../App';

/**
 * Persistent bottom menu, like a desktop taskbar: Connect / Draw /
 * Photo / Slideshow / Lamp on every screen, so navigation never depends on finding a
 * "Go to …" button in the middle of a screen. The active tab is
 * highlighted; tapping the active tab does nothing (no re-push).
 * Glyphs are text symbols, not emoji.
 *
 * CRITICAL, Oct 30, 2026: this must POP to an existing tab, not
 * navigate() to it. In React Navigation v7, navigate() without
 * pop:true PUSHES a new route with a fresh key even when a route
 * with that name is already in the stack (see StackRouter: a
 * NAVIGATE action only reuses a route if it is current or pop is
 * set, otherwise it appends a new one). The old code therefore
 * piled up duplicate Connect/Draw/Photo screens: a fresh Connect
 * instance had local status "Not connected" while the shared
 * banner correctly said Connected, and the header showed a back
 * button to Draw — exactly the screenshot that motivated this fix
 * on Oct 30.
 * StackActions.popTo() pops to the existing instance (preserving
 * its state, including a Draw grid) and, if the tab is somehow
 * not in the stack, replaces the current screen with it instead
 * of stacking another copy.
 *
 * Bottom spacing: the bar sits above the iOS home-indicator / app
 * switcher area via the safe-area inset, plus 12 pt of breathing
 * room, so it never butts up against the bottom edge.
 */
const TABS: Array<{name: keyof RootStackParamList; label: string; glyph: string}> = [
  {name: 'Connect', label: 'Connect', glyph: '◎'},
  {name: 'Draw', label: 'Draw', glyph: '✎'},
  {name: 'Photo', label: 'Photo', glyph: '▣'},
  {name: 'Slideshow', label: 'Slideshow', glyph: '▦'},
  {name: 'Lamp', label: 'Lamp', glyph: '☀'},
];

export function BottomMenu() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, {paddingBottom: insets.bottom + 12}]}>
      {TABS.map(tab => {
        const active = route.name === tab.name;
        return (
          <TouchableOpacity
            key={tab.name}
            style={styles.tab}
            onPress={() => {
              if (!active) {
                navigation.dispatch(StackActions.popTo(tab.name));
              }
            }}
          >
            <Text style={[styles.glyph, active && styles.active]}>{tab.glyph}</Text>
            <Text style={[styles.label, active && styles.active]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    backgroundColor: '#fff',
  },
  tab: {flex: 1, alignItems: 'center', paddingTop: 8},
  glyph: {fontSize: 20, color: '#888'},
  label: {fontSize: 12, fontWeight: '600', color: '#888'},
  active: {color: '#007aff'},
});
