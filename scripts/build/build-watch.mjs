import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const [mode, phoneBundleId, ...extra] = process.argv.slice(2);
if (
  !['--simulator', '--device'].includes(mode) ||
  !/^[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/.test(phoneBundleId || '') ||
  extra.length
)
  throw new Error('Usage: node scripts/build/build-watch.mjs [--simulator|--device] PHONE_BUNDLE_ID');
const simulator = mode === '--simulator';
const sdk = simulator ? 'watchsimulator' : 'watchos';
const minimum = '10.0';
const target = simulator ? `arm64-apple-watchos${minimum}-simulator` : `arm64_32-apple-watchos${minimum}`;
const output = resolve(root, 'tmp/nativewatch.noindex');
const { versionName, versionCode } = JSON.parse(readFileSync(resolve(root, 'src/manifest.json'), 'utf8'));
mkdirSync(output, { recursive: true });
const bundle = resolve(mkdtempSync(resolve(output, 'build-')), 'Yozi Watch.app');
mkdirSync(bundle);
const run = (binary, args) => execFileSync(binary, args, { stdio: 'inherit' });
const sdkPath = execFileSync('xcrun', ['--sdk', sdk, '--show-sdk-path'], { encoding: 'utf8' }).trim();
run('xcrun', [
  '--sdk',
  sdk,
  'swiftc',
  '-parse-as-library',
  '-O',
  '-target',
  target,
  '-sdk',
  sdkPath,
  resolve(root, 'nativewatch/YoziWatch.swift'),
  '-o',
  resolve(bundle, 'YoziWatch')
]);
writeFileSync(
  resolve(bundle, 'Info.plist'),
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>${phoneBundleId}.watchkitapp</string>
  <key>CFBundleExecutable</key><string>YoziWatch</string>
  <key>CFBundleName</key><string>Yozi AI</string>
  <key>CFBundleDisplayName</key><string>Yozi AI</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${versionName}</string>
  <key>CFBundleVersion</key><string>${versionCode}</string>
  <key>CFBundleSupportedPlatforms</key><array><string>${simulator ? 'WatchSimulator' : 'WatchOS'}</string></array>
  <key>MinimumOSVersion</key><string>${minimum}</string>
  <key>UIDeviceFamily</key><array><integer>4</integer></array>
  <key>WKApplication</key><true/>
  <key>WKCompanionAppBundleIdentifier</key><string>${phoneBundleId}</string>
  <key>WKRunsIndependentlyOfCompanionApp</key><false/>
</dict></plist>
`
);
cpSync(resolve(root, 'src/static/brand/kitten-avatar.png'), resolve(bundle, 'Kitten.png'));
const iconsPlist = resolve(dirname(bundle), 'watch-icons.plist');
run('xcrun', [
  '--sdk',
  sdk,
  'actool',
  '--compile',
  bundle,
  '--platform',
  sdk,
  '--target-device',
  'watch',
  '--minimum-deployment-target',
  minimum,
  '--app-icon',
  'AppIcon',
  '--output-partial-info-plist',
  iconsPlist,
  resolve(root, 'nativewatch/Assets.xcassets')
]);
const icons = execFileSync('plutil', ['-extract', 'CFBundleIcons', 'xml1', '-o', '-', iconsPlist], {
  encoding: 'utf8'
});
run('plutil', ['-insert', 'CFBundleIcons', '-xml', icons, resolve(bundle, 'Info.plist')]);
unlinkSync(iconsPlist);
run('plutil', ['-lint', resolve(bundle, 'Info.plist')]);
if (simulator) run('codesign', ['--sign', '-', '--timestamp=none', bundle]);
console.log(bundle);
