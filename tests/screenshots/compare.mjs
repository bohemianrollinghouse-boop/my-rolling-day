/**
 * Compare deux jeux de captures et signale les ecarts de mise en page francs.
 *
 *   node tests/screenshots/compare.mjs baseline phase-2
 *
 * Ce n est PAS un test pixel perfect — l objectif annonce est de reperer une
 * grosse regression, pas une difference d antialiasing. Deux mesures :
 *
 *   1. `diffPct`  — part des pixels dont un canal s ecarte de plus de
 *                   TOLERANCE. Le lissage des polices et les ombres bougent
 *                   toujours d un ou deux points : d ou le seuil.
 *   2. `blocksPct`— part des blocs de 16x16 dont plus d un quart des pixels
 *                   diffèrent. C est la mesure qui compte : un texte redessine
 *                   touche beaucoup de pixels dans peu de blocs, un bloc
 *                   deplace touche des blocs entiers.
 *
 * Verdict par capture :
 *   IDENTIQUE  blocsPct < 0,5 %
 *   PROCHE     blocsPct < 3 %    — retouche visuelle, a regarder si doute
 *   ECART      blocsPct < 15 %   — a inspecter a l oeil
 *   REGRESSION blocsPct >= 15 %, ou dimensions differentes, ou capture absente
 */

import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { decodePng } from "./png.mjs";

const ROOT = resolve(import.meta.dirname);
const TOLERANCE = 12;      // ecart par canal en dessous duquel on ignore
const BLOCK = 16;
const BLOCK_HIT = 0.25;    // part de pixels differents qui « allume » un bloc

const THRESHOLDS = [
  { max: 0.5,  verdict: "IDENTIQUE" },
  { max: 3,    verdict: "PROCHE" },
  { max: 15,   verdict: "ECART" },
  { max: Infinity, verdict: "REGRESSION" },
];

function verdictFor(blocksPct) {
  return THRESHOLDS.find((t) => blocksPct < t.max).verdict;
}

function compareImages(a, b) {
  if (a.width !== b.width || a.height !== b.height) {
    return { dimensionMismatch: true, before: `${a.width}x${a.height}`, after: `${b.width}x${b.height}` };
  }
  const { width, height } = a;
  const cols = Math.ceil(width / BLOCK);
  const rows = Math.ceil(height / BLOCK);
  const blockDiff = new Int32Array(cols * rows);
  let diffPixels = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const dr = Math.abs(a.data[i] - b.data[i]);
      const dg = Math.abs(a.data[i + 1] - b.data[i + 1]);
      const db = Math.abs(a.data[i + 2] - b.data[i + 2]);
      if (dr > TOLERANCE || dg > TOLERANCE || db > TOLERANCE) {
        diffPixels++;
        blockDiff[Math.floor(y / BLOCK) * cols + Math.floor(x / BLOCK)]++;
      }
    }
  }

  const perBlock = BLOCK * BLOCK * BLOCK_HIT;
  let hotBlocks = 0;
  for (const count of blockDiff) if (count >= perBlock) hotBlocks++;

  return {
    dimensionMismatch: false,
    diffPct: (diffPixels / (width * height)) * 100,
    blocksPct: (hotBlocks / blockDiff.length) * 100,
    hotBlocks,
    totalBlocks: blockDiff.length,
  };
}

async function loadPng(path) {
  return decodePng(await readFile(path));
}

async function main() {
  const [beforeLabel, afterLabel] = process.argv.slice(2);
  if (!beforeLabel || !afterLabel) {
    console.log("Usage : node tests/screenshots/compare.mjs <avant> <apres>");
    process.exit(1);
  }

  const beforeDir = join(ROOT, beforeLabel);
  const afterDir = join(ROOT, afterLabel);
  const pngs = (await readdir(beforeDir)).filter((f) => f.endsWith(".png")).sort();
  const afterFiles = new Set((await readdir(afterDir)).filter((f) => f.endsWith(".png")));

  const rows = [];
  for (const name of pngs) {
    if (!afterFiles.has(name)) {
      rows.push({ name, verdict: "REGRESSION", note: "capture absente apres" });
      continue;
    }
    const [a, b] = await Promise.all([loadPng(join(beforeDir, name)), loadPng(join(afterDir, name))]);
    const result = compareImages(a, b);
    if (result.dimensionMismatch) {
      rows.push({ name, verdict: "REGRESSION", note: `dimensions ${result.before} → ${result.after}` });
      continue;
    }
    rows.push({
      name, verdict: verdictFor(result.blocksPct),
      diffPct: result.diffPct, blocksPct: result.blocksPct,
      note: `${result.hotBlocks}/${result.totalBlocks} blocs`,
    });
  }

  const width = Math.max(...rows.map((r) => r.name.length));
  const ORDER = { REGRESSION: 0, ECART: 1, PROCHE: 2, IDENTIQUE: 3 };
  rows.sort((x, y) => ORDER[x.verdict] - ORDER[y.verdict] || x.name.localeCompare(y.name));

  console.log(`\n${beforeLabel} → ${afterLabel}\n`);
  for (const r of rows) {
    const pct = r.blocksPct === undefined ? "" : `${r.blocksPct.toFixed(1).padStart(5)} %  (pixels ${r.diffPct.toFixed(1)} %)`;
    console.log(`  ${r.verdict.padEnd(11)} ${r.name.padEnd(width)}  ${pct}  ${r.note}`);
  }

  const counts = rows.reduce((acc, r) => ({ ...acc, [r.verdict]: (acc[r.verdict] || 0) + 1 }), {});
  console.log("\n" + Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(" · "));

  const bad = rows.filter((r) => r.verdict === "REGRESSION");
  if (bad.length) {
    console.log(`\n${bad.length} capture(s) a inspecter a l oeil :`);
    for (const r of bad) console.log(`  ${afterLabel}/${r.name}`);
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
