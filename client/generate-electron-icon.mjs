// Generates electron/assets/icon.ico from the temple logo.
// Pads the (near-square) logo onto an exact transparent square at each
// standard icon size, then packs them into one multi-resolution .ico.
// Run from the client/ dir:  node generate-electron-icon.mjs
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import path from 'path';

const SRC = 'public/logo.png';
const OUT_DIR = path.resolve('../electron/assets');
mkdirSync(OUT_DIR, { recursive: true });

const sizes = [256, 128, 64, 48, 32, 16];
const tmp = [];

for (const size of sizes) {
  const file = path.join(OUT_DIR, `_tmp_${size}.png`);
  await sharp(SRC)
    .resize(size, size, {
      fit: 'contain',                                  // no distortion
      background: { r: 0, g: 0, b: 0, alpha: 0 },      // transparent padding
    })
    .png()
    .toFile(file);
  tmp.push(file);
}

const icoBuf = await pngToIco(tmp);
const icoPath = path.join(OUT_DIR, 'icon.ico');
writeFileSync(icoPath, icoBuf);

// also keep a 256 png (handy for Linux/window icon if ever needed)
await sharp(SRC)
  .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(path.join(OUT_DIR, 'icon.png'));

tmp.forEach((f) => rmSync(f));
console.log('Wrote', icoPath, '(' + icoBuf.length + ' bytes) and icon.png');
