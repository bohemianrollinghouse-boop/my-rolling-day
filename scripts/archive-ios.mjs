// Archive le projet Xcode et l'envoie sur App Store Connect (sans passer par l'UI Xcode).
//
// Prérequis — .env.ios (non versionné, cf. .env.ios.example) :
//   APP_STORE_KEY_ID      ID de la clé API App Store Connect
//   APP_STORE_ISSUER_ID   Issuer ID App Store Connect
//   APP_STORE_KEY_PATH    chemin vers le fichier AuthKey_<KEY_ID>.p8
// La clé est copiée dans ~/private_keys/ si besoin (xcodebuild la cherche là).

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { c, ROOT, readPkg, loadEnv, title, die } from './lib/cli.mjs';

loadEnv('.env.ios');

const WORKSPACE = path.join(ROOT, 'ios/App/App.xcworkspace');
const SCHEME = 'App';
const TEAM_ID = process.env.IOS_TEAM_ID || 'J76SQYZMQX';
const APP_NAME = 'My Rolling Day';

const { APP_STORE_KEY_ID, APP_STORE_ISSUER_ID, APP_STORE_KEY_PATH } = process.env;

const missing = ['APP_STORE_KEY_ID', 'APP_STORE_ISSUER_ID', 'APP_STORE_KEY_PATH'].filter(
  (k) => !process.env[k]
);
if (missing.length) {
  die(`Variables manquantes dans .env.ios : ${missing.join(', ')}`, [
    'APP_STORE_KEY_ID    → ID de la clé API App Store Connect',
    'APP_STORE_ISSUER_ID → Issuer ID App Store Connect',
    'APP_STORE_KEY_PATH  → chemin vers le .p8',
    'Voir .env.ios.example',
  ]);
}
if (!fs.existsSync(APP_STORE_KEY_PATH)) die(`Clé privée introuvable : ${APP_STORE_KEY_PATH}`);

// Xcode range les archives par date : ~/Library/Developer/Xcode/Archives/YYYY-MM-DD/
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const stamp = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}, ${pad(now.getHours())}.${pad(now.getMinutes())}`;

const archivesDir = path.join(os.homedir(), 'Library/Developer/Xcode/Archives', today);
const archivePath = path.join(archivesDir, `${APP_NAME} ${stamp}.xcarchive`);
const exportDir = path.join(os.tmpdir(), 'my-rolling-day-ios-export');
const exportOptionsPlist = path.join(os.tmpdir(), 'MyRollingDayExportOptions.plist');

function writeExportOptions() {
  fs.writeFileSync(
    exportOptionsPlist,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>teamID</key>
  <string>${TEAM_ID}</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>uploadToAppStore</key>
  <true/>
  <key>apiKeyID</key>
  <string>${APP_STORE_KEY_ID}</string>
  <key>apiKeyIssuerID</key>
  <string>${APP_STORE_ISSUER_ID}</string>
</dict>
</plist>`
  );
}

// xcodebuild cherche la clé dans ~/private_keys/AuthKey_<KEY_ID>.p8
function ensurePrivateKey() {
  const dest = path.join(os.homedir(), 'private_keys', `AuthKey_${APP_STORE_KEY_ID}.p8`);
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(APP_STORE_KEY_PATH, dest);
    console.log(c.gray(`   → clé copiée dans ~/private_keys/AuthKey_${APP_STORE_KEY_ID}.p8`));
  }
}

title('ARCHIVE iOS');

ensurePrivateKey();

const { version, build = '1' } = readPkg();
console.log(c.green(`📦 Version ${c.yellow(version)} (build ${c.yellow(build)})`));

fs.mkdirSync(archivesDir, { recursive: true });
fs.mkdirSync(exportDir, { recursive: true });

const auth = [
  `-allowProvisioningUpdates`,
  `-authenticationKeyPath "${APP_STORE_KEY_PATH}"`,
  `-authenticationKeyID "${APP_STORE_KEY_ID}"`,
  `-authenticationKeyIssuerID "${APP_STORE_ISSUER_ID}"`,
];

console.log(c.magenta(`\n🔨 Archive → ${c.cyan(path.basename(archivePath))}`));
console.log(c.gray(`   Workspace : ${WORKSPACE}`));
console.log(c.gray(`   Scheme    : ${SCHEME}`));
execSync(
  [
    'xcodebuild archive',
    `-workspace "${WORKSPACE}"`,
    `-scheme "${SCHEME}"`,
    '-configuration Release',
    `-archivePath "${archivePath}"`,
    `DEVELOPMENT_TEAM=${TEAM_ID}`,
    'CODE_SIGN_STYLE=Automatic',
    ...auth,
  ].join(' \\\n  '),
  { stdio: 'inherit', cwd: ROOT }
);
console.log(c.green(`✅ Archive créée : ${archivePath}`));

console.log(c.magenta('\n🚀 Export + upload vers App Store Connect...'));
writeExportOptions();
execSync(
  [
    'xcodebuild -exportArchive',
    `-archivePath "${archivePath}"`,
    `-exportPath "${exportDir}"`,
    `-exportOptionsPlist "${exportOptionsPlist}"`,
    ...auth,
  ].join(' \\\n  '),
  { stdio: 'inherit', cwd: ROOT }
);

console.log(c.bold(c.green(`\n🎉 Build ${version} (${build}) soumis sur App Store Connect.`)));
