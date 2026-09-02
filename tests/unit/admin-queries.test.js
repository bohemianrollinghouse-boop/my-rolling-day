import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const q = require_("../../functions/admin/queries.js");

// ── Detection de plateforme ───────────────────────────────────────────────

test("admin : la plateforme se deduit du userAgent", () => {
  assert.equal(q.platformFromUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), "ios");
  assert.equal(q.platformFromUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8)"), "android");
  assert.equal(q.platformFromUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), "web");
  assert.equal(q.platformFromUserAgent("Mozilla/5.0 (Windows NT 10.0)"), "web");
});

test("admin : Android l'emporte sur Linux, present dans le meme userAgent", () => {
  // Tout userAgent Android contient « Linux » : tester Linux d'abord
  // classerait chaque telephone Android en « web ».
  assert.equal(q.platformFromUserAgent("Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit"), "android");
});

test("admin : un iPad qui se fait passer pour un Mac est reconnu au tactile", () => {
  assert.equal(q.platformFromUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X) Mobile/15E148"), "ios");
  assert.equal(q.platformFromUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari"), "web");
});

test("admin : un userAgent vide ou inconnu n'est pas compte a tort", () => {
  ["", null, undefined, "curl/8.0"].forEach((ua) => {
    assert.equal(q.platformFromUserAgent(ua), "inconnu", String(ua));
  });
});

// ── Fenetre de semaines ───────────────────────────────────────────────────

const LUNDI = Date.UTC(2026, 7, 31); // lundi 31 aout 2026

test("admin : weekStart ramene au lundi 00:00 UTC", () => {
  assert.equal(q.weekStart(Date.UTC(2026, 8, 2, 15, 30)), LUNDI, "un mercredi");
  assert.equal(q.weekStart(LUNDI), LUNDI, "un lundi est son propre debut");
  assert.equal(q.weekStart(Date.UTC(2026, 8, 6, 23, 59)), LUNDI, "un dimanche appartient a la semaine ecoulee");
});

test("admin : les semaines vides apparaissent quand meme, a zero", () => {
  // Sans elles, un graphe donnerait l'illusion d'une croissance continue.
  const buckets = q.bucketByWeek([], { weeks: 4, now: Date.UTC(2026, 8, 2) });
  assert.equal(buckets.length, 4);
  assert.deepEqual(buckets.map((b) => b.count), [0, 0, 0, 0]);
});

test("admin : les inscriptions tombent dans la bonne semaine", () => {
  const now = Date.UTC(2026, 8, 2); // mercredi
  const buckets = q.bucketByWeek([
    now,                       // semaine courante
    now - 1 * q.WEEK_MS,       // -1
    now - 1 * q.WEEK_MS - 3600e3,
    now - 3 * q.WEEK_MS,       // -3
  ], { weeks: 4, now });
  assert.deepEqual(buckets.map((b) => b.count), [1, 0, 2, 1]);
});

test("admin : les horodatages hors fenetre sont ignores", () => {
  const now = Date.UTC(2026, 8, 2);
  const buckets = q.bucketByWeek([now - 50 * q.WEEK_MS, now], { weeks: 4, now });
  assert.equal(buckets.reduce((s, b) => s + b.count, 0), 1);
});

test("admin : les valeurs non numeriques ne cassent pas le decompte", () => {
  const now = Date.UTC(2026, 8, 2);
  const buckets = q.bucketByWeek([null, undefined, NaN, "hier", Infinity, now], { weeks: 2, now });
  assert.equal(buckets.reduce((s, b) => s + b.count, 0), 1);
});

// ── Conversion des dates Firestore ────────────────────────────────────────

test("admin : toMillis accepte les trois formes rencontrees", () => {
  assert.equal(q.toMillis(1700000000000), 1700000000000, "nombre");
  assert.equal(q.toMillis(new Date(1700000000000)), 1700000000000, "Date");
  assert.equal(q.toMillis({ toMillis: () => 42 }), 42, "Timestamp Firestore");
  assert.equal(q.toMillis({ _seconds: 1700000000 }), 1700000000000, "Timestamp serialise");
});

test("admin : toMillis rend null plutot que NaN sur l'absence", () => {
  [null, undefined, 0, "", {}].forEach((v) => assert.equal(q.toMillis(v), null, String(v)));
});

// ── Volume ────────────────────────────────────────────────────────────────

test("admin : approximateSize mesure en octets et ne leve jamais", () => {
  assert.equal(q.approximateSize({ a: 1 }), 7);
  assert.equal(q.approximateSize(null), 2, "{} serialise");
  const cyclique = {}; cyclique.self = cyclique;
  assert.equal(q.approximateSize(cyclique), 0, "une structure cyclique rend 0, pas une exception");
});
