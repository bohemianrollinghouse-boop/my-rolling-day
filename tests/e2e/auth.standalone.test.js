/**
 * Tests E2E — Connexion iOS PWA standalone
 *
 * Section 1 (Node.js pur, toujours exécutée) :
 *   – logique isStandaloneMode
 *   – mécanique du timeout de runAuth
 *
 * Section 2 (suite CDP, skippée si pas de navigateur headless) :
 *   – simulation de navigator.standalone = true via addScriptToEvaluateOnNewDocument
 *   – simulation via matchMedia display-mode:standalone
 *   – vérifications DOM : .google-btn présent, formulaire email actif
 *   – régression : aucune notice de blocage Google en mode standalone ou navigateur normal
 *
 * Port de debug : 9223 (évite le conflit avec le smoke E2E qui utilise 9222).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";

import { launchBrowser, openPageSession } from "../helpers/cdp-browser.js";
import { startStaticServer } from "../helpers/static-server.js";

const projectRoot = resolve(
  "C:/Users/Myenn/Documents/Codex/2026-04-17-files-mentioned-by-the-user-code/planning-react"
);

// ---------------------------------------------------------------------------
// Helpers purs (aucune dépendance externe)
// ---------------------------------------------------------------------------

/**
 * Réplique exacte de isStandaloneMode() dans src/firebase/client.js.
 * Testée ici en isolation pure sans importer le module Firebase.
 */
function isStandaloneModeLogic() {
  return (
    (typeof navigator !== "undefined" && navigator.standalone === true) ||
    (typeof window !== "undefined" &&
      window.matchMedia?.("(display-mode: standalone)").matches === true)
  );
}

/**
 * Réplique exacte de la mécanique Promise.race + timeout de runAuth()
 * dans src/hooks/useAuth.js. Testée sans React ni Firebase.
 */
async function runAuthWithTimeout(action, timeoutMs) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const err = new Error("La connexion a pris trop de temps. Réessaie.");
      err.code = "auth/timeout";
      reject(err);
    }, timeoutMs);
  });
  try {
    return await Promise.race([action(), timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

// Helpers CDP

/** Attend qu'un sélecteur CSS soit présent dans le DOM (polling 250 ms). */
async function pollForSelector(session, selector, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { result } = await session.send("Runtime.evaluate", {
      expression: `!!document.querySelector(${JSON.stringify(selector)})`,
      returnByValue: true,
    });
    if (result.value === true) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/** Lit la valeur d'une propriété JS sur un élément (ex : disabled). */
async function queryProp(session, selector, prop) {
  const { result } = await session.send("Runtime.evaluate", {
    expression: `document.querySelector(${JSON.stringify(selector)})?.[${JSON.stringify(prop)}] ?? null`,
    returnByValue: true,
  });
  return result.value;
}

// Scripts d'injection (s'exécutent avant tout module ES sur la page)
const INJECT_NAVIGATOR_STANDALONE = `
  Object.defineProperty(navigator, 'standalone', { get: () => true, configurable: true });
`;

const INJECT_MATCHMEDIA_STANDALONE = `
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query) => ({
      matches: query === '(display-mode: standalone)',
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
`;

// ---------------------------------------------------------------------------
// Section 1 — Logique pure (toujours exécutée, pas de navigateur requis)
// ---------------------------------------------------------------------------

test("isStandaloneMode : false par défaut en Node.js sans standalone", () => {
  // Node.js : navigator existe mais .standalone est undefined ; window n'existe pas
  assert.equal(isStandaloneModeLogic(), false);
});

test("isStandaloneMode : true si navigator.standalone === true", () => {
  const prev = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { standalone: true } });
  try {
    assert.equal(isStandaloneModeLogic(), true);
  } finally {
    if (prev) Object.defineProperty(globalThis, "navigator", prev);
    else delete globalThis.navigator;
  }
});

test("isStandaloneMode : false si navigator.standalone === false", () => {
  const prev = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { standalone: false } });
  try {
    assert.equal(isStandaloneModeLogic(), false);
  } finally {
    if (prev) Object.defineProperty(globalThis, "navigator", prev);
    else delete globalThis.navigator;
  }
});

