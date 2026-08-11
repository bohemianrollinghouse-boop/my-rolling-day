/**
 * Tests E2E — Navigation entre les onglets principaux
 *
 * Section 1 (Node.js pur, toujours exécutée) :
 *   – Structure NAV_TABS : 5 onglets dans le bon ordre
 *   – getBottomId : résolution des alias (mine/daily/weekly/monthly → tasks,
 *     écrans du menu « Plus » → quick)
 *   – Libellés attendus : Accueil, Tâches, Agenda, Repas, Plus
 *
 * Section 2 (CDP, skippée si pas de navigateur headless) :
 *   – Atteint la page d'accueil sur un build Vite où Firebase est remplacé par
 *     les stubs (voir helpers/e2e-build.js)
 *   – Clique chaque onglet du BottomNav et vérifie que :
 *       (a) l'app ne crashe pas (__APP_BOOT_STATE__ toujours "react-mounted")
 *       (b) le bouton actif porte aria-current="page"
 *       (c) un élément caractéristique de la vue est présent
 *
 * Port de debug : 9225 (distinct de smoke=9222, standalone=9223, profile=9224)
 */

import test from "node:test";
import assert from "node:assert/strict";

import { launchBrowser, openPageSession } from "../helpers/cdp-browser.js";
import { startStaticServer } from "../helpers/static-server.js";
import { buildE2eApp } from "../helpers/e2e-build.js";

// ─────────────────────────────────────────────────────────────────────────────
// Répliques des fonctions pures de BottomNav.js (testées sans React)
// ─────────────────────────────────────────────────────────────────────────────

const NAV_TABS = [
  { id: "home",   label: "Accueil" },
  { id: "tasks",  label: "Tâches"  },
  { id: "agenda", label: "Agenda"  },
  { id: "meals",  label: "Repas"   },
  { id: "quick",  label: "Plus"    },
];

/* Écrans secondaires : plus d'onglet dédié, ils passent par le bouton « Plus ». */
const QUICK_MENU_IDS = ["lists", "notes", "inventory", "recipes", "history"];

