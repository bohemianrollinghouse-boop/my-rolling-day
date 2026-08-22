/**
 * Tests E2E — les réglages et leurs sous-pages sont des routes
 *
 * Avant la migration, l'écran des réglages était un booléen (`showSettings`) et
 * ses sous-pages deux `useState` de plus (`settingsSubPage`,
 * `settingsSupportPage`), avec une cascade de retour codée à la main :
 * « si sous-page de support → efface-la ; sinon si section → reviens au
 * sommaire ; sinon ferme les réglages ». Trois niveaux, un seul bouton, et rien
 * qui relie ça au bouton retour d'Android.
 *
 * Ces trois niveaux sont maintenant trois routes, et la cascade est simplement
 * la pile d'historique. Ce qui se vérifie donc ici :
 *   – ouvrir les réglages change l'URL et masque la barre d'onglets
 *   – ouvrir une section donne son propre chemin
 *   – le bouton retour remonte un niveau à la fois, dans le bon ordre
 *   – un chemin de section inconnu retombe sur le sommaire au lieu du vide
 *
 * Port de debug : 9227
 */

import test from "node:test";
import assert from "node:assert/strict";

import { launchBrowser, openPageSession } from "../helpers/cdp-browser.js";
import { startStaticServer } from "../helpers/static-server.js";
import { buildE2eApp } from "../helpers/e2e-build.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function evaluate(session, expression) {
  const { result } = await session.send("Runtime.evaluate", {
    expression, returnByValue: true, awaitPromise: true,
  });
  return result?.value;
}

async function pollFor(session, selector, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(session, `!!document.querySelector(${JSON.stringify(selector)})`) === true) return true;
    await sleep(200);
  }
  return false;
}

