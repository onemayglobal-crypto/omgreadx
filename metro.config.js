// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Customize the watcher to handle missing directories gracefully
const originalWatchFolders = config.watchFolders;
if (originalWatchFolders) {
  const fs = require('fs');
  config.watchFolders = originalWatchFolders.filter(folder => {
    try {
      // Only include folders that actually exist
      return fs.existsSync(folder);
    } catch {
      return false;
    }
  });
}

// Add blockList to prevent Metro from trying to resolve/watch problematic paths
config.resolver = config.resolver || {};
config.resolver.blockList = config.resolver.blockList || [];
// Block the problematic wasi directory
config.resolver.blockList.push(/.*@tybys.*wasm-util.*wasi.*/);

module.exports = config;

