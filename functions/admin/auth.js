/**
 * Authentification de la console d'administration — module pur, sans Firestore
 * ni Express, donc testable sans emulateur.
 *
 * Modele : un mot de passe unique (secret ADMIN_PASSWORD) echange contre un
 * cookie de session signe. Le mot de passe ne circule qu'une fois, a la
 * connexion ; ensuite c'est le jeton qui voyage.
 */

const crypto = require("node:crypto");

/** Duree de vie d'une session. Court volontairement : c'est une console admin. */
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/** Nom du cookie. Le prefixe __Host- impose HTTPS, path=/ et interdit Domain. */
const SESSION_COOKIE = "__Host-mrd_admin";

/**
 * Comparaison a temps constant.
 *
 * Un `===` sur un mot de passe s'arrete au premier caractere different : le
 * temps de reponse fuit alors la longueur du prefixe correct, et permet de
 * reconstituer le secret caractere par caractere. On hache d'abord pour que les
 * deux buffers aient toujours la meme taille — timingSafeEqual leve sinon, et
 * cette exception reintroduirait la fuite qu'on cherche a fermer.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a ?? ""), "utf8").digest();
  const hb = crypto.createHash("sha256").update(String(b ?? ""), "utf8").digest();
  return crypto.timingSafeEqual(ha, hb);
}

function base64url(buffer) {
  return Buffer.from(buffer).toString("base64url");
}

/** Signe une session. Le jeton est `<payload>.<hmac>`, tous deux en base64url. */
function signSession(secret, { now = Date.now(), ttlMs = SESSION_TTL_MS } = {}) {
  const payload = base64url(JSON.stringify({ exp: now + ttlMs }));
  const mac = base64url(crypto.createHmac("sha256", String(secret)).update(payload).digest());
  return `${payload}.${mac}`;
}

/**
 * Verifie un jeton de session.
 *
 * @returns {null|{exp:number}} `null` des que quelque chose cloche — signature
 *   invalide, expiration depassee, format inattendu. On ne distingue jamais les
 *   causes : un message d'erreur precis renseignerait un attaquant.
 */
function verifySession(token, secret, { now = Date.now() } = {}) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;

  const expected = base64url(crypto.createHmac("sha256", String(secret)).update(payload).digest());
  if (!safeEqual(mac, expected)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data || typeof data.exp !== "number") return null;
    return data.exp > now ? data : null;
  } catch (_error) {
    return null;
  }
}

/** Lit un cookie dans l'en-tete `Cookie` brut. */
function readCookie(header, name) {
  if (typeof header !== "string") return "";
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return "";
}

/** En-tete Set-Cookie de session. `maxAge: 0` efface le cookie. */
function sessionCookieHeader(token, { maxAgeSeconds = SESSION_TTL_MS / 1000 } = {}) {
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",          // inaccessible au JavaScript de la page
    "Secure",            // impose par le prefixe __Host- de toute facon
    "SameSite=Strict",   // ferme la porte au CSRF : aucune requete inter-site
    `Max-Age=${Math.floor(maxAgeSeconds)}`,
  ].join("; ");
}

module.exports = {
  SESSION_TTL_MS, SESSION_COOKIE,
  safeEqual, signSession, verifySession, readCookie, sessionCookieHeader,
};
