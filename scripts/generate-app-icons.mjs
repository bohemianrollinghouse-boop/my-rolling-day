#!/usr/bin/env node
/**
 * Génère les icônes natives iOS et Android depuis la source vectorielle.
 *
 * Source unique : `src/assets/brand/icon.svg` — l'icône d'application.
 *
 * **Ne pas confondre avec `favicon.svg`.** Le dépôt porte deux dessins voisins
 * mais distincts, et les avoir confondus est précisément le bug que ce
 * changement corrige :
 *
 *  - `favicon.svg` est le favicon 32 px. Trait épais (8,4 % du diamètre de
 *    l'anneau) et motif large (64,5 % du canevas) pour rester lisible dans un
 *    onglet de navigateur.
 *  - `icon.svg` est l'icône d'application. Trait fin (3,6 %) et motif à 56,6 %
 *    du canevas — le dessin de `icon-512.png`, `icon-192.png` et
 *    `icon-maskable-512.png`, c'est-à-dire les icônes que le manifeste PWA
 *    déclare, et la famille du logo affiché dans l'app (`mark.svg`).
 *
 * Ce script partait de `favicon.svg` : les icônes de l'écran d'accueil iOS et
 * Android étaient donc le favicon agrandi, visiblement plus gras que l'icône du
 * même produit installé depuis le web. C'est vérifiable dans les deux sens :
 * rastériser `favicon.svg` en 1024 redonnait l'ancienne icône iOS au pixel près
 * (RMSE 0), et `icon.svg` rendu en 512 et 192 redonne `icon-512.png` et
 * `icon-192.png` à l'antialiasing près (RMSE ~1,5 %, emprise du motif
 * identique au pixel : 290×305 et 110×115).
 *
 * **Le vecteur reste la source de vérité.** Une version antérieure de ce script
 * partait de `icon-512.png` et agrandissait en 1024 : l'écart-type du laplacien
 * tombait de 11,97 à 4,10, soit trois fois moins net. Ne pas repasser sur un
 * raster.
 *
 * Pourquoi ce script existe : les trois jeux d'icônes avaient été produits à la
 * main et ne concordaient pas. Le motif occupait 67,7 % de l'icône sur iOS,
 * 68 % sur l'icône héritée Android, mais seulement 46 % de la zone visible de
 * l'icône adaptative — visiblement plus petit sur un écran d'accueil Android
 * que sur iOS. Une source, plus de dérive.
 *
 * Les deux systèmes ne se pilotent pas pareil :
 *
 *  - **iOS** veut l'icône complète (fond compris) en 1024×1024, **sans**
 *    transparence ni coins déjà arrondis : iOS applique son propre masque, et
 *    l'App Store refuse une icône transparente. `icon.svg` est donc dessiné en
 *    carré plein, sans `rx`.
 *  - **Android** veut une icône *adaptative* : le fond est une couleur
 *    (`ic_launcher_background`) et le premier plan un PNG transparent de
 *    108 dp. Le lanceur n'en affiche que les 72 dp centraux (288 px sur 432) —
 *    les 18 dp de marge servent au masquage et à la parallaxe. Le motif se
 *    dimensionne donc par rapport à cette zone visible, pas au canevas.
 *
 * Ce cadrage à 2/3 concorde avec `icon-maskable-512.png`, l'icône maskable du
 * web : le motif y occupe 56,1 % de la zone sûre, contre 56,6 % de la zone
 * visible ici. Même dessin, même respiration sur les deux plateformes.
 *
 * Aucun facteur d'échelle à régler : le cadrage du motif dans la zone visible
 * d'Android est celui du SVG lui-même, puisque c'est le même fichier privé de
 * son fond. Modifier le SVG suffit, le script suit.
 *
 * Requiert ImageMagick (`magick`) et librsvg (`rsvg-convert`).
 * Usage : `npm run icons`.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ICON_SVG = join(ROOT, "src/assets/brand/icon.svg");

const BACKGROUND = "srgb(184,95,74)"; // #B85F4A — égal à ic_launcher_background.xml

/* Densités Android. Canevas adaptatif 108 dp, icône héritée 48 dp. */
const DENSITIES = [
  { dir: "mipmap-mdpi", adaptive: 108, legacy: 48 },
  { dir: "mipmap-hdpi", adaptive: 162, legacy: 72 },
  { dir: "mipmap-xhdpi", adaptive: 216, legacy: 96 },
  { dir: "mipmap-xxhdpi", adaptive: 324, legacy: 144 },
  { dir: "mipmap-xxxhdpi", adaptive: 432, legacy: 432 * 48 / 108 },
];

const WORK = join(tmpdir(), "mrd-icons");

function magick(args) {
  execFileSync("magick", args, { stdio: ["ignore", "pipe", "inherit"] });
}

