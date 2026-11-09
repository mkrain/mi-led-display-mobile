/**
 * MI LED Display — bare React Native app (no Expo).
 * One simple stack: Connect -> Draw / Photo / Slideshow / Mode,
 * with a persistent BottomMenu (Connect / Draw / Photo /
 * Slideshow / Mode) on every screen.
 * @format
 */

import React from 'react';
import {StatusBar} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {ConnectScreen} from './src/screens/ConnectScreen';
import {DrawScreen} from './src/screens/DrawScreen';
import {ModeScreen} from './src/screens/ModeScreen';
import {PhotoScreen} from './src/screens/PhotoScreen';
import {SlideshowScreen} from './src/screens/SlideshowScreen';
import {PhotoStateProvider} from './src/state/PhotoState';
import {ConnectionStateProvider} from './src/state/ConnectionState';
import {SlideshowStateProvider} from './src/state/SlideshowState';
import {DrawStateProvider} from './src/state/DrawState';
import {LampStateProvider} from './src/state/LampState';
import {EffectStateProvider} from './src/state/EffectState';
import {BrightnessStateProvider} from './src/state/BrightnessState';

export type RootStackParamList = {
  Connect: undefined;
  Draw: undefined;
  Photo: undefined;
  Slideshow: undefined;
  Mode: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function App() {
  return (
    <SafeAreaProvider>
    <PhotoStateProvider>
    <ConnectionStateProvider>
    <SlideshowStateProvider>
    <DrawStateProvider>
    <LampStateProvider>
    <EffectStateProvider>
    <BrightnessStateProvider>
    <NavigationContainer>
      <StatusBar barStyle="dark-content" />
      <Stack.Navigator initialRouteName="Connect">
        <Stack.Screen name="Connect" component={ConnectScreen} />
        {/* No swipe-back on Draw/Photo (Oct 29 jitter fix, round 2):
            iOS's stack back gesture fires from left-edge drags, and
            a crop pan or a Draw paint stroke starting near the left
            edge was sliding the previous screen in mid-gesture
            (seen at 14.77s in the Oct 29 video). Navigation is via
            the bottom tab bar, so losing swipe-back costs nothing. */}
        <Stack.Screen
          name="Draw"
          component={DrawScreen}
          options={{gestureEnabled: false}}
        />
        <Stack.Screen
          name="Photo"
          component={PhotoScreen}
          options={{gestureEnabled: false}}
        />
        <Stack.Screen
          name="Slideshow"
          component={SlideshowScreen}
          options={{gestureEnabled: false}}
        />
        <Stack.Screen
          name="Mode"
          component={ModeScreen}
          options={{gestureEnabled: false}}
        />
      </Stack.Navigator>
    </NavigationContainer>
    </BrightnessStateProvider>
    </EffectStateProvider>
    </LampStateProvider>
    </DrawStateProvider>
    </SlideshowStateProvider>
    </ConnectionStateProvider>
    </PhotoStateProvider>
    </SafeAreaProvider>
  );
}

export default App;