async function click(session, selector) {
  return evaluate(session, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.click();
    return true;
  })()`);
}

/** La page quittée reste montée : n'interroger que la page visible. */
async function inActivePage(session, expression) {
  return evaluate(session, `(() => {
    const page = [...document.querySelectorAll(".ion-page")]
      .filter((p) => !p.classList.contains("ion-page-hidden"))
      .filter((p) => !p.classList.contains("ion-delegate-host") && !p.closest("ion-modal"))
      .pop();
    const root = page || document;
    return ${expression};
  })()`);
}

/* Les modales apportent leur propre ".ion-page" (classe "ion-delegate-host") :
   les compter empechait la condition « exactement une page visible » de se
   realiser des qu une modale etait ouverte, et faisait attendre le delai
   complet a chaque fois. Elles sont donc exclues, ici comme dans les helpers
   qui cherchent « la page visible ».

   Note : ne jamais mettre de backtick dans un commentaire place DANS un
   template literal — il termine la chaine. C est exactement l erreur commise
   en ecrivant ce commentaire la premiere fois. */
async function waitForPageSettled(session, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const settled = await evaluate(session, `(() => {
      const pages = [...document.querySelectorAll(".ion-page")]
        .filter((p) => !p.classList.contains("ion-delegate-host") && !p.closest("ion-modal"));
      if (!pages.length) return false;
      if (pages.some((p) => p.classList.contains("ion-page-invisible"))) return false;
      return pages.filter((p) => !p.classList.contains("ion-page-hidden")).length === 1;
    })()`);
    if (settled === true) return true;
    await sleep(120);
  }
  return false;
}

async function setInputValue(session, selector, value) {
  return evaluate(session, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
}

async function waitNextEnabled(session, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(session, `document.querySelector(".onb-footer-next")?.disabled ?? null`) === false) return true;
    await sleep(150);
  }
  return false;
}

async function reachHomePage(session) {
  await pollFor(session, ".onboarding-shell", 12_000);
  await click(session, ".onboarding-choice-card:first-child");
  await pollFor(session, ".onboarding-input", 5000);
  await setInputValue(session, ".onboarding-input", "E2E Set");
  await waitNextEnabled(session);
  await click(session, ".onb-footer-next");
  await pollFor(session, ".onb-color-swatch", 5000);
  await click(session, ".onb-color-swatch");
  await waitNextEnabled(session);
  await click(session, ".onb-footer-next");
  await pollFor(session, ".onb-suggestion-chip", 5000);
  await click(session, ".onb-suggestion-chip");
  await waitNextEnabled(session);
  await click(session, ".onb-footer-next");
  await pollFor(session, ".onb-footer-next", 3000);
  await click(session, ".onb-footer-next");
  const ok = await pollFor(session, "ion-tab-bar", 15_000);
  if (ok) await waitForPageSettled(session);
  return ok;
}

/**
 * Déplie une section des réglages puis clique son lien « voir plus ».
 *
 * Les sections sont des accordéons replies par défaut (`openSections`) : le
 * lien n'existe pas dans le DOM tant que la section n'est pas ouverte.
 */
async function openSettingsSection(session, title, linkText) {
  const opened = await evaluate(session, `(() => {
    const head = [...document.querySelectorAll(".mrd-set-section-head")]
      .find((el) => (el.querySelector(".mrd-set-section-title")?.textContent || "").trim() === ${JSON.stringify(title)});
    if (!head) return false;
    head.click();
    return true;
  })()`);
  if (!opened) return false;
  await sleep(400);
  return evaluate(session, `(() => {
    const link = [...document.querySelectorAll("button, a")]
      .find((el) => (el.textContent || "").includes(${JSON.stringify(linkText)}));
    if (!link) return false;
    link.click();
    return true;
  })()`);
}

async function clickBackButton(session) {
  await evaluate(session, `(() => {
    const page = [...document.querySelectorAll(".ion-page")]
      .filter((p) => !p.classList.contains("ion-page-hidden"))
      .filter((p) => !p.classList.contains("ion-delegate-host") && !p.closest("ion-modal"))
      .pop();
    const btn = (page || document).querySelector("ion-back-button");
    (btn?.shadowRoot?.querySelector("button") || btn)?.click();
  })()`);
  await sleep(800);
  await waitForPageSettled(session);
}

test("CDP: réglages et sous-pages en routes", { timeout: 240_000 }, async (t) => {
  let serverHandle;
  let browserHandle;
  let browserLaunchError = null;

  t.before(async () => {
    serverHandle = await startStaticServer(await buildE2eApp());
    try {
      browserHandle = await launchBrowser(9227);
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
    await session.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `try { localStorage.setItem("mrd_notif_prompt",
        JSON.stringify({ dismissCount: 3, lastDismissed: null, granted: true })); } catch (e) {}`,
    });
    await session.send("Page.navigate", { url: `${serverHandle.url}/` });
    await session.waitForEvent("Page.loadEventFired", 15_000);
    return session;
  }

  await t.test("[1] l'engrenage ouvre /settings, sans barre d'onglets", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }
    const session = await openStubbed();
    try {
      assert.ok(await reachHomePage(session), "Prérequis : ion-tab-bar visible");

      assert.ok(await click(session, `.mrd-gear-btn[aria-label="Paramètres"]`),
        "le bouton engrenage doit être présent sur l'accueil");
      await waitForPageSettled(session);

      assert.equal(await evaluate(session, "location.pathname"), "/settings");
      assert.ok(await pollFor(session, ".mrd-settings-page", 5000), "la page Réglages doit être rendue");

      /* Les réglages sont rendus hors de l'outlet des onglets : la barre
         disparaît entièrement du DOM, elle n'est pas seulement cachée.

         Trois structures ont été essayées ; celle qui gardait les réglages
         dans l'outlet faisait protester Ionic (« Tab with id: "undefined" »,
         la route n'ayant pas d'onglet) et reconstruisait l'arbre de
         `SettingsView` trois fois par rendu — assez pour tuer le navigateur
         sur la suite complète. Voir le commentaire de `settingsPage` dans
         App.js. */
      assert.equal(await evaluate(session, `!!document.querySelector("ion-tab-bar")`), false,
        "la barre d'onglets ne doit pas être rendue sur les réglages");
    } finally {
      await session.close();
    }
  });

  await t.test("[2] une section des réglages a son propre chemin", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }
    const session = await openStubbed();
    try {
      assert.ok(await reachHomePage(session), "Prérequis : ion-tab-bar visible");
      await click(session, `.mrd-gear-btn[aria-label="Paramètres"]`);
      await waitForPageSettled(session);
      assert.ok(await pollFor(session, ".mrd-settings-page", 5000));

      const opened = await openSettingsSection(session, "À propos", "Voir les informations");
      assert.ok(opened, "la section « À propos » et son lien doivent être atteignables");
      await waitForPageSettled(session);

      assert.equal(await evaluate(session, "location.pathname"), "/settings/about",
        "la section doit avoir son propre chemin");
      assert.ok(await inActivePage(session, `!!root.querySelector(".settings-subpage")`),
        "la sous-page doit être rendue");
    } finally {
      await session.close();
    }
  });

  /* Le point de la phase : la cascade de retour n'est plus du code, c'est la
     pile. Un seul bouton, trois niveaux, dans l'ordre. */
  await t.test("[3] le retour remonte un niveau à la fois", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }
    const session = await openStubbed();
    try {
      assert.ok(await reachHomePage(session), "Prérequis : ion-tab-bar visible");
      await click(session, `.mrd-gear-btn[aria-label="Paramètres"]`);
      await waitForPageSettled(session);
      assert.ok(await openSettingsSection(session, "À propos", "Voir les informations"),
        "Prérequis : la section « À propos » doit s'ouvrir");
      await waitForPageSettled(session);
      assert.equal(await evaluate(session, "location.pathname"), "/settings/about");

      await clickBackButton(session);
      assert.equal(await evaluate(session, "location.pathname"), "/settings",
        "premier retour : la section se referme sur le sommaire");

      await clickBackButton(session);
      assert.equal(await evaluate(session, "location.pathname"), "/home",
        "second retour : les réglages se ferment sur l'écran d'où l'on venait");
      assert.ok(await inActivePage(session, `!!root.querySelector(".mrd-home")`),
        "l'accueil doit être réaffiché");
      assert.equal(await evaluate(session, "window.__APP_BOOT_STATE__"), "react-mounted");
    } finally {
      await session.close();
    }
  });

  /* Un chemin de section inventé (deep link périmé, faute de frappe) doit
     retomber sur le sommaire. Sans repli, `SettingsView` recevrait une section
     qu'elle ne connaît pas et ne rendrait rien — page blanche, sans erreur. */
  await t.test("[4] une section inconnue retombe sur le sommaire", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }
    const session = await openStubbed();
    try {
      assert.ok(await reachHomePage(session), "Prérequis : ion-tab-bar visible");
      await evaluate(session, `window.history.pushState({}, "", "/settings/nimportequoi")`);
      await evaluate(session, `window.dispatchEvent(new PopStateEvent("popstate"))`);
      await sleep(1200);
      await waitForPageSettled(session);

      assert.ok(await pollFor(session, ".mrd-settings-page", 6000),
        "la page Réglages doit s'afficher malgré la section inconnue");
      // Le sommaire, pas une sous-page.
      assert.ok(await inActivePage(session, `!root.querySelector(".settings-subpage")`),
        "une section inconnue doit rendre le sommaire, pas une sous-page vide");
      assert.equal(await evaluate(session, "window.__APP_BOOT_STATE__"), "react-mounted");
    } finally {
      await session.close();
    }
  });
});
