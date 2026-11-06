module.exports = {
  preset: 'react-native',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // The RN preset only transforms react-native packages by default; the
  // navigation stack ships ESM in node_modules, so it must be transformed
  // too, otherwise the template App test fails to parse it.
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?react-native|@react-native(-community)?|@react-navigation|react-native-screens|react-native-safe-area-context|react-native-share|@dr\\.pogodin)',
  ],
};
