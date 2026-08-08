// Génère src/assets/build-info.json (version, build natif, date, commit).
// Lancé automatiquement par `npm run build` via le lifecycle `prebuild`.

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { ROOT, readPkg, c } from './lib/cli.mjs';

function safe(cmd, fallback = 'unknown') {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], cwd: ROOT }).toString().trim();
  } catch {
    return fallback;
  }
}

// YmdHis en heure locale : l'ID affiché dans l'app reflète l'heure de la machine de build.
const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const buildDate =
  `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
  `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

const pkg = readPkg();

const data = {
  buildDate,
  version: pkg.version || 'unknown',
  build: pkg.build || '1',
  commit: safe('git rev-parse --short HEAD'),
};

const outDir = path.join(ROOT, 'src', 'assets');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'build-info.json'), JSON.stringify(data, null, 2) + '\n', 'utf8');

console.log(c.gray(`build-info.json → ${data.version} (build ${data.build}) ${data.commit}`));
