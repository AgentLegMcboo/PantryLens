// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

// NativeWind compiles global.css into the styles the className prop resolves
// against. Without this wrapper every className is silently a no-op.
module.exports = withNativeWind(getDefaultConfig(__dirname), { input: './global.css' });
