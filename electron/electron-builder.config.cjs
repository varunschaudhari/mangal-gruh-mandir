/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.mangalgruhmandir.counter',
  productName: 'MGM Counter',

  directories: { output: 'dist' },

  // Bundle the Electron shell. The React UI is served locally (offline-first)
  // by main.js via the app:// protocol, with /api proxied to the VPS — so the
  // built client/dist must ship inside the app (see extraResources below).
  files: [
    'main.js',
    'preload.js',
    'printer.js',
    'setup.html',
    'package.json',
    'assets/**',
    'node_modules/**',
  ],

  // Copy the built React app into the package at resources/client-dist.
  // main.js resolves this via process.resourcesPath when packaged.
  extraResources: [
    { from: '../client/dist', to: 'client-dist' },
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
