import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const auth = require_("../../functions/admin/auth.js");

const SECRET = "un-mot-de-passe-de-console";

// ── Comparaison a temps constant ──────────────────────────────────────────

test("admin : safeEqual reconnait l'egalite et rejette le reste", () => {
  assert.equal(auth.safeEqual("abc", "abc"), true);
  assert.equal(auth.safeEqual("abc", "abd"), false);
  assert.equal(auth.safeEqual("abc", "abcd"), false, "longueurs differentes");
  assert.equal(auth.safeEqual("", ""), true);
});

test("admin : safeEqual ne leve jamais, meme sur null ou undefined", () => {
  // timingSafeEqual leve si les buffers different de taille ; hacher d'abord
  // evite que cette exception devienne elle-meme un canal de fuite.
  assert.doesNotThrow(() => auth.safeEqual(null, "x"));
  assert.doesNotThrow(() => auth.safeEqual(undefined, undefined));
  assert.equal(auth.safeEqual(null, undefined), true, "les deux donnent la chaine vide");
  assert.equal(auth.safeEqual("x", null), false);
});

// ── Session signee ────────────────────────────────────────────────────────

test("admin : une session fraiche se verifie", () => {
  const token = auth.signSession(SECRET);
  const data = auth.verifySession(token, SECRET);
  assert.ok(data && typeof data.exp === "number");
});

test("admin : une session signee avec un autre secret est rejetee", () => {
  const token = auth.signSession(SECRET);
  assert.equal(auth.verifySession(token, "un-autre-secret"), null);
});

test("admin : une charge utile modifiee invalide la signature", () => {
  const token = auth.signSession(SECRET);
  const [, mac] = token.split(".");
  // On repousse l'expiration de dix ans : sans signature valable, sans effet.
  const forge = Buffer.from(JSON.stringify({ exp: Date.now() + 3.2e11 })).toString("base64url");
  assert.equal(auth.verifySession(`${forge}.${mac}`, SECRET), null);
});

test("admin : une session expiree est refusee", () => {
  const token = auth.signSession(SECRET, { now: 1000, ttlMs: 500 });
  assert.ok(auth.verifySession(token, SECRET, { now: 1400 }), "avant echeance");
  assert.equal(auth.verifySession(token, SECRET, { now: 1600 }), null, "apres echeance");
});

test("admin : les jetons malformes sont refuses sans lever", () => {
  [undefined, null, "", "sanspoint", ".", "a.", ".b", 42, {}].forEach((bad) => {
    assert.equal(auth.verifySession(bad, SECRET), null, String(bad));
  });
});

test("admin : la duree de vie par defaut est de 12 heures", () => {
  assert.equal(auth.SESSION_TTL_MS, 12 * 60 * 60 * 1000);
});

// ── Cookies ───────────────────────────────────────────────────────────────

test("admin : lecture d'un cookie parmi d'autres", () => {
  const header = `a=1; ${auth.SESSION_COOKIE}=jeton-xyz; b=2`;
  assert.equal(auth.readCookie(header, auth.SESSION_COOKIE), "jeton-xyz");
  assert.equal(auth.readCookie(header, "absent"), "");
  assert.equal(auth.readCookie(undefined, auth.SESSION_COOKIE), "");
});

test("admin : le cookie de session porte toutes les protections", () => {
  const header = auth.sessionCookieHeader("jeton");
  // Chacune ferme une porte precise : HttpOnly contre le vol par XSS,
  // SameSite=Strict contre le CSRF, Secure/__Host- contre l'ecoute en clair.
  assert.match(header, /^__Host-mrd_admin=jeton;/);
  assert.match(header, /HttpOnly/);
  assert.match(header, /Secure/);
  assert.match(header, /SameSite=Strict/);
  assert.match(header, /Path=\//);
  assert.doesNotMatch(header, /Domain=/, "le prefixe __Host- interdit Domain");
});

test("admin : maxAge 0 efface le cookie", () => {
  assert.match(auth.sessionCookieHeader("", { maxAgeSeconds: 0 }), /Max-Age=0/);
});
