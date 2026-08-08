// Petits utilitaires partagés par les scripts de release.
// Zéro dépendance : couleurs ANSI + prompt readline + parseur .env minimal.

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const wrap = (code) => (s) => `\x1b[${code}m${s}\x1b[0m`;

export const c = {
  red: wrap(31),
  green: wrap(32),
  yellow: wrap(33),
  blue: wrap(34),
  magenta: wrap(35),
  cyan: wrap(36),
  gray: wrap(90),
  bold: wrap(1),
};

/** Racine du projet (dossier app/), quel que soit le cwd d'appel. */
export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const pkgPath = path.join(ROOT, 'package.json');

export const readPkg = () => JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

export const writePkg = (pkg) =>
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

/** Charge un fichier .env dans process.env s'il existe (n'écrase pas l'existant). */
export function loadEnv(file) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) return false;
  for (const line of fs.readFileSync(full, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
  return true;
}

/** Pose une question au terminal. Retourne la réponse trimmée. */
export function prompt() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return {
    ask: (q) => new Promise((r) => rl.question(c.cyan(q), (a) => r(a.trim()))),
    close: () => rl.close(),
  };
}

/** true si la réponse vaut oui (défaut : oui). */
export const yes = (answer) => !['n', 'no', 'non'].includes(answer.toLowerCase());

export function title(text) {
  const bar = '='.repeat(Math.max(30, text.length + 6));
  console.log(c.yellow(`\n${bar}\n   ${text}\n${bar}`));
}

export function die(message, hints = []) {
  console.error(c.red(`❌ ${message}`));
  hints.forEach((h) => console.error(c.gray(`   ${h}`)));
  process.exit(1);
}
