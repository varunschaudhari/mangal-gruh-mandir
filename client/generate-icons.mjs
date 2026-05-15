import sharp from 'sharp';
import { mkdirSync } from 'fs';

mkdirSync('public', { recursive: true });

const svg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#FF8C00"/>

  <!-- Temple shikhara (spire) -->
  <polygon points="256,60 300,140 212,140" fill="white" opacity="0.95"/>
  <rect x="224" y="138" width="64" height="20" rx="4" fill="white" opacity="0.95"/>

  <!-- Temple body -->
  <rect x="176" y="158" width="160" height="110" rx="8" fill="white" opacity="0.95"/>

  <!-- Temple door arch -->
  <path d="M228,268 L228,220 Q256,200 284,220 L284,268 Z" fill="#FF8C00"/>

  <!-- Temple steps -->
  <rect x="156" y="268" width="200" height="14" rx="4" fill="white" opacity="0.9"/>
  <rect x="140" y="282" width="232" height="14" rx="4" fill="white" opacity="0.8"/>

  <!-- Text -->
  <text x="256" y="360" text-anchor="middle"
        font-family="Georgia,serif" font-size="72" font-weight="bold"
        fill="white" letter-spacing="4">MGM</text>
  <text x="256" y="410" text-anchor="middle"
        font-family="Arial,sans-serif" font-size="34"
        fill="white" opacity="0.9">Stock</text>
</svg>
`);

const sizes = [
  { file: 'public/pwa-192x192.png', size: 192 },
  { file: 'public/pwa-512x512.png', size: 512 },
  { file: 'public/apple-touch-icon.png', size: 180 },
];

for (const { file, size } of sizes) {
  await sharp(svg).resize(size, size).png().toFile(file);
  console.log(`Generated ${file}`);
}

console.log('All icons generated!');
