// Garde-fou de structure — la contrepartie exécutable de docs/ARCHITECTURE.md.
//
// Le refactor de structure (inspiré de COBA) n'a de valeur que s'il tient dans
// le temps. Un dossier bien nommé ne se défend pas tout seul : il suffit d'un
// import qui remonte d'une couche pour que `utils/` se mette à dépendre d'un
// écran, et plus rien ne distingue la nouvelle arborescence de l'ancienne.
//
// Ce fichier lit les imports relatifs réels et vérifie deux choses :
//   1. les dépendances ne remontent jamais vers une couche plus haute ;
//   2. `config/` reste une feuille (données pures, aucune dépendance).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname, relative, resolve, sep } from "node:path";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SRC = join(ROOT, "src");

// Rang croissant = couche plus haute. Un module peut importer son propre rang
// ou un rang strictement inférieur, jamais au-dessus.
const LAYERS = [
  ["src/environments/", "environments", 0],
  ["src/app/config/", "config", 0],
  ["src/app/utils/", "utils", 1],
  ["src/app/plugins/", "plugins", 1],
  ["src/app/providers/", "providers", 2],
  ["src/app/hooks/", "hooks", 3],
  ["src/app/components/", "components", 4],
  ["src/app/modals/", "modals", 5],
  ["src/app/pages/", "pages", 6],
];

// Coquille applicative : `lib.js` (liaison React+htm) et `routes.js` (table de
// routes pure) sont des primitives, `App.js` orchestre tout, `main.js` monte.
const FILE_LAYERS = new Map([
  ["src/app/lib.js", ["shell", 1]],
  ["src/app/routes.js", ["shell", 1]],
  ["src/app/App.js", ["App", 7]],
  ["src/main.js", ["main", 8]],
]);

function toPosix(p) {
  return p.split(sep).join("/");
}

function classify(absPath) {
  const rel = toPosix(relative(ROOT, absPath));
  if (FILE_LAYERS.has(rel)) {
    const [name, rank] = FILE_LAYERS.get(rel);
    return { name, rank, rel };
  }
  for (const [prefix, name, rank] of LAYERS) {
    if (rel.startsWith(prefix)) return { name, rank, rel };
  }
  return { name: null, rank: null, rel };
}

function jsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...jsFiles(full));
    else if (entry.endsWith(".js")) out.push(full);
  }
  return out;
}

const FILES = jsFiles(SRC);

// Seuls les imports relatifs nous intéressent : les paquets npm n'ont pas de
// couche. Les `.svg` non plus (Vite les transforme en URL).
function relativeImports(absPath) {
  const text = readFileSync(absPath, "utf8");
  const specs = [];
  const patterns = [
    /from\s*["'](\.[^"']*)["']/g,
    /import\s*\(\s*["'](\.[^"']*)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) specs.push(match[1]);
  }
  return specs
    .filter((spec) => spec.endsWith(".js"))
    .map((spec) => resolve(dirname(absPath), spec));
}

test("tous les fichiers de src/ appartiennent a une couche connue", () => {
  const orphans = FILES.map(classify)
    .filter((c) => c.rank === null)
    .map((c) => c.rel);
  assert.deepEqual(
    orphans,
    [],
    "fichiers hors arborescence documentee (voir docs/ARCHITECTURE.md) :\n"
      + orphans.join("\n"),
  );
});

test("aucune dependance ne remonte vers une couche plus haute", () => {
  const violations = [];
  for (const file of FILES) {
    const from = classify(file);
    if (from.rank === null) continue;
    for (const target of relativeImports(file)) {
      const to = classify(target);
      if (to.rank === null) continue;
      if (to.rank > from.rank) {
        violations.push(`${from.rel} (${from.name}) -> ${to.rel} (${to.name})`);
      }
    }
  }
  assert.deepEqual(
    violations,
    [],
    "imports qui remontent d'une couche :\n" + violations.join("\n"),
  );
});

test("config/ reste une feuille : donnees pures, aucune dependance", () => {
  const offenders = [];
  for (const file of FILES) {
    const from = classify(file);
    if (from.name !== "config") continue;
    for (const target of relativeImports(file)) {
      const to = classify(target);
      if (to.name !== "config") offenders.push(`${from.rel} -> ${to.rel}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "config/ doit rester sans dependance :\n" + offenders.join("\n"),
  );
});

test("la racine de src/app/ ne contient que la coquille applicative", () => {
  const atRoot = readdirSync(join(SRC, "app"))
    .filter((entry) => entry.endsWith(".js"))
    .sort();
  assert.deepEqual(
    atRoot,
    ["App.js", "lib.js", "routes.js"],
    "un nouveau fichier a la racine de src/app/ doit rejoindre une couche",
  );
});