function rasterise(svgPath, size, outPath) {
  execFileSync("rsvg-convert", ["-w", String(size), "-h", String(size), svgPath, "-o", outPath]);
}

function requireTool(name, hint) {
  try {
    execFileSync(name, ["--version"], { stdio: "ignore" });
  } catch {
    console.error(`${name} est requis (${hint}).`);
    process.exit(1);
  }
}

function main() {
  requireTool("magick", "brew install imagemagick");
  requireTool("rsvg-convert", "brew install librsvg");
  if (!existsSync(ICON_SVG)) {
    console.error(`Source absente : ${ICON_SVG}`);
    process.exit(1);
  }

  mkdirSync(WORK, { recursive: true });

  /* iOS applique son propre masque : l'icône livrée doit être un carré plein.
     `icon.svg` est déjà dessiné ainsi ; le retrait d'un éventuel `rx` reste
     là comme garde-fou si quelqu'un arrondit le fond un jour. */
  const squareSvg = join(WORK, "icon-square.svg");
  const svgText = readFileSync(ICON_SVG, "utf8");
  writeFileSync(squareSvg, svgText.replace(/\s+rx="[^"]*"/g, ""));

  /* Motif seul : le même SVG privé de son `<rect>` de fond. Il garde donc le
     cadrage et les épaisseurs de trait exacts de l'icône — ce que ne fait pas
     `mark-white.svg`, dessiné plus fin. */
  const markSvg = join(WORK, "mark.svg");
  const markText = svgText.replace(/<rect\b[^>]*\/?>(?:<\/rect>)?/g, "");
  if (markText === svgText) {
    console.error("icon.svg : aucun <rect> de fond trouvé, le motif ne peut pas être isolé.");
    process.exit(1);
  }
  writeFileSync(markSvg, markText);

  // ── iOS : icône complète en 1024 ────────────────────────────────────────
  const iosDir = join(ROOT, "ios/App/App/Assets.xcassets/AppIcon.appiconset");
  mkdirSync(iosDir, { recursive: true });
  const iosIcon = join(iosDir, "AppIcon-512@2x.png");
  rasterise(squareSvg, 1024, iosIcon);
  // Aplatir tout canal alpha résiduel : l'App Store refuse la transparence.
  magick([iosIcon, "-background", BACKGROUND, "-alpha", "remove", "-alpha", "off", iosIcon]);
  console.log("ios      AppIcon-512@2x.png 1024x1024 (depuis icon.svg)");

  // ── Android ─────────────────────────────────────────────────────────────
  for (const { dir, adaptive, legacy } of DENSITIES) {
    const outDir = join(ROOT, "android/app/src/main/res", dir);
    mkdirSync(outDir, { recursive: true });
    const legacySize = Math.round(legacy);

    /* Premier plan adaptatif : le motif rendu à la taille de la **zone
       visible** (72 dp sur 108), puis centré sur le canevas transparent. Le
       cadrage à l'intérieur de cette zone est celui du SVG, donc identique à
       iOS — aucun facteur à régler à la main. */
    const visible = Math.round((adaptive * 2) / 3);
    const markPng = join(WORK, `mark-${adaptive}.png`);
    rasterise(markSvg, visible, markPng);
    magick([markPng, "-background", "none", "-gravity", "center",
            "-extent", `${adaptive}x${adaptive}`,
            join(outDir, "ic_launcher_foreground.png")]);

    // Icône héritée (avant API 26) : l'icône complète, sans masque système.
    const legacyPng = join(outDir, "ic_launcher.png");
    rasterise(squareSvg, legacySize, legacyPng);
    magick([legacyPng, "-background", BACKGROUND, "-alpha", "remove", "-alpha", "off", legacyPng]);

    /* Variante ronde : même icône, masquée en cercle. Certains lanceurs la
       préfèrent sur les versions d'Android sans icône adaptative. */
    const roundPng = join(outDir, "ic_launcher_round.png");
    const r = legacySize / 2 - 0.5;
    rasterise(squareSvg, legacySize, roundPng);
    magick([roundPng, "-background", BACKGROUND, "-alpha", "remove", "-alpha", "off",
            "(", "-size", `${legacySize}x${legacySize}`, "xc:none",
            "-draw", `circle ${r},${r} ${r},0`, ")",
            "-alpha", "set", "-compose", "DstIn", "-composite", roundPng]);

    console.log(`android  ${dir.padEnd(16)} premier plan ${adaptive} (zone visible ${visible}) · hérité ${legacySize}`);
  }

  rmSync(WORK, { recursive: true, force: true });
  console.log("\n`npx cap sync` n'est pas nécessaire (les icônes vivent dans les");
  console.log("projets natifs), mais Android Studio doit reconstruire.");
}

main();
