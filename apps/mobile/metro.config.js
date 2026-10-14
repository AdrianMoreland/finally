const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

// Expo configures Metro for pnpm workspaces; NativeWind adds the Tailwind pipeline.
const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './global.css' });
