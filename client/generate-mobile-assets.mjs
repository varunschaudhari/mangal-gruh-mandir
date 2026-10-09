// Builds the source images for the Android/iOS app icon and splash screen from the
// temple logo, then lets @capacitor/assets cut every platform size from them.
// Run from the client/ dir:  npm run icons:mobile
import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { execSync } from 'child_process';

const SRC = 'public/logo.png';
const OUT = 'assets';
const SAFFRON = '#FF8C00';   // theme colour (matches the PWA manifest)
const WHITE = '#FFFFFF';

mkdirSync(OUT, { recursive: true });

const logo = (size) =>
  sharp(SRC).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();

const canvas = (size, color) =>
  sharp({ create: { width: size, height: size, channels: 4, background: color } });

const place = async (size, color, logoSize, file) => {
  await canvas(size, color)
    .composite([{ input: await logo(logoSize), gravity: 'center' }])
    .png()
    .toFile(`${OUT}/${file}`);
  console.log(`Generated ${OUT}/${file}`);
};

// iOS + legacy Android icon: logo on white, small margin.
await place(1024, WHITE, 900, 'icon-only.png');
// Android adaptive icon: the launcher masks to a circle/squircle, so keep the
// logo inside the central ~66% safe zone on a transparent foreground layer.
await place(1024, { r: 0, g: 0, b: 0, alpha: 0 }, 640, 'icon-foreground.png');
await canvas(1024, WHITE).png().toFile(`${OUT}/icon-background.png`);
console.log(`Generated ${OUT}/icon-background.png`);
// Splash: logo badge on saffron (same artwork for dark mode).
await place(2732, SAFFRON, 900, 'splash.png');
await place(2732, SAFFRON, 900, 'splash-dark.png');

execSync(
  `npx @capacitor/assets generate --android --ios --assetPath ${OUT} `
  + `--iconBackgroundColor "${WHITE}" --iconBackgroundColorDark "${WHITE}" `
  + `--splashBackgroundColor "${SAFFRON}" --splashBackgroundColorDark "${SAFFRON}"`,
  { stdio: 'inherit' },
);
