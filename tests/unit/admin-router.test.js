import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { createAdminHandler, routeOf } = require_("../../functions/admin/index.js");
const { signSession, sessionCookieHeader, SESSION_COOKIE } = require_("../../functions/admin/auth.js");

const PWD = "mot-de-passe-console";

/** Réponse Express minimale : on n'observe que ce que le routeur décide. */
function fakeRes() {
  const r = {
    statusCode: 200, headers: {}, body: null, redirected: null,
    status(c) { r.statusCode = c; return r; },
    set(k, v) { r.headers[String(k).toLowerCase()] = v; return r; },
    send(b) { r.body = b; return r; },
    json(b) { r.body = b; return r; },
    redirect(c, url) { r.statusCode = c; r.redirected = url; return r; },
  };
  return r;
}
function req({ path = "/", method = "GET", cookie = "", body = {}, query = {} } = {}) {
  return { path, method, body, query, ip: "1.2.3.4", get: (h) => (h.toLowerCase() === "cookie" ? cookie : "") };
}
const db = { collection: () => { throw new Error("la base ne doit pas etre touchee sans session"); } };
const handler = createAdminHandler({ db, password: PWD });
const validCookie = () => `${SESSION_COOKIE}=${signSession(PWD)}`;

// ── Normalisation des chemins ─────────────────────────────────────────────

test("admin : le routeur repond avec ou sans prefixe /admin", () => {
  // Selon l'hebergement, Cloud Functions transmet ou non le nom de la fonction.
  assert.equal(routeOf({ path: "/admin/api/users" }), "/api/users");
  assert.equal(routeOf({ path: "/api/users" }), "/api/users");
  assert.equal(routeOf({ path: "/admin" }), "/");
  assert.equal(routeOf({ path: "/admin/" }), "/");
  assert.equal(routeOf({ path: "/" }), "/");
});

// ── Barriere d'authentification ───────────────────────────────────────────

test("admin : sans session, la racine sert la page de connexion", async () => {
  const res = fakeRes();
  await handler(req(), res);
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /Console d'administration/);
  assert.match(res.body, /type="password"/);
  assert.doesNotMatch(res.body, /Tableau de bord/, "la console ne doit pas fuiter avant connexion");
});

test("admin : sans session, TOUTES les routes API sont refusees", async () => {
  // `db` leve si on la touche : le test verifie donc aussi qu'aucune lecture
  // n'a lieu avant la verification de session.
  for (const path of ["/api/dashboard", "/api/users", "/api/users/abc", "/api/recipes"]) {
    const res = fakeRes();
    await handler(req({ path }), res);
    assert.equal(res.statusCode, 401, path);
    assert.deepEqual(res.body, { error: "unauthorized" });
  }
});

test("admin : un cookie signe avec un autre secret ne donne pas acces", async () => {
  const res = fakeRes();
  await handler(req({ path: "/api/dashboard", cookie: `${SESSION_COOKIE}=${signSession("autre")}` }), res);
  assert.equal(res.statusCode, 401);
});

test("admin : avec session, la racine sert la console", async () => {
  const res = fakeRes();
  await handler(req({ cookie: validCookie() }), res);
  assert.match(res.body, /Tableau de bord/);
  assert.match(res.body, /Utilisateurs/);
});

// ── Connexion ─────────────────────────────────────────────────────────────

test("admin : un mot de passe correct pose le cookie et redirige", async () => {
  const res = fakeRes();
  await handler(req({ path: "/login", method: "POST", body: { password: PWD } }), res);
  assert.equal(res.statusCode, 303);
  assert.equal(res.redirected, "/admin");
  assert.match(res.headers["set-cookie"], /^__Host-mrd_admin=/);
  assert.match(res.headers["set-cookie"], /HttpOnly.*SameSite=Strict|SameSite=Strict.*HttpOnly/);
});

test("admin : un mauvais mot de passe rend 401 sans cookie", async () => {
  const res = fakeRes();
  await handler(req({ path: "/login", method: "POST", body: { password: "faux" } }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.headers["set-cookie"], undefined);
  assert.match(res.body, /Mot de passe incorrect/);
});

test("admin : le formulaire encode en URL est accepte aussi", async () => {
  const res = fakeRes();
  await handler(req({ path: "/login", method: "POST", body: `password=${encodeURIComponent(PWD)}` }), res);
  assert.equal(res.statusCode, 303);
});

test("admin : la deconnexion efface le cookie", async () => {
  const res = fakeRes();
  await handler(req({ path: "/logout", method: "POST", cookie: validCookie() }), res);
  assert.match(res.headers["set-cookie"], /Max-Age=0/);
  assert.equal(res.redirected, "/admin");
});

// ── En-tetes de protection ────────────────────────────────────────────────

test("admin : les pages ne sont ni indexables, ni cachables, ni encadrables", async () => {
  const res = fakeRes();
  await handler(req(), res);
  assert.equal(res.headers["cache-control"], "no-store");
  assert.match(res.headers["x-robots-tag"], /noindex/);
  assert.equal(res.headers["x-frame-options"], "DENY");
  assert.equal(res.headers["referrer-policy"], "no-referrer");
});

test("admin : sans ADMIN_PASSWORD, la console refuse de servir quoi que ce soit", async () => {
  const res = fakeRes();
  await createAdminHandler({ db, password: "" })(req({ cookie: validCookie() }), res);
  assert.equal(res.statusCode, 500);
  assert.match(res.body, /ADMIN_PASSWORD/);
});

// ── Import de recettes ────────────────────────────────────────────────────

test("admin : l'import annonce franchement qu'il n'est pas cable", async () => {
  // Mieux vaut un 501 explicite qu'un bouton qui echoue sans dire pourquoi.
  const res = fakeRes();
  await handler(req({ path: "/api/recipes/import", method: "POST", cookie: validCookie(), body: { url: "https://x" } }), res);
  assert.equal(res.statusCode, 501);
  assert.equal(res.body.ok, false);
  assert.match(res.body.message, /authentification Firebase/);
});
