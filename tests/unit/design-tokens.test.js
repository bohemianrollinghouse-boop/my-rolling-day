/* Garde anti-régression du système de couleurs.
   Chaque test ici correspond à un bug réellement rencontré : ce ne sont
   pas des règles de style abstraites. Si l'un casse, relire le commentaire
   du test avant de l'assouplir. */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const SRC = fileURLToPath(new URL("../../src/", import.meta.url));
const STYLES = join(SRC, "styles.css");
const css = readFileSync(STYLES, "utf8");

function jsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...jsFiles(full));
    else if (entry.endsWith(".js")) out.push(full);
  }
  return out;
}

const JS = jsFiles(SRC).map((file) => ({
  file: file.slice(SRC.length).replace(/\\/g, "/"),
  lines: readFileSync(file, "utf8").split(/\r?\n/),
}));

function scanJs(predicate) {
  const hits = [];
  for (const { file, lines } of JS) {
    lines.forEach((line, i) => {
      if (predicate(line)) hits.push(`${file}:${i + 1}`);
    });
  }
  return hits;
}

/* ── 1. Tout token --mrd-* utilisé doit être défini ──────────────────
   Quatre tokens (--mrd-card, --mrd-hover, --mrd-accent, --mrd-sans)
   étaient référencés sans exister : var() sans repli tombe alors sur
   la valeur héritée, silencieusement. */
test("design : aucun token --mrd-* utilisé sans être défini", () => {
  const defined = new Set(
    [...css.matchAll(/^\s*(--mrd-[A-Za-z0-9-]+)\s*:/gm)].map((m) => m[1])
  );
  const used = new Set(
    [...css.matchAll(/var\((--mrd-[A-Za-z0-9-]+)/g)].map((m) => m[1])
  );
  for (const { lines } of JS) {
    for (const line of lines) {
      for (const m of line.matchAll(/var\((--mrd-[A-Za-z0-9-]+)/g)) used.add(m[1]);
    }
  }
  const missing = [...used].filter((t) => !defined.has(t)).sort();
  assert.deepEqual(missing, [], `tokens utilisés mais non définis : ${missing.join(", ")}`);
});

/* ── 2. --mrd-a ne remplit jamais sous du texte clair ────────────────
   En sombre --mrd-a est CLAIR (L 73.5%) : c'est une couleur de texte.
   Un aplat portant du texte blanc doit utiliser --mrd-aBtn, sans quoi
   le contraste tombe à ~2:1. Vérifié ligne à ligne, ce qui suffit :
   les styles inline de ce projet tiennent sur une ligne. */
test("design : --mrd-a ne sert pas de fond sous du texte clair", () => {
  const light = /color:\s*("?)var\(--mrd-white\)|color:\s*"#fff/;
  const fill = /background(-color)?:\s*[^;,]*var\(--mrd-a\)/;

  const cssHits = css
    .split(/\r?\n/)
    .map((line, i) => (fill.test(line) && light.test(line) ? `styles.css:${i + 1}` : null))
    .filter(Boolean);
  const jsHits = scanJs((line) => fill.test(line) && light.test(line));

  assert.deepEqual(
    [...cssHits, ...jsHits],
    [],
    "utiliser var(--mrd-aBtn) pour un aplat portant du texte clair"
  );
});

/* ── 3. Pas d'alpha hex concaténée sur une variable CSS ──────────────
   (person.color || "var(--mrd-a)") + "15" donne "var(--mrd-a)15" dès
   que le repli s'active : CSS invalide, donc fond transparent. Le repli
   d'une expression concaténée doit être un vrai hex. */
test("design : pas d'alpha hex concaténée sur un var() CSS", () => {
  const bad = /"var\(--[^"]*"\s*\)?\s*\+\s*"[0-9a-fA-F]{2}"/;
  assert.deepEqual(
    scanJs((line) => bad.test(line)),
    [],
    "le repli doit être un hex (ex. DEFAULT_MEMBER_COLOR), pas un var() CSS"
  );
});

/* ── 4. Le blanc passe par le token ──────────────────────────────────
   --mrd-white n'est pas #fff pur : il est légèrement chaud, et vire en
   sombre. Écrire "#fff" en dur casse cette adaptation. */
test("design : pas de #fff en dur dans le JS", () => {
  assert.deepEqual(
    scanJs((line) => /"#f{3,6}"/i.test(line)),
    [],
    "utiliser var(--mrd-white)"
  );
});

/* ── 5. Sources uniques ──────────────────────────────────────────────
   BADGE_PALETTE (40 valeurs) a longtemps été recopiée dans deux
   fichiers, et le repli de couleur membre dupliqué 17 fois. */
test("design : BADGE_PALETTE n'est définie qu'à un seul endroit", () => {
  const owners = JS.filter(({ lines }) =>
    lines.some((l) => /(export\s+)?const BADGE_PALETTE\s*=\s*\[/.test(l))
  ).map((f) => f.file);
  assert.deepEqual(owners, ["constants.js"]);
});

test("design : le repli de couleur membre n'est écrit qu'une fois", () => {
  const owners = scanJs((line) => /#8B7355/i.test(line)).map((h) => h.split(":")[0]);
  assert.deepEqual([...new Set(owners)], ["constants.js"]);
});