function getBottomId(tab) {
  if (["mine", "daily", "weekly", "monthly"].includes(tab)) return "tasks";
  if (tab === "agenda") return "agenda";
  if (tab === "meals")  return "meals";
  if (QUICK_MENU_IDS.includes(tab)) return "quick";
  if (tab === "home")   return "home";
  return "home";
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers CDP
// ─────────────────────────────────────────────────────────────────────────────

async function pollForSelector(session, selector, timeoutMs = 10_000) {
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

async function queryText(session, selector) {
  const { result } = await session.send("Runtime.evaluate", {
    expression: `document.querySelector(${JSON.stringify(selector)})?.textContent?.trim() ?? ""`,
    returnByValue: true,
  });
  return result.value ?? "";
}

async function queryAttr(session, selector, attr) {
  const { result } = await session.send("Runtime.evaluate", {
    expression: `document.querySelector(${JSON.stringify(selector)})?.getAttribute(${JSON.stringify(attr)}) ?? null`,
    returnByValue: true,
  });
  return result.value;
}

async function queryProp(session, selector, prop) {
  const { result } = await session.send("Runtime.evaluate", {
    expression: `document.querySelector(${JSON.stringify(selector)})?.[${JSON.stringify(prop)}] ?? null`,
    returnByValue: true,
  });
  return result.value;
}

async function click(session, selector) {
  await session.send("Runtime.evaluate", {
    expression: `document.querySelector(${JSON.stringify(selector)})?.click()`,
  });
}

async function waitForNextEnabled(session, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const disabled = await queryProp(session, ".onb-footer-next", "disabled");
    if (!disabled) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

/**
 * Complète tout le flux d'onboarding et attend l'apparition de .mrd-bnav.
 * Reproduit exactement les étapes [4–10] de profile-creation.test.js.
 */
async function reachHomePage(session) {
  await pollForSelector(session, ".onboarding-shell", 12_000);

  // Étape 1 : prénom
  await click(session, ".onboarding-choice-card:first-child");
  await pollForSelector(session, ".onboarding-input", 5_000);
  await session.send("Runtime.evaluate", {
    expression: `
      const el = document.querySelector(".onboarding-input");
      if (el) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "E2E Nav");
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    `,
  });
  await waitForNextEnabled(session);
  await click(session, ".onb-footer-next");

  // Étape 2 : couleur
  await pollForSelector(session, ".onb-color-swatch", 5_000);
  await click(session, ".onb-color-swatch");
  await waitForNextEnabled(session);
  await click(session, ".onb-footer-next");

  // Étape 3 : nom du foyer (via chip de suggestion)
  await pollForSelector(session, ".onb-suggestion-chip", 5_000);
  await click(session, ".onb-suggestion-chip");
  await waitForNextEnabled(session);
  await click(session, ".onb-footer-next");

  // Étape 4 : Terminer (create-add-members sans membres)
  await pollForSelector(session, ".onb-footer-next", 3_000);
  await click(session, ".onb-footer-next");

  // Attendre .mrd-bnav (page d'accueil)
  const ok = await pollForSelector(session, ".mrd-bnav", 15_000);
  return ok;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 1 — Logique pure (toujours exécutée, pas de navigateur requis)
// ─────────────────────────────────────────────────────────────────────────────

test("NAV_TABS : contient exactement 5 onglets dans le bon ordre", () => {
  assert.equal(NAV_TABS.length, 5);
  assert.deepEqual(NAV_TABS.map((t) => t.id), ["home", "tasks", "agenda", "meals", "quick"]);
});

test("NAV_TABS : tous les libellés sont définis et non vides", () => {
  for (const tab of NAV_TABS) {
    assert.ok(typeof tab.label === "string" && tab.label.length > 0,
      `onglet "${tab.id}" doit avoir un label non vide`);
  }
});

test("getBottomId : les alias de tâches (mine/daily/weekly/monthly) pointent vers 'tasks'", () => {
  assert.equal(getBottomId("mine"),    "tasks");
  assert.equal(getBottomId("daily"),   "tasks");
  assert.equal(getBottomId("weekly"),  "tasks");
  assert.equal(getBottomId("monthly"), "tasks");
});

test("getBottomId : les onglets directs retournent leur propre id", () => {
  assert.equal(getBottomId("home"),   "home");
  assert.equal(getBottomId("agenda"), "agenda");
  assert.equal(getBottomId("meals"),  "meals");
});

test("getBottomId : les écrans du menu « Plus » pointent vers 'quick'", () => {
  assert.equal(getBottomId("lists"),     "quick");
  assert.equal(getBottomId("notes"),     "quick");
  assert.equal(getBottomId("inventory"), "quick");
  assert.equal(getBottomId("recipes"),   "quick");
  assert.equal(getBottomId("history"),   "quick");
});

test("getBottomId : un onglet inconnu repasse sur 'home'", () => {
  assert.equal(getBottomId("unknown"), "home");
  assert.equal(getBottomId(""),        "home");
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 2 — Suite CDP (skippée si pas de navigateur headless)
// ─────────────────────────────────────────────────────────────────────────────

test("CDP: navigation entre onglets — aucun crash", { timeout: 180_000 }, async (t) => {
  let serverHandle;
  let browserHandle;
  let browserLaunchError = null;

  t.before(async () => {
    // Build Vite avec Firebase aliasé sur les stubs (voir helpers/e2e-build.js)
    serverHandle = await startStaticServer(await buildE2eApp());
    try {
      browserHandle = await launchBrowser(9225);
    } catch (err) {
      browserLaunchError = err;
      browserHandle = null;
    }
  });

  t.after(async () => {
    if (browserHandle) try { await browserHandle.close(); } catch { /* ignoré */ }
    if (serverHandle) await serverHandle.close();
  });

  async function openStubbed() {
    const session = await openPageSession(browserHandle);
    await session.send("Page.navigate", { url: `${serverHandle.url}/` });
    await session.waitForEvent("Page.loadEventFired", 15_000);
    return session;
  }

  // ── [1] Atteindre la page d'accueil ────────────────────────────────────────

  await t.test("[1] onboarding → page d'accueil (.mrd-bnav visible)", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }

    const session = await openStubbed();
    try {
      const homeOk = await reachHomePage(session);
      assert.ok(homeOk, ".mrd-bnav doit être visible après l'onboarding");

      const bootState = await session.send("Runtime.evaluate", {
        expression: "window.__APP_BOOT_STATE__",
        returnByValue: true,
      });
      assert.equal(bootState.result.value, "react-mounted",
        "__APP_BOOT_STATE__ doit être 'react-mounted'");
    } finally {
      await session.close();
    }
  });

  // ── [2] Navigation complète en une seule session ────────────────────────────
  //
  // Chaque onglet est testé en séquence dans la même session pour éviter de
  // rejouer l'onboarding 5 fois. Pour chaque onglet on vérifie :
  //   (a) __APP_BOOT_STATE__ toujours "react-mounted" (pas de crash)
  //   (b) aria-current="page" sur le bon bouton du BottomNav
  //   (c) élément caractéristique de la vue présent (header ou contenu)

  await t.test("[2] chaque onglet s'affiche sans crash", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }

    const session = await openStubbed();
    try {
      const homeOk = await reachHomePage(session);
      assert.ok(homeOk, "Prérequis : .mrd-bnav doit être visible");

      // Éléments caractéristiques par onglet
      // Pour tasks/agenda/meals/lists, le titre du header dans .mrd-screen-hdr-title
      // Pour home, le wrapper .mrd-home est présent directement
      const TABS_TO_CHECK = [
        {
          navLabel:    "Tâches",
          headerTitle: "Tâches",
          // Le header "Tâches" + les SegmentedTabs sont présents
          charSelector: ".mrd-screen-hdr-title",
          charText:     "Tâches",
        },
        {
          navLabel:    "Agenda",
          headerTitle: "Agenda",
          charSelector: ".mrd-screen-hdr-title",
          charText:     "Agenda",
        },
        {
          navLabel:    "Repas",
          headerTitle: "Repas",
          charSelector: ".mrd-screen-hdr-title",
          charText:     "Repas",
        },
        {
          navLabel:    "Accueil",
          // Home n'a pas de header .mrd-screen-hdr-title, mais .mrd-home est présent
          charSelector: ".mrd-home",
          charText:     null,
        },
      ];

      for (const tab of TABS_TO_CHECK) {
        // Cliquer le bouton du BottomNav par son aria-label
        await session.send("Runtime.evaluate", {
          expression: `
            [...document.querySelectorAll(".mrd-bnav-btn")]
              .find(btn => btn.getAttribute("aria-label")?.startsWith(${JSON.stringify(tab.navLabel)}))
              ?.click();
          `,
        });

        // Attendre le rendu (200 ms suffisent — React est synchrone dans ce contexte)
        await new Promise((r) => setTimeout(r, 400));

        // (a) Pas de crash
        const bootState = await session.send("Runtime.evaluate", {
          expression: "window.__APP_BOOT_STATE__",
          returnByValue: true,
        });
        assert.equal(
          bootState.result.value,
          "react-mounted",
          `Onglet "${tab.navLabel}" : __APP_BOOT_STATE__ doit rester "react-mounted"`,
        );

        // (b) aria-current="page" sur le bon bouton
        const ariaCurrent = await session.send("Runtime.evaluate", {
          expression: `
            [...document.querySelectorAll(".mrd-bnav-btn")]
              .find(btn => btn.getAttribute("aria-label")?.startsWith(${JSON.stringify(tab.navLabel)}))
              ?.getAttribute("aria-current") ?? null
          `,
          returnByValue: true,
        });
        assert.equal(
          ariaCurrent.result.value,
          "page",
          `Onglet "${tab.navLabel}" : aria-current="page" attendu sur le bouton actif`,
        );

        // (c) Élément caractéristique présent
        const charOk = await pollForSelector(session, tab.charSelector, 5_000);
        assert.ok(
          charOk,
          `Onglet "${tab.navLabel}" : "${tab.charSelector}" doit être dans le DOM`,
        );

        if (tab.charText !== null) {
          const actualText = await queryText(session, tab.charSelector);
          assert.ok(
            actualText.includes(tab.charText),
            `Onglet "${tab.navLabel}" : "${tab.charSelector}" doit contenir "${tab.charText}" (trouvé : "${actualText}")`,
          );
        }
      }
    } finally {
      await session.close();
    }
  });

  // ── [3] Le bouton « Plus » ouvre les écrans secondaires ────────────────────
  // Listes, Notes, Inventaire, Recettes et Historique ne sont plus des onglets
  // du BottomNav : ils vivent dans le menu du bouton « Plus ».

  await t.test("[3] le menu « Plus » ouvre les écrans secondaires (Listes)", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }

    const session = await openStubbed();
    try {
      assert.ok(await reachHomePage(session), "Prérequis : .mrd-bnav doit être visible");

      await click(session, '.mrd-bnav-btn[aria-label="Plus"]');
      assert.ok(
        await pollForSelector(session, ".mrd-bnav-quick-menu", 3_000),
        "Le bouton « Plus » doit ouvrir le menu rapide",
      );

      await session.send("Runtime.evaluate", {
        expression: `
          [...document.querySelectorAll(".mrd-bnav-quick-item")]
            .find(btn => btn.textContent.includes("Listes"))
            ?.click();
        `,
      });

      assert.ok(
        await pollForSelector(session, ".lists-page-header", 5_000),
        "L'entrée « Listes » du menu rapide doit ouvrir l'écran Listes",
      );

      const bootState = await session.send("Runtime.evaluate", {
        expression: "window.__APP_BOOT_STATE__",
        returnByValue: true,
      });
      assert.equal(bootState.result.value, "react-mounted",
        "L'écran Listes ne doit pas faire crasher l'app");
    } finally {
      await session.close();
    }
  });

  // ── [4] Pas d'écran fatal sur la page d'accueil après navigation aller-retour

  await t.test("[4] pas d'écran fatal après navigation aller-retour", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }

    const session = await openStubbed();
    try {
      await reachHomePage(session);

      // Aller sur Listes (via le menu « Plus »), puis revenir sur Accueil
      await click(session, '.mrd-bnav-btn[aria-label="Plus"]');
      await pollForSelector(session, ".mrd-bnav-quick-menu", 3_000);
      await session.send("Runtime.evaluate", {
        expression: `
          [...document.querySelectorAll(".mrd-bnav-quick-item")]
            .find(btn => btn.textContent.includes("Listes"))
            ?.click();
        `,
      });
      await pollForSelector(session, ".lists-page-header", 5_000);

      await session.send("Runtime.evaluate", {
        expression: `document.querySelector('[aria-label="Accueil"]')?.click()`,
      });
      await new Promise((r) => setTimeout(r, 300));

      const bodyText = await session.send("Runtime.evaluate", {
        expression: "document.body.innerText",
        returnByValue: true,
      });
      assert.doesNotMatch(bodyText.result.value, /Demarrage bloque/i,
        "Aucun écran de démarrage bloqué ne doit apparaître");
      assert.doesNotMatch(bodyText.result.value, /Erreur visible/i,
        "Aucune erreur visible ne doit apparaître");

      const bootState = await session.send("Runtime.evaluate", {
        expression: "window.__APP_BOOT_STATE__",
        returnByValue: true,
      });
      assert.equal(bootState.result.value, "react-mounted",
        "L'app doit rester montée après navigation aller-retour");
    } finally {
      await session.close();
    }
  });
});
