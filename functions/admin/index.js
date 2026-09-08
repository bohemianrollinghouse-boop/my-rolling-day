/**
 * Console d'administration — routeur HTTP.
 *
 * Une seule Cloud Function sert la page et son API. L'authentification est la
 * SEULE barriere : toutes les lectures passent par l'Admin SDK et ignorent donc
 * les regles Firestore. Chaque route non publique verifie la session avant de
 * toucher a quoi que ce soit.
 */

const {
  SESSION_COOKIE, safeEqual, signSession, verifySession, readCookie, sessionCookieHeader,
} = require("./auth.js");
const { loginPage, consolePage } = require("./page.js");
const queries = require("./queries.js");
const { recipeDocFromImport } = require("./recipeImport.js");

/**
 * Limitation des tentatives, par IP.
 *
 * En memoire, donc par instance : Cloud Functions en demarre plusieurs et les
 * recycle. Ce n'est pas un rempart, c'est un ralentisseur — il transforme une
 * attaque par force brute en quelque chose de bruyant et de lent. La vraie
 * defense reste l'entropie du mot de passe (~139 bits).
 */
const attempts = new Map();
const MAX_ATTEMPTS = 8;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

function tooManyAttempts(ip, now = Date.now()) {
  const entry = attempts.get(ip);
  if (!entry || now - entry.first > ATTEMPT_WINDOW_MS) return false;
  return entry.count >= MAX_ATTEMPTS;
}

function noteAttempt(ip, now = Date.now()) {
  const entry = attempts.get(ip);
  if (!entry || now - entry.first > ATTEMPT_WINDOW_MS) attempts.set(ip, { first: now, count: 1 });
  else entry.count += 1;
}

/** Chemin normalise : la meme fonction repond avec ou sans prefixe /admin. */
function routeOf(req) {
  const raw = (req.path || "/").replace(/\/+$/, "") || "/";
  return raw.startsWith("/admin") ? (raw.slice(6) || "/") : raw;
}

function html(res, body, status = 200) {
  res.status(status)
    .set("Content-Type", "text/html; charset=utf-8")
    // Une console d'admin ne doit ni etre indexee, ni rester en cache.
    .set("Cache-Control", "no-store")
    .set("X-Robots-Tag", "noindex, nofollow")
    .set("X-Frame-Options", "DENY")
    .set("Referrer-Policy", "no-referrer")
    .send(body);
}

function json(res, body, status = 200) {
  res.status(status).set("Cache-Control", "no-store").json(body);
}

/** Corps de formulaire ou JSON, selon ce que l'appelant envoie. */
function readBody(req, key) {
  if (req.body && typeof req.body === "object" && req.body[key] != null) return String(req.body[key]);
  if (typeof req.body === "string") {
    const params = new URLSearchParams(req.body);
    return params.get(key) || "";
  }
  return "";
}

function createAdminHandler({ db, password, importRecipe }) {
  return async function adminHandler(req, res) {
    const route = routeOf(req);
    const secret = String(password || "");
    if (!secret) { html(res, "<p>ADMIN_PASSWORD n'est pas configure.</p>", 500); return; }

    const authed = Boolean(verifySession(readCookie(req.get("cookie"), SESSION_COOKIE), secret));

    // ── Routes publiques ────────────────────────────────────────────────
    if (route === "/login" && req.method === "POST") {
      const ip = req.get("x-forwarded-for") || req.ip || "?";
      if (tooManyAttempts(ip)) { html(res, loginPage({ error: "Trop de tentatives. Reessaie dans quelques minutes." }), 429); return; }
      if (!safeEqual(readBody(req, "password"), secret)) {
        noteAttempt(ip);
        // Meme message quelle que soit la cause : ne rien apprendre a qui essaie.
        html(res, loginPage({ error: "Mot de passe incorrect." }), 401);
        return;
      }
      attempts.delete(ip);
      res.set("Set-Cookie", sessionCookieHeader(signSession(secret)));
      res.redirect(303, "/admin");
      return;
    }

    if (route === "/logout" && req.method === "POST") {
      res.set("Set-Cookie", sessionCookieHeader("", { maxAgeSeconds: 0 }));
      res.redirect(303, "/admin");
      return;
    }

    if (route === "/" && req.method === "GET") {
      html(res, authed ? consolePage() : loginPage());
      return;
    }

    // ── Au-dela, tout exige une session ─────────────────────────────────
    if (!authed) { json(res, { error: "unauthorized" }, 401); return; }

    try {
      if (route === "/api/dashboard") { json(res, await queries.fetchDashboard(db)); return; }

      if (route === "/api/users") {
        const search = String((req.query && req.query.search) || "");
        json(res, { users: await queries.fetchUsers(db, { search }) });
        return;
      }

      const userMatch = route.match(/^\/api\/users\/(.+)$/);
      if (userMatch) {
        const detail = await queries.fetchUserDetail(db, decodeURIComponent(userMatch[1]));
        json(res, detail || { user: null, families: [] }, detail ? 200 : 404);
        return;
      }

      if (route === "/api/recipes" && req.method === "GET") {
        const snap = await db.collection("recipes").orderBy("name").get();
        json(res, { recipes: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
        return;
      }

      if (route === "/api/recipes/import" && req.method === "POST") {
        // Les callables Python de l'app exigent Firebase Auth ; la console
        // s'authentifie par mot de passe. L'import passe donc par la fonction
        // HTTP `import_recipe`, appelee serveur a serveur avec un jeton
        // d'identite Google (voir recipeImport.js). Sans appelant injecte, on
        // le dit franchement plutot que d'echouer en silence.
        if (typeof importRecipe !== "function") {
          json(res, { ok: false, error: "not-wired", message: "L'import n'est pas configure sur ce deploiement." }, 501);
          return;
        }
        const url = readBody(req, "url").trim();
        if (!url) { json(res, { ok: false, error: "invalid-argument", message: "Colle d'abord un lien." }, 400); return; }
        let imported;
        try {
          imported = await importRecipe(url);
        } catch (error) {
          const status = Number(error && error.status) || 502;
          json(res, { ok: false, error: (error && error.code) || "import-failed", message: (error && error.message) || "L'import a echoue." }, status);
          return;
        }
        const doc = recipeDocFromImport({ url, scraped: imported.scraped, analysis: imported.analysis });
        if (!doc.name && !doc.ingredients.length) {
          json(res, { ok: false, error: "empty", message: "Aucune recette exploitable sur cette page." }, 422);
          return;
        }
        const ref = await db.collection("recipes").add(doc);
        json(res, {
          ok: true,
          id: ref.id,
          name: doc.name || "Recette sans nom",
          category: doc.category,
          warning: imported.analysis ? "" : (imported.analysis_error || "L'analyse IA a echoue : categorie et regime restent a choisir."),
        });
        return;
      }

      json(res, { error: "not-found" }, 404);
    } catch (error) {
      console.error("[admin]", route, error);
      json(res, { error: "server-error" }, 500);
    }
  };
}

module.exports = { createAdminHandler, routeOf, tooManyAttempts, noteAttempt, MAX_ATTEMPTS };
