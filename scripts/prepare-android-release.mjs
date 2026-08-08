// Build web prod + cap sync android + écriture de versionCode / versionName dans
// build.gradle depuis package.json, puis génération de l'AAB de release.
//
// Signature : android/keystore.properties (non versionné, cf. keystore.properties.example).
// Sans ce fichier l'AAB est produit non signé — inutilisable pour un upload Play.

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { c, ROOT, readPkg, title } from './lib/cli.mjs';

const androidPath = path.join(ROOT, 'android');
const gradleBuildFile = path.join(androidPath, 'app/build.gradle');
const keystoreProps = path.join(androidPath, 'keystore.properties');

const { version, build = '1' } = readPkg();

title('PREPARE ANDROID RELEASE');
console.log(c.green(`🔼 Version ${c.yellow(version)} (versionCode ${c.yellow(build)})`));

console.log(c.magenta('🛠  Build web (production)...'));
execSync('npm run build', { stdio: 'inherit', cwd: ROOT });

console.log(c.magenta('🔄 cap sync android...'));
execSync('npx cap sync android', { stdio: 'inherit', cwd: ROOT });

console.log(c.magenta('📝 Mise à jour de versionCode / versionName dans build.gradle...'));
let gradle = fs.readFileSync(gradleBuildFile, 'utf8');
gradle = gradle.replace(/versionCode \d+/g, `versionCode ${build}`);
gradle = gradle.replace(/versionName ".*?"/g, `versionName "${version}"`);
fs.writeFileSync(gradleBuildFile, gradle);

if (fs.existsSync(keystoreProps)) {
  console.log(c.cyan('🔐 Signature via android/keystore.properties.'));
} else {
  console.log(c.yellow('⚠️  Pas de android/keystore.properties → AAB NON signé.'));
  console.log(c.gray('   Copie android/keystore.properties.example et renseigne-le pour signer.'));
}

console.log(c.cyan('🏗  Build de l\'AAB de release...'));
execSync('./gradlew bundleRelease', { cwd: androidPath, stdio: 'inherit' });

console.log(c.green('✅ AAB prêt :'));
console.log(c.yellow('   android/app/build/outputs/bundle/release/app-release.aab'));
console.log(c.bold(c.green(`🎉 Android prêt : ${version} (versionCode ${build})`)));
console.log(c.gray('   Upload : npm run upload:android'));
