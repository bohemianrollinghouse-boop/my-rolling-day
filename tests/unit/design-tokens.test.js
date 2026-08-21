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

/* La passerelle Ionic ne définit aucune couleur : elle branche les `--ion-*`
   sur les tokens `--mrd-*`. Ses `var()` doivent donc être vérifiés comme ceux
   de styles.css — un token mal orthographié y serait invisible autrement. */
const IONIC_BRIDGE = join(SRC, "theme", "ionic-bridge.css");
const bridgeCss = readFileSync(IONIC_BRIDGE, "utf8");

/* Retire les commentaires CSS en conservant le nombre de lignes, pour que les
   numéros de ligne rapportés restent justes.

   Indispensable, et pas cosmétique : les commentaires de ce projet citent des
   noms de tokens (« pendant de --mrd-aBtn : sauge sûre… »). Un regex de
   déclaration appliqué au texte brut matche cette citation, puis son `[^;]+`
   engloutit tout jusqu'au premier `;` — c'est-à-dire la vraie déclaration qui
   suit, qui disparaît alors de l'analyse sans que rien ne le signale. */
function stripCssComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
}

const cssNoComments = stripCssComments(css);
const bridgeNoComments = stripCssComments(bridgeCss);

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
  for (const m of bridgeCss.matchAll(/var\((--mrd-[A-Za-z0-9-]+)/g)) used.add(m[1]);
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


/* ── 7. La passerelle Ionic ne contient aucune couleur ───────────────
   `theme/ionic-bridge.css` a une seule raison d'être : brancher les
   variables d'Ionic sur les tokens `--mrd-*`. Dès qu'une valeur y est
   écrite en dur, il devient un second endroit où vivent les couleurs,
   et le thème sombre cesse de suivre — c'est exactement le piège que
   les tokens existent pour éviter. */
test("design : la passerelle Ionic n'écrit aucune couleur en dur", () => {
  const offenders = [];
  bridgeNoComments.split(/\r?\n/).forEach((line, index) => {
    if (!line.includes(":")) return;
    if (/#[0-9a-fA-F]{3,8}\b|oklch\(|rgba?\(|hsla?\(/.test(line)) {
      offenders.push(`ionic-bridge.css:${index + 1} → ${line.trim()}`);
    }
  });
  assert.deepEqual(offenders, [], `couleurs en dur dans la passerelle :\n${offenders.join("\n")}`);
});

/* ── 8. Toute variable Ionic pointe sur un token --mrd-* ─────────────
   Une `--ion-*` laissée à une valeur brute (ou oubliée) rend un
   composant Ionic hors palette, et le défaut ne se voit qu'en sombre. */
test("design : chaque --ion-* de la passerelle passe par un var(--mrd-*)", () => {
  const offenders = [];
  for (const match of bridgeNoComments.matchAll(/^\s*(--ion-[a-z0-9-]+)\s*:\s*([^;]+);/gm)) {
    const [, name, value] = match;
    if (!value.includes("var(--mrd-")) offenders.push(`${name}: ${value.trim()}`);
  }
  assert.deepEqual(offenders, [], `variables Ionic sans token :\n${offenders.join("\n")}`);
});

/* ── 9. Les triplets sRGB collent à leurs oklch ───────────────────────
   Ionic exprime ses états en `rgba(var(--ion-color-X-rgb), .08)` et
   `rgb()` ne sait pas manger d'oklch : les couleurs de marque existent
   donc dans les deux représentations. Deux représentations, c'est une
   dérive possible — ce test refait la conversion oklch → sRGB et
   compare, dans les deux thèmes. Changer un oklch sans son triplet
   casse ici, plutôt que de délaver un bouton en silence. */
test("design : les tokens --mrd-*Rgb correspondent à leurs oklch", () => {
  /* Conversion oklch → sRGB (Björn Ottosson). Réimplémentée ici plutôt
     qu'importée : le test doit être un juge indépendant du code testé. */
  function oklchToSrgb(L, C, hDeg) {
    const h = (hDeg * Math.PI) / 180;
    const a = C * Math.cos(h);
    const b = C * Math.sin(h);
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    const l = l_ ** 3, m = m_ ** 3, sCube = s_ ** 3;
    const lr =  4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * sCube;
    const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * sCube;
    const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * sCube;
    const gamma = (v) => {
      const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
      return Math.max(0, Math.min(255, Math.round(c * 255)));
    };
    return [gamma(lr), gamma(lg), gamma(lb)];
  }

  /** Tokens d'un bloc de déclarations : { nom → valeur }. */
  function tokensOfBlock(block) {
    const out = {};
    for (const m of block.matchAll(/(--mrd-[A-Za-z0-9-]+)\s*:\s*([^;]+);/g)) {
      out[m[1]] = m[2].trim();
    }
    return out;
  }

  const rootStart = cssNoComments.indexOf(":root {");
  const rootBlock = cssNoComments.slice(rootStart, cssNoComments.indexOf("\n}", rootStart));
  const darkStart = cssNoComments.indexOf('html[data-theme="dark"] {');
  const darkBlock = cssNoComments.slice(darkStart, cssNoComments.indexOf("\n}", darkStart));

  const failures = [];
  for (const [themeName, block] of [["clair", rootBlock], ["sombre", darkBlock]]) {
    const tokens = tokensOfBlock(block);
    for (const [name, value] of Object.entries(tokens)) {
      if (!name.endsWith("Rgb")) continue;
      const base = name.slice(0, -3);
      const oklch = tokens[base];
      assert.ok(oklch, `${themeName} : ${name} existe mais pas ${base}`);
      const parsed = oklch.match(/oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)/);
      assert.ok(parsed, `${themeName} : ${base} n'est pas un oklch analysable (${oklch})`);
      const expected = oklchToSrgb(Number(parsed[1]) / 100, Number(parsed[2]), Number(parsed[3]));
      const actual = value.split(/\s+/).map(Number);
      const drift = expected.map((e, i) => Math.abs(e - actual[i]));
      // 1 point de tolérance : arrondi de la conversion, pas une dérive.
      if (drift.some((d) => d > 1)) {
        failures.push(`${themeName} : ${name} = ${actual.join(" ")} mais ${base} donne ${expected.join(" ")}`);
      }
    }
  }
  assert.deepEqual(failures, [], `triplets sRGB désynchronisés :\n${failures.join("\n")}`);
});

