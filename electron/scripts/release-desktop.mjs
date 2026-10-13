// Builds a new version of the desktop counter app and prepares the files it updates from.
//
//   npm run release -- --version 1.1.0 [--notes "What changed"]
//
//   --version  new version (x.y.z, higher than the current one in package.json)
//   --notes    shown nowhere yet; kept in latest.yml for reference
//
// Builds the React app (client/dist), packs the Windows installer, and copies
//   MGM-Counter-Setup-<version>.exe, its .blockmap and latest.yml
// to ../mobile-releases/desktop/. Copy that folder to the server's mobile-releases/desktop/
// (installer first, latest.yml last): installed apps pick the update up within a few hours,
// download it in the background and install it on the next restart.
import { execSync } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ELECTRON = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT = path.resolve(ELECTRON, '..', 'client');
const OUT_DIR = path.resolve(ELECTRON, '..', 'mobile-releases', 'desktop');
const PKG = path.join(ELECTRON, 'package.json');

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const fail = (msg) => { console.error(`\n✖ ${msg}\n`); process.exit(1); };
const parts = (v) => String(v).split('.').map(Number);
const newer = (a, b) => { const x = parts(a); const y = parts(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };

const version = arg('version');
const notes = arg('notes') || '';
if (!/^\d+\.\d+\.\d+$/.test(version || '')) fail('Pass --version x.y.z, e.g. --version 1.1.0');

const pkg = JSON.parse(readFileSync(PKG, 'utf8'));
if (!newer(version, pkg.version)) fail(`Version ${version} must be higher than the current ${pkg.version}.`);
pkg.version = version;
writeFileSync(PKG, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`Desktop app ${version}`);

const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit', shell: true });
run('npm run build', CLIENT);   // the web build — the desktop app serves it from its own files
const notesFlag = notes ? ` -c.releaseInfo.releaseNotes=${JSON.stringify(notes)}` : '';
run(`npx electron-builder --win --config electron-builder.config.cjs --publish never${notesFlag}`, ELECTRON);

const dist = path.join(ELECTRON, 'dist');
const installer = `MGM-Counter-Setup-${version}.exe`;
const files = [installer, `${installer}.blockmap`, 'latest.yml'];
for (const f of files) if (!existsSync(path.join(dist, f))) fail(`${f} was not built — check the output above.`);
mkdirSync(OUT_DIR, { recursive: true });
for (const f of files) copyFileSync(path.join(dist, f), path.join(OUT_DIR, f));

console.log(`\n✔ Ready in mobile-releases/desktop/: ${files.join(', ')}`);
console.log('Publish (installer first, latest.yml last):');
console.log(`  scp "mobile-releases/desktop/${installer}" "mobile-releases/desktop/${installer}.blockmap" root@<server>:/root/mangal-gruh-mandir/mobile-releases/desktop/`);
console.log('  scp mobile-releases/desktop/latest.yml root@<server>:/root/mangal-gruh-mandir/mobile-releases/desktop/');
console.log(`First install on a counter PC (or one still on 1.0.0): https://mandir.aumora.io/api/app/desktop/${installer}`);
