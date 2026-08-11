/**
 * Build de l'application pour les tests E2E.
 *
 * Depuis la migration Vite (commit 201c442), les sources utilisent des imports
 * npm nus (`import React from "react"`, `import { getAuth } from "firebase/auth"`).
 * Un navigateur ne sait pas les résoudre : servir l'arborescence `src/` telle
 * quelle ne donne plus une application qui démarre. Les tests CDP passent donc
 * par un vrai build Vite, avec Firebase remplacé par les stubs de
 * `tests/fixtures/firebase-stubs/` — ce qui remplace l'ancienne astuce de
 * l'import map, devenue inopérante puisque Firebase n'est plus chargé du CDN.
 *
 * Le build est fait une seule fois par exécution (les fichiers de test
 * partagent le même process avec --experimental-test-isolation=none).
 */

import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..", "..");
const stubsDir = join(projectRoot, "tests", "fixtures", "firebase-stubs");

/** Sortie du build de test — hors `dist/` pour ne pas écraser un build réel. */
export const E2E_DIST_DIR = join(projectRoot, "tests", ".e2e-dist");

const FIREBASE_STUBS = {
  app: "firebase-app.js",
  auth: "firebase-auth.js",
  firestore: "firebase-firestore.js",
  functions: "firebase-functions.js",
  messaging: "firebase-messaging.js",
  analytics: "firebase-analytics.js",
  storage: "firebase-storage.js",
};

let buildPromise = null;

/**
 * Construit l'application (une fois) et renvoie le dossier à servir.
 * Le résultat est mémoïsé : les appels suivants réutilisent le même build.
 */
export function buildE2eApp() {
  if (!buildPromise) buildPromise = runBuild();
  return buildPromise;
}

async function runBuild() {
  // Import dynamique : `vite` est une devDependency, inutile de la charger
  // pour les tests unitaires purs.
  const { build } = await import("vite");

  await build({
    root: projectRoot,
    logLevel: "silent",
    resolve: {
      alias: Object.entries(FIREBASE_STUBS).map(([moduleName, fileName]) => ({
        find: new RegExp(`^firebase/${moduleName}$`),
        replacement: join(stubsDir, fileName),
      })),
    },
    build: {
      outDir: E2E_DIST_DIR,
      emptyOutDir: true,
      // Build de test : lisible dans les traces, et plus rapide.
      minify: false,
      sourcemap: false,
      chunkSizeWarningLimit: 100_000,
    },
  });

  return E2E_DIST_DIR;
}
