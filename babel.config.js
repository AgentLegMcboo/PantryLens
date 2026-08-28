module.exports = function (api) {
  api.cache(true);
  return {
    // `jsxImportSource: nativewind` is what lets a plain <View className="...">
    // work without wrapping anything.
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    // Reanimated 4 moved its Babel plugin into react-native-worklets. It must be
    // last in the plugin list, and Metro needs `--clear` after this file changes.
    //
    // Do NOT also add 'react-native-reanimated/plugin' here, which most NativeWind
    // guides tell you to: in Reanimated 4 that plugin resolves to this same
    // worklets plugin, and registering both conflicts.
    plugins: ['react-native-worklets/plugin'],
  };
};
