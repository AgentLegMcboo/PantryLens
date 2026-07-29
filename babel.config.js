module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Reanimated 4 moved its Babel plugin into react-native-worklets. It must be
    // last in the plugin list, and Metro needs `--clear` after this file changes.
    plugins: ['react-native-worklets/plugin'],
  };
};
