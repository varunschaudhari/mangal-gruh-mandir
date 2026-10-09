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

// Android notification icon: Android draws it as a white silhouette, so it must be a
// simple single-colour glyph (the temple shape), not the full-colour logo.
const notifySvg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path fill="#fff" d="M12 1.5 15 7H9z"/>
  <rect fill="#fff" x="10.2" y="7" width="3.6" height="1.4"/>
  <path fill="#fff" fill-rule="evenodd" d="M6.5 8.4h11v7.6h-11z M10.4 16v-3a1.6 1.6 0 0 1 3.2 0v3z"/>
  <rect fill="#fff" x="4.8" y="16.6" width="14.4" height="1.6" rx=".4"/>
  <rect fill="#fff" x="3.2" y="18.8" width="17.6" height="1.6" rx=".4"/>
</svg>`);
const NOTIFY_SIZES = { mdpi: 24, hdpi: 36, xhdpi: 48, xxhdpi: 72, xxxhdpi: 96 };
for (const [dpi, size] of Object.entries(NOTIFY_SIZES)) {
  const dir = `android/app/src/main/res/drawable-${dpi}`;
  mkdirSync(dir, { recursive: true });
  await sharp(notifySvg).resize(size, size).png().toFile(`${dir}/ic_stat_notify.png`);
}
console.log('Generated Android notification icon (ic_stat_notify)');

execSync(
  `npx @capacitor/assets generate --android --ios --assetPath ${OUT} `
  + `--iconBackgroundColor "${WHITE}" --iconBackgroundColorDark "${WHITE}" `
  + `--splashBackgroundColor "${SAFFRON}" --splashBackgroundColorDark "${SAFFRON}"`,
  { stdio: 'inherit' },
);