test("isStandaloneMode : true si matchMedia retourne matches=true pour display-mode:standalone", () => {
  const prev = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { matchMedia: (q) => ({ matches: q === "(display-mode: standalone)" }) },
  });
  try {
    assert.equal(isStandaloneModeLogic(), true);
  } finally {
    if (prev) Object.defineProperty(globalThis, "window", prev);
    else delete globalThis.window;
  }
});

test("isStandaloneMode : false si matchMedia retourne matches=false", () => {
  const prev = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { matchMedia: () => ({ matches: false }) },
  });
  try {
    assert.equal(isStandaloneModeLogic(), false);
  } finally {
    if (prev) Object.defineProperty(globalThis, "window", prev);
    else delete globalThis.window;
  }
});

test("isStandaloneMode : false si window.matchMedia est absent", () => {
  const prev = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  try {
    assert.equal(isStandaloneModeLogic(), false);
  } finally {
    if (prev) Object.defineProperty(globalThis, "window", prev);
    else delete globalThis.window;
  }
});

test("runAuth timeout : rejette avec auth/timeout si la promesse ne se résout jamais", async () => {
  await assert.rejects(
    () => runAuthWithTimeout(() => new Promise(() => {}), 50),
    (err) => {
      assert.equal(err.code, "auth/timeout");
      assert.match(err.message, /trop de temps/i);
      return true;
    }
  );
});

test("runAuth timeout : résout normalement si l'action se termine avant le délai", async () => {
  const result = await runAuthWithTimeout(() => Promise.resolve("connecte"), 500);
  assert.equal(result, "connecte");
});

test("runAuth timeout : propage l'erreur de l'action si elle rejette avant le délai", async () => {
  const err = Object.assign(new Error("Mot de passe incorrect."), { code: "auth/wrong-password" });
  await assert.rejects(
    () => runAuthWithTimeout(() => Promise.reject(err), 500),
    (e) => { assert.equal(e.code, "auth/wrong-password"); return true; }
  );
});

test("runAuth timeout : clearTimeout annule le timer après résolution rapide", async () => {
  const logs = [];
  const action = async () => {
    logs.push("start");
    await new Promise((r) => setTimeout(r, 10));
    logs.push("done");
    return "ok";
  };
  const result = await runAuthWithTimeout(action, 1000);
  // Laisse passer 80 ms pour détecter un éventuel timer flottant
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(result, "ok");
  assert.deepEqual(logs, ["start", "done"]);
});

// ---------------------------------------------------------------------------
// Section 2 — Suite CDP (before/after scopés, skip si pas de navigateur)
// ---------------------------------------------------------------------------

