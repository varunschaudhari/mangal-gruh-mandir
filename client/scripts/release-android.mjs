// Builds a signed Android release and prepares the files that phones update from.
//
//   npm run release:android -- --version 1.2 --notes "What changed" [--min 3]
//
//   --version  versionName users see (required, must be new). versionCode is bumped by 1.
//   --notes    shown in the in-app "Update available" sheet.
//   --min      minVersionCode: builds below this are forced to update (optional).
//
// Needs android/keystore.properties (see MOBILE.md), JDK 21 and the Android SDK.
// Writes ../mobile-releases/mgm-mandir-<version>.apk and ../mobile-releases/latest.json;
// copy both to the server's mobile-releases/ folder (APK first) to publish.
import { execSync } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const CLIENT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ANDROID = path.join(CLIENT, 'android');
const GRADLE_FILE = path.join(ANDROID, 'app', 'build.gradle');
const OUT_DIR = path.resolve(CLIENT, '..', 'mobile-releases');

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const fail = (msg) => { console.error(`\n✖ ${msg}\n`); process.exit(1); };

const versionName = arg('version');
const notes = arg('notes') || '';
const minVersionCode = arg('min') ? Number(arg('min')) : undefined;

if (!versionName) fail('Pass --version, e.g. --version 1.2');
if (!existsSync(path.join(ANDROID, 'keystore.properties'))) {
  fail('android/keystore.properties is missing — create the release key first (MOBILE.md → "Android release").');
}

let gradle = readFileSync(GRADLE_FILE, 'utf8');
const oldCode = Number(gradle.match(/versionCode\s+(\d+)/)?.[1]);
const oldName = gradle.match(/versionName\s+"([^"]+)"/)?.[1];
if (!oldCode) fail('Could not read versionCode from android/app/build.gradle');
if (versionName === oldName) fail(`Version ${versionName} is already the current version — pick a new one.`);
if (minVersionCode !== undefined && !(minVersionCode >= 1 && minVersionCode <= oldCode + 1)) {
  fail(`--min must be between 1 and ${oldCode + 1}`);
}

const versionCode = oldCode + 1;
gradle = gradle
  .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
  .replace(/versionName\s+"[^"]+"/, `versionName "${versionName}"`);
writeFileSync(GRADLE_FILE, gradle);
console.log(`Version ${oldName} (${oldCode}) → ${versionName} (${versionCode})`);

const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit', shell: true });
run('npm run build:mobile', CLIENT);
run('npx cap sync android', CLIENT);
// With the path: Windows may be set not to run programs from the current folder
// (NoDefaultCurrentDirectoryInExePath), and then a bare "gradlew.bat" isn't found
run(process.platform === 'win32' ? '.\\gradlew.bat assembleRelease' : './gradlew assembleRelease', ANDROID);

const apkSrc = path.join(ANDROID, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
if (!existsSync(apkSrc)) fail('Release APK not found — check the Gradle output above (is it signed?).');

mkdirSync(OUT_DIR, { recursive: true });
const file = `mgm-mandir-${versionName}.apk`;
copyFileSync(apkSrc, path.join(OUT_DIR, file));

const latestPath = path.join(OUT_DIR, 'latest.json');
let previousMin = 1;
try { previousMin = JSON.parse(readFileSync(latestPath, 'utf8')).android?.minVersionCode || 1; } catch { /* first release */ }
writeFileSync(latestPath, `${JSON.stringify({
  android: { versionCode, versionName, file, minVersionCode: minVersionCode ?? previousMin, notes },
}, null, 2)}\n`);

console.log(`
✔ Built ${file}

Publish (APK first, then latest.json so phones never see a version that isn't there yet):
  scp mobile-releases/${file} <server>:<repo>/mobile-releases/
  scp mobile-releases/latest.json <server>:<repo>/mobile-releases/

Then commit the version bump in client/android/app/build.gradle.
`);
