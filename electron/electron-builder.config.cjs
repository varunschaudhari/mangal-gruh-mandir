/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.mangalgruhmandir.counter',
  productName: 'MGM Counter',

  directories: { output: 'dist-electron' },

  // Only bundle the Electron shell — React app loads live from VPS.
  // New web deployments are instant; new installer only needed when
  // main.js / preload.js / printer.js changes.
  files: [
    'main.js',
    'preload.js',
    'printer.js',
    'setup.html',
    'package.json',
    'node_modules/**',
  ],

  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    // Place a 256×256 icon.ico in electron/assets/ to brand the installer.
    // If the file is absent, electron-builder uses a default Electron icon.
    icon: 'assets/icon.ico',
  },

  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'MGM Counter',
  },

  npmRebuild: false,
};
