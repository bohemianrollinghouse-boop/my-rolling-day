/**
 * Decodeur PNG minimal — juste ce qu il faut pour comparer deux captures.
 *
 * Couvre ce que produit `Page.captureScreenshot` : 8 bits par canal, non
 * entrelace, couleur 2 (RGB) ou 6 (RGBA), palette (3) et gris (0) en secours.
 * Pas de dependance : le projet n en a que deux (vite, capacitor), et une
 * comparaison d image ne justifie pas d en ajouter.
 */

import { inflateSync } from "node:zlib";

function readChunks(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error("Ce n est pas un PNG.");
  const chunks = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    chunks.push({ type, data: buffer.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length;
  }
  return chunks;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** @returns {{ width:number, height:number, channels:number, data:Buffer }} RGBA 8 bits. */
export function decodePng(buffer) {
  const chunks = readChunks(buffer);
  const ihdr = chunks.find((c) => c.type === "IHDR");
  if (!ihdr) throw new Error("PNG sans IHDR.");

  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  const bitDepth = ihdr.data[8];
  const colorType = ihdr.data[9];
  const interlace = ihdr.data[12];

  if (bitDepth !== 8) throw new Error(`Profondeur ${bitDepth} non geree (8 attendu).`);
  if (interlace !== 0) throw new Error("PNG entrelace non gere.");

  const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const channels = CHANNELS[colorType];
  if (!channels) throw new Error(`Type couleur ${colorType} non gere.`);

  const palette = chunks.find((c) => c.type === "PLTE")?.data;
  const idat = Buffer.concat(chunks.filter((c) => c.type === "IDAT").map((c) => c.data));
  const raw = inflateSync(idat);

  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  let pos = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;

    for (let x = 0; x < stride; x++) {
      const rawByte = line[x];
      const left = x >= channels ? out[x - channels] : 0;
      const up = prev ? prev[x] : 0;
      const upLeft = prev && x >= channels ? prev[x - channels] : 0;
      let value;
      switch (filter) {
        case 0: value = rawByte; break;
        case 1: value = rawByte + left; break;
        case 2: value = rawByte + up; break;
        case 3: value = rawByte + ((left + up) >> 1); break;
        case 4: value = rawByte + paeth(left, up, upLeft); break;
        default: throw new Error(`Filtre PNG inconnu : ${filter}`);
      }
      out[x] = value & 0xff;
    }
  }

  // Normalise en RGBA.
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let i = 0, n = width * height; i < n; i++) {
    const src = i * channels;
    const dst = i * 4;
    if (colorType === 6) {
      rgba[dst] = pixels[src]; rgba[dst + 1] = pixels[src + 1];
      rgba[dst + 2] = pixels[src + 2]; rgba[dst + 3] = pixels[src + 3];
    } else if (colorType === 2) {
      rgba[dst] = pixels[src]; rgba[dst + 1] = pixels[src + 1]; rgba[dst + 2] = pixels[src + 2];
    } else if (colorType === 0) {
      rgba[dst] = rgba[dst + 1] = rgba[dst + 2] = pixels[src];
    } else if (colorType === 4) {
      rgba[dst] = rgba[dst + 1] = rgba[dst + 2] = pixels[src];
      rgba[dst + 3] = pixels[src + 1];
    } else if (colorType === 3 && palette) {
      const p = pixels[src] * 3;
      rgba[dst] = palette[p]; rgba[dst + 1] = palette[p + 1]; rgba[dst + 2] = palette[p + 2];
    }
  }

  return { width, height, channels: 4, data: rgba };
}
