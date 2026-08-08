// Build web prod + cap sync ios + écriture de MARKETING_VERSION / CURRENT_PROJECT_VERSION
// depuis package.json (version / build), puis ouverture de Xcode.

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { c, ROOT, readPkg, title } from './lib/cli.mjs';

const pbxprojPath = path.join(ROOT, 'ios/App/App.xcodeproj/project.pbxproj');

const { version, build = '1' } = readPkg();

title('PREPARE iOS RELEASE');
console.log(c.green(`🔼 Version ${c.yellow(version)} (build ${c.yellow(build)})`));

console.log(c.gray('🛑 Fermeture de Xcode (si ouvert)...'));
try {
  execSync(`osascript -e 'tell application "Xcode" to quit'`);
  console.log(c.green('✅ Xcode fermé'));
} catch {
  console.log(c.yellow('⚠️  Xcode n\'était pas ouvert'));
}

console.log(c.magenta('🛠  Build web (production)...'));
execSync('npm run build', { stdio: 'inherit', cwd: ROOT });

console.log(c.magenta('🔄 cap sync ios...'));
execSync('npx cap sync ios', { stdio: 'inherit', cwd: ROOT });

console.log(c.magenta('📦 Mise à jour des versions dans le projet Xcode...'));
let pbxproj = fs.readFileSync(pbxprojPath, 'utf8');
pbxproj = pbxproj.replace(/MARKETING_VERSION = [\d.]+;/g, `MARKETING_VERSION = ${version};`);
pbxproj = pbxproj.replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${build};`);
fs.writeFileSync(pbxprojPath, pbxproj);

console.log(c.cyan('🚀 Ouverture de Xcode...'));
execSync('npx cap open ios', { stdio: 'inherit', cwd: ROOT });

console.log(c.bold(c.green(`✅ iOS prêt : ${version} (build ${build})`)));
console.log(c.gray('   Archive + upload automatisés : npm run archive:ios'));