/* ── 10. Les deux thèmes portent le même jeu de triplets ─────────────
   Un triplet défini en clair mais oublié en sombre laisse la valeur
   claire fuiter dans le thème sombre, sans erreur nulle part. */
test("design : les triplets sRGB existent dans les deux thèmes", () => {
  const light = new Set([...cssNoComments.matchAll(/^\s*(--mrd-[A-Za-z0-9]+Rgb)\s*:/gm)].map((m) => m[1]));
  const darkStart = cssNoComments.indexOf('html[data-theme="dark"] {');
  const darkBlock = cssNoComments.slice(darkStart, cssNoComments.indexOf("\n}", darkStart));
  const dark = new Set([...darkBlock.matchAll(/(--mrd-[A-Za-z0-9]+Rgb)\s*:/g)].map((m) => m[1]));

  assert.ok(dark.size > 0, "aucun triplet sRGB dans le bloc sombre");
  const missing = [...light].filter((t) => !dark.has(t)).sort();
  assert.deepEqual(missing, [], `triplets absents du thème sombre : ${missing.join(", ")}`);
});


/* ── 11. La passerelle couvre les surcharges de mode d'Ionic ─────────
   Bug réel, trouvé par `tests/e2e/ionic-theme.test.js` : la palette
   sombre d'Ionic ne se contente pas de `.ion-palette-dark`, elle ajoute
   un bloc `.ion-palette-dark.ios` (et `.md`) pour les fonds et le
   texte. Deux classes, spécificité (0,2,0), contre (0,1,0) pour
   `:root` — le bloc d'Ionic battait donc la passerelle et le thème
   sombre affichait `#000000` au lieu du brun de la marque. Invisible
   pour tous les autres tests unitaires : le fichier était correct, la
   cascade non.

   Ce test lit la palette d'Ionic dans `node_modules` et exige que toute
   variable qu'elle surcharge à haute spécificité **et** que la
   passerelle prétend piloter soit réaffirmée au même niveau. Il tient
   donc aussi au prochain `npm update` d'Ionic : si Ionic déplace une
   variable de plus dans ce bloc, le test tombe. */
test("design : la passerelle couvre les surcharges de mode d'Ionic", () => {
  const palettePath = fileURLToPath(
    new URL("../../node_modules/@ionic/react/css/palettes/dark.class.css", import.meta.url),
  );
  let palette;
  try {
    palette = readFileSync(palettePath, "utf8");
  } catch (error) {
    // Palette introuvable : @ionic/react pas installé (CI sans install
    // complète). Rien à vérifier plutôt qu'un faux échec.
    return;
  }

  /** Variables surchargées par les blocs spécifiques au mode. */
  const modeOverridden = new Set();
  for (const selector of [".ion-palette-dark.ios", ".ion-palette-dark.md"]) {
    const start = palette.indexOf(`${selector}{`);
    if (start === -1) continue;
    const body = palette.slice(start + selector.length + 1, palette.indexOf("}", start));
    for (const declaration of body.split(";")) {
      const name = declaration.split(":")[0].trim();
      if (name.startsWith("--ion-")) modeOverridden.add(name);
    }
  }
  assert.ok(modeOverridden.size > 0, "aucune surcharge de mode trouvée : le format de la palette Ionic a changé");

  /* Ce que la passerelle pilote dans son bloc `:root`. */
  const bridgeRootStart = bridgeNoComments.indexOf(":root {");
  const bridgeRoot = bridgeNoComments.slice(bridgeRootStart, bridgeNoComments.indexOf("\n}", bridgeRootStart));
  const bridgeClaims = new Set(
    [...bridgeRoot.matchAll(/^\s*(--ion-[a-z0-9-]+)\s*:/gm)].map((m) => m[1]),
  );

  /* Ce que la passerelle réaffirme à spécificité égale. */
  const reassertStart = bridgeNoComments.indexOf(".ion-palette-dark.ios");
  assert.notEqual(reassertStart, -1, "la passerelle doit réaffirmer les variables de mode (bloc .ion-palette-dark.ios)");
  const reassertBlock = bridgeNoComments.slice(reassertStart);
  const reasserted = new Set(
    [...reassertBlock.matchAll(/^\s*(--ion-[a-z0-9-]+)\s*:/gm)].map((m) => m[1]),
  );

  /* Les `*-step-*` sont volontairement laissées à Ionic : 40 nuances
     dérivées qu'on ne veut pas recopier. Seules les variables
     sémantiques comptent. */
  const missing = [...modeOverridden]
    .filter((name) => bridgeClaims.has(name))
    .filter((name) => !name.includes("-step-"))
    .filter((name) => !reasserted.has(name))
    .sort();

  assert.deepEqual(
    missing,
    [],
    `Ionic surcharge ces variables en (0,2,0) et la passerelle ne les réaffirme pas — `
      + `elles resteront aux valeurs d'Ionic en sombre : ${missing.join(", ")}`,
  );
});
