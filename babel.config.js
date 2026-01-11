module.exports = function (api) {
  api.cache(true);
  return {
    // Use the standard Expo Babel preset only.
    // NativeWind is temporarily disabled to avoid the `.plugins` error.
    presets: ['babel-preset-expo'],
  };
};

