const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.serializer.getPolyfills = ({ platform }) => {
  if (platform === 'web') {
    return [];
  }
  return require('@react-native/js-polyfills')();
};

module.exports = config;
