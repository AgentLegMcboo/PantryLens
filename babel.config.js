module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    // Use the standard Reanimated plugin supported by Expo Go
    plugins: ['react-native-reanimated/plugin'],
  };
};