test("CDP: auth standalone iOS PWA", { timeout: 120_000 }, async (t) => {
  let serverHandle;
  let browserHandle;
  let browserLaunchError = null;

  t.before(async () => {
    serverHandle = await startStaticServer(projectRoot);
    try {
      browserHandle = await launchBrowser(9223);
    } catch (err) {
      browserLaunchError = err;
      browserHandle = null;
    }
  });

  t.after(async () => {
    if (browserHandle) await browserHandle.close();
    if (serverHandle) await serverHandle.close();
  });

  /** Ouvre un onglet et injecte un script avant le chargement des modules ES. */
  async function openWithScript(source) {
    const session = await openPageSession(browserHandle);
    await session.send("Page.addScriptToEvaluateOnNewDocument", { source });
    return session;
  }

  // ── 1. Bouton Google visible quand navigator.standalone === true ───────

  await t.test("le bouton Google est présent (navigator.standalone)", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }

    const session = await openWithScript(INJECT_NAVIGATOR_STANDALONE);
    try {
      await session.send("Page.navigate", { url: `${serverHandle.url}/` });
      await session.waitForEvent("Page.loadEventFired", 15_000);

      const googleFound = await pollForSelector(session, ".google-btn", 8_000);
      assert.ok(googleFound, ".google-btn doit être visible en standalone");

      const { result } = await session.send("Runtime.evaluate", {
        expression: `!!document.querySelector('.auth-standalone-notice')`,
        returnByValue: true,
      });
      assert.equal(result.value, false, "Pas de notice standalone bloquante");
    } finally {
      await session.close();
    }
  });

  // ── 2. Bouton Google visible en standalone ─────────────────────────────

  await t.test("le bouton Google reste disponible (navigator.standalone)", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }

    const session = await openWithScript(INJECT_NAVIGATOR_STANDALONE);
    try {
      await session.send("Page.navigate", { url: `${serverHandle.url}/` });
      await session.waitForEvent("Page.loadEventFired", 15_000);

      const googleFound = await pollForSelector(session, ".google-btn", 8_000);
      assert.ok(googleFound, ".google-btn doit exister en standalone");
    } finally {
      await session.close();
    }
  });

  // ── 3. Formulaire email/password accessible et non bloqué ─────────────

  await t.test("les champs email/password sont actifs (non disabled) en standalone", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }

    const session = await openWithScript(INJECT_NAVIGATOR_STANDALONE);
    try {
      await session.send("Page.navigate", { url: `${serverHandle.url}/` });
      await session.waitForEvent("Page.loadEventFired", 15_000);

      // Clic sur "Se connecter" pour ouvrir le formulaire email
      const btnFound = await pollForSelector(session, ".auth-cta-secondary", 8_000);
      assert.ok(btnFound, "Le bouton 'Se connecter' doit être visible");
      await session.send("Runtime.evaluate", {
        expression: `document.querySelector('.auth-cta-secondary')?.click()`,
      });

      const formFound = await pollForSelector(session, ".auth-form", 4_000);
      assert.ok(formFound, "Le formulaire email doit apparaître après clic");

      // Bouton submit non disabled
      const submitDisabled = await queryProp(session, '.auth-form button[type="submit"]', "disabled");
      assert.equal(submitDisabled, false, "Le bouton submit ne doit pas être disabled");

      // Champs présents et interactifs
      assert.ok(await pollForSelector(session, 'input[type="email"]', 2_000), "Champ email présent");
      assert.ok(await pollForSelector(session, 'input[type="password"]', 2_000), "Champ password présent");

      // Le .google-btn doit rester disponible sur la page login
      const { result: gLogin } = await session.send("Runtime.evaluate", {
        expression: `!!document.querySelector('.google-btn')`,
        returnByValue: true,
      });
      assert.equal(gLogin.value, true, ".google-btn doit exister sur la page login en standalone");

      // Pas de notice bloquante sur la page login
      const noticeLogin = await pollForSelector(session, ".auth-standalone-notice", 2_000);
      assert.equal(noticeLogin, false, "La notice standalone ne doit pas être visible sur la page login");
    } finally {
      await session.close();
    }
  });

  // ── 4. Même comportement via matchMedia display-mode:standalone ────────

  await t.test("le bouton Google reste présent via matchMedia display-mode:standalone", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }

    const session = await openWithScript(INJECT_MATCHMEDIA_STANDALONE);
    try {
      await session.send("Page.navigate", { url: `${serverHandle.url}/` });
      await session.waitForEvent("Page.loadEventFired", 15_000);

      const googleFound = await pollForSelector(session, ".google-btn", 8_000);
      assert.ok(googleFound, ".google-btn doit être visible avec matchMedia standalone");

      const { result } = await session.send("Runtime.evaluate", {
        expression: `!!document.querySelector('.auth-standalone-notice')`,
        returnByValue: true,
      });
      assert.equal(result.value, false, "Pas de notice standalone avec matchMedia standalone");
    } finally {
      await session.close();
    }
  });

  // ── 5. Régression : bouton Google présent en mode navigateur normal ────

  await t.test("le bouton Google est présent en mode navigateur normal (régression)", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }

    // Aucune injection — simule Safari ou Chrome normal
    const session = await openPageSession(browserHandle);
    try {
      await session.send("Page.navigate", { url: `${serverHandle.url}/` });
      await session.waitForEvent("Page.loadEventFired", 15_000);

      const googleFound = await pollForSelector(session, ".google-btn", 8_000);
      assert.ok(googleFound, "Le .google-btn doit être présent en mode navigateur normal");

      const { result } = await session.send("Runtime.evaluate", {
        expression: `!!document.querySelector('.auth-standalone-notice')`,
        returnByValue: true,
      });
      assert.equal(result.value, false, "Pas de notice standalone en mode navigateur normal");
    } finally {
      await session.close();
    }
  });
});
