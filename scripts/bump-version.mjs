// Bump interactif de la version (package.json: version + build natif).
// Le "build" est le numéro incrémental exigé par App Store Connect / Google Play :
// il n'est incrémenté que pour un build natif (toute soumission stores).

import { execSync } from 'child_process';
import { c, readPkg, writePkg, prompt, yes, title } from './lib/cli.mjs';

const pkg = readPkg();
const original = JSON.stringify(pkg, null, 2) + '\n';
const currentVersion = pkg.version || '1.0.0';
const currentBuild = parseInt(pkg.build || '1', 10);
const [major, minor, patch] = currentVersion.split('.').map(Number);

const { ask, close } = prompt();

title('BUMP VERSION');
console.log(`Version actuelle : ${c.yellow(currentVersion)} (build ${c.yellow(currentBuild)})`);
console.log(c.gray('\n  [1] Patch  → correctif      (ex: 1.2.0 → 1.2.1)'));
console.log(c.gray('  [2] Minor  → nouveautés     (ex: 1.2.1 → 1.3.0)'));
console.log(c.gray('  [3] Major  → refonte        (ex: 1.2.1 → 2.0.0)'));
console.log(c.gray('  [4] Manuel → saisir la version à la main'));
console.log(c.gray('  [5] Build  → build natif uniquement (version inchangée)\n'));

let written = false;

try {
  const choice = await ask('Choix [1/2/3/4/5] : ');

  let newVersion;
  if (choice === '1') newVersion = `${major}.${minor}.${patch + 1}`;
  else if (choice === '2') newVersion = `${major}.${minor + 1}.0`;
  else if (choice === '3') newVersion = `${major + 1}.0.0`;
  else if (choice === '4') newVersion = (await ask(`Version manuelle [${currentVersion}] : `)) || currentVersion;
  else if (choice === '5') newVersion = currentVersion;
  else {
    console.log(c.red('Choix invalide.'));
    process.exit(1);
  }

  if (!/^\d+\.\d+\.\d+$/.test(newVersion)) {
    console.log(c.red(`Version invalide : ${newVersion} (attendu x.y.z)`));
    process.exit(1);
  }

  const newBuild = currentBuild + 1;

  console.log(c.green(`\n→ Version : ${c.yellow(newVersion)}`));
  console.log(c.green(`→ Build   : ${c.yellow(newBuild)} ${c.gray('(incrémenté — requis par les stores)')}`));

  if (!yes(await ask('\nConfirmer ? [O/n] : '))) {
    console.log(c.yellow('Annulé.'));
    process.exit(0);
  }

  pkg.version = newVersion;
  pkg.build = String(newBuild);
  writePkg(pkg);
  written = true;
  console.log(c.bold(c.green(`\n✅ package.json : ${newVersion} (build ${newBuild})`)));

  execSync('npm run prebuild', { stdio: 'inherit' });

  if (yes(await ask('\nCommiter le bump ? [O/n] : '))) {
    execSync('git add -A', { stdio: 'inherit' });
    execSync(`git commit -m "chore: bump version ${newVersion} (build ${newBuild})"`, { stdio: 'inherit' });
    console.log(c.green('✅ Bump commité.'));
  }

  console.log(c.blue('\n💡 Étape suivante :'));
  console.log(c.gray('   npm run prepare:releases     # build + sync + versions natives (iOS & Android)'));
  console.log(c.gray('   npm run archive:ios          # archive + upload App Store Connect'));
  console.log(c.gray('   npm run upload:android       # upload de l\'AAB sur Google Play'));

  if (yes(await ask('\nLancer prepare:releases maintenant ? [O/n] : '))) {
    close();
    execSync('npm run prepare:releases', { stdio: 'inherit' });
  }
} catch (error) {
  if (written) {
    writePkg(JSON.parse(original));
    console.log(c.yellow('↩️  package.json restauré après erreur.'));
  }
  throw error;
} finally {
  close();
}
