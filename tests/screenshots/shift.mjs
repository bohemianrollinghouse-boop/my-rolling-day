// Cherche le decalage vertical qui minimise l ecart entre deux captures.
// Un decalage uniforme allume beaucoup de blocs sans etre une vraie
// regression : savoir de combien, c est savoir quoi corriger.
import { readFile } from "node:fs/promises";
import { decodePng } from "/Users/steve/Projects/Mobile/my-rolling-day/app/tests/screenshots/png.mjs";

function rowMeans(img) {
  const out = new Float64Array(img.height);
  for (let y = 0; y < img.height; y++) {
    let sum = 0;
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      sum += img.data[i] + img.data[i + 1] + img.data[i + 2];
    }
    out[y] = sum / img.width;
  }
  return out;
}

const names = process.argv.slice(4);
for (const name of names) {
  const a = decodePng(await readFile(`tests/screenshots/${process.argv[2]}/${name}`));
  const b = decodePng(await readFile(`tests/screenshots/${process.argv[3]}/${name}`));
  const ra = rowMeans(a), rb = rowMeans(b);
  let best = { shift: 0, err: Infinity };
  for (let sh = -120; sh <= 120; sh++) {
    let err = 0, n = 0;
    for (let y = 0; y < ra.length; y++) {
      const yb = y + sh;
      if (yb < 0 || yb >= rb.length) continue;
      err += (ra[y] - rb[yb]) ** 2; n++;
    }
    if (n > ra.length * 0.7) { err /= n; if (err < best.err) best = { shift: sh, err }; }
  }
  const cssShift = best.shift / 2; // captures en deviceScaleFactor 2
  console.log(`${name.padEnd(34)} decalage ${String(best.shift).padStart(4)} px capture = ${String(cssShift).padStart(6)} px CSS`);
}
