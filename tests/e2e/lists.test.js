/**
 * Tests E2E — Module Listes
 *
 * Le module Listes n'avait aucun scénario navigateur : `tests/unit/stock-merge.test.js`
 * couvre les helpers de `useLists.js` (fusion d'inventaire, liste de courses
 * dérivée), mais rien ne vérifiait que l'écran s'ouvre, que l'ajout d'un article
 * aboutit, ni que cocher un article le déplace vraiment de section.
 *
 * Ce qui ne peut se vérifier qu'en vrai :
 *   – le menu « Plus » mène à /lists, avec l'en-tête du bon écran
 *   – la liste de courses par défaut existe et s'ouvre sur son détail
 *   – ajouter un article via la modale l'affiche et met à jour le compteur
 *   – cocher / décocher déplace l'article entre « À acheter » et « Achetés »
 *   – créer une liste ordinaire la fait apparaître sur la page d'accueil du module
 *   – le bouton retour du détail ramène à la liste des listes
 *
 * Port de debug : 9228 (smoke=9222, standalone=9223, profile=9224, nav=9225,
 * theme=9226, tasks=9227, captures=9230)
 */

import test from "node:test";
import assert from "node:assert/strict";

import { launchBrowser, openPageSession } from "../helpers/cdp-browser.js";
import { startStaticServer } from "../helpers/static-server.js";
import { buildE2eApp } from "../helpers/e2e-build.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers CDP
// ─────────────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function evaluate(session, expression) {
  const { result } = await session.send("Runtime.evaluate", {
    expression, returnByValue: true, awaitPromise: true,
  });
  return result?.value;
}

async function pollForSelector(session, selector, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(session, `!!document.querySelector(${JSON.stringify(selector)})`) === true) return true;
    await sleep(200);
  }
  return false;
}

async function pollUntilGone(session, selector, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(session, `!document.querySelector(${JSON.stringify(selector)})`) === true) return true;
    await sleep(150);
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

async function queryText(session, selector) {
  return evaluate(session, `document.querySelector(${JSON.stringify(selector)})?.textContent?.trim() ?? ""`);
}

/** Textes de tous les éléments correspondant au sélecteur. */
async function queryAllTexts(session, selector) {
  return evaluate(session, `[...document.querySelectorAll(${JSON.stringify(selector)})]
    .map((el) => (el.textContent || "").trim())`);
}

async function fillInput(session, selector, value) {
  return evaluate(session, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
}

/** Attend qu'un sélecteur atteigne un texte donné (rendu React asynchrone). */
async function pollForText(session, selector, expected, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    last = await queryText(session, selector);
    if (last === expected) return true;
    await sleep(150);
  }
  return last;
}

/** Attend qu'un des éléments du sélecteur porte ce texte. */
async function pollForTextAmong(session, selector, expected, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const texts = await queryAllTexts(session, selector);
    if (Array.isArray(texts) && texts.includes(expected)) return true;
    await sleep(150);
  }
  return false;
}

/**
 * Attend la fin de la transition de page.
 * `IonRouterOutlet` garde la page sortante montée le temps de l'animation ; les
 * modales apportent leur propre `.ion-page` et sont donc exclues du compte.
 */
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

async function clickTab(session, label) {
  return evaluate(session, `(() => {
    const btn = [...document.querySelectorAll("ion-tab-button")]
      .find((b) => (b.getAttribute("aria-label") || "").startsWith(${JSON.stringify(label)}));
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
}

/** Ouvre un écran du menu « Plus » (les boutons sont dans un shadow root). */
async function openQuickScreen(session, label) {
  await clickTab(session, "Plus");
  await sleep(600);
  const clicked = await evaluate(session, `(() => {
    const sheet = document.querySelector("ion-action-sheet");
    const root = sheet?.shadowRoot || sheet;
    const btn = [...(root?.querySelectorAll("button") || [])]
      .find((b) => (b.textContent || "").includes(${JSON.stringify(label)}));
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  await waitForPageSettled(session);
  await sleep(300);
  return clicked === true;
}

async function waitForNextEnabled(session, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(session, `document.querySelector(".onb-footer-next")?.disabled ?? null`) === false) return true;
    await sleep(150);
  }
  return false;
}

/** Complète le parcours CREATE de l'onboarding et attend la barre d'onglets. */
async function reachHomePage(session) {
  await pollForSelector(session, ".onboarding-shell", 12_000);

  await click(session, ".onboarding-choice-card:first-child");
  await pollForSelector(session, ".onboarding-input", 5_000);
  await fillInput(session, ".onboarding-input", "E2E Listes");
  await waitForNextEnabled(session);
  await click(session, ".onb-footer-next");

  await pollForSelector(session, ".onb-color-swatch", 5_000);
  await click(session, ".onb-color-swatch");
  await waitForNextEnabled(session);
  await click(session, ".onb-footer-next");

  await pollForSelector(session, ".onb-suggestion-chip", 5_000);
  await click(session, ".onb-suggestion-chip");
  await waitForNextEnabled(session);
  await click(session, ".onb-footer-next");

  await pollForSelector(session, ".onb-footer-next", 3_000);
  await click(session, ".onb-footer-next");

  const ok = await pollForSelector(session, "ion-tab-bar", 15_000);
  if (ok) await waitForPageSettled(session);
  return ok;
}

/** Onboarding puis ouverture de l'écran Listes. */
async function reachListsScreen(session) {
  assert.ok(await reachHomePage(session), "Prérequis : ion-tab-bar visible");
  assert.ok(await openQuickScreen(session, "Listes"), "entrée « Listes » introuvable dans le menu Plus");
  assert.ok(await pollForSelector(session, ".lists-page-header-title", 8_000), "en-tête de l'écran Listes absent");
}

/** Ouvre la liste dont la carte porte ce titre. */
async function openListNamed(session, name) {
  const clicked = await evaluate(session, `(() => {
    const title = [...document.querySelectorAll(".lists-page-list-card-title")]
      .find((el) => (el.textContent || "").trim() === ${JSON.stringify(name)});
    const card = title?.closest(".lists-page-list-card");
    if (!card) return false;
    card.click();
    return true;
  })()`);
  if (clicked !== true) return false;
  return pollForSelector(session, ".ldv-topbar-name", 8_000);
}

/** Ajoute un article dans la liste ouverte, via la modale. */
async function addItem(session, name) {
  assert.ok(await click(session, ".ldv-section-add"), "bouton « + » de la section introuvable");
  assert.ok(await pollForSelector(session, ".ainp", 8_000), "modale d'ajout d'article non ouverte");
  await fillInput(session, ".ainp", name);
  await sleep(200);
  assert.ok(await click(session, ".aok"), "bouton de validation de l'article introuvable");
  await pollUntilGone(session, ".ainp", 8_000);
}

/** Titres des sections du détail, dans l'ordre (« À acheter », « Achetés »…). */
async function sectionTitles(session) {
  return queryAllTexts(session, ".ldv-section-title");
}

/** Attend que les sections affichées soient exactement celles-ci, dans l'ordre. */
async function pollForSectionTitles(session, expected, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const titles = await sectionTitles(session);
    if (Array.isArray(titles) && titles.length === expected.length
      && titles.every((title, index) => title === expected[index])) return true;
    await sleep(150);
  }
  return false;
}

/** Noms des articles de la section portant ce titre. */
async function itemsInSection(session, title) {
  return evaluate(session, `(() => {
    const section = [...document.querySelectorAll(".ldv-section")]
      .find((s) => (s.querySelector(".ldv-section-title")?.textContent || "").trim() === ${JSON.stringify(title)});
    if (!section) return null;
    return [...section.querySelectorAll(".ldv-item-name")].map((el) => (el.textContent || "").trim());
  })()`);
}

/** Attend qu'une section contienne exactement ces articles. */
async function pollForSectionItems(session, title, expected, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await itemsInSection(session, title);
    if (Array.isArray(last) && last.length === expected.length
      && expected.every((name) => last.includes(name))) return true;
    await sleep(150);
  }
  return last;
}

/** Coche / décoche l'article portant ce nom. Renvoie false si la case est absente. */
async function clickItemCheckbox(session, name) {
  return evaluate(session, `(() => {
    const label = [...document.querySelectorAll(".ldv-item-name")]
      .find((el) => (el.textContent || "").trim() === ${JSON.stringify(name)});
    const row = label?.closest(".ldv-item");
    const box = row?.querySelector(".ldv-chk");
    if (!box) return false;
    box.click();
    return true;
  })()`);
}

/** Titre de la section qui contient cet article, ou "" s'il n'est pas affiché. */
async function sectionOfItem(session, name) {
  return evaluate(session, `(() => {
    const section = [...document.querySelectorAll(".ldv-section")]
      .find((sec) => [...sec.querySelectorAll(".ldv-item-name")]
        .some((el) => (el.textContent || "").trim() === ${JSON.stringify(name)}));
    return (section?.querySelector(".ldv-section-title")?.textContent || "").trim();
  })()`);
}

/**
 * Coche / décoche jusqu'à ce que l'article ait rejoint la section visée.
 *
 * Un simple clic suivi d'une attente échouait par intermittence : les deux
 * sections sont re-rendues à chaque bascule, et un clic qui tombe pendant ce
 * re-rendu peut viser un noeud que React s'apprête à remplacer — le handler
 * ne part alors jamais. On réessaie donc tant que la section n'a pas changé,
 * plutôt que d'allonger un délai fixe.
 */
async function toggleItemInto(session, name, targetSection, attempts = 4) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await sectionOfItem(session, name) === targetSection) return true;
    if (await clickItemCheckbox(session, name) !== true) return false;

    const deadline = Date.now() + 2_500;
    while (Date.now() < deadline) {
      if (await sectionOfItem(session, name) === targetSection) return true;
      await sleep(120);
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────

/* 240 s : quatre sous-tests rejouent l'onboarding complet dans leur propre
   session (~20 s chacun), plus le build partagé au premier passage. */
test("CDP: module des listes — cycle complet", { timeout: 240_000 }, async (t) => {
  let serverHandle;
  let browserHandle;
  let browserLaunchError = null;

  t.before(async () => {
    serverHandle = await startStaticServer(await buildE2eApp());
    try {
      browserHandle = await launchBrowser(9228);
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
    /* La modale « Activer les notifications ? » s'ouvre juste après
       l'onboarding, apporte sa propre `.ion-page` et couvre l'écran : la
       marquer comme traitée reproduit l'état d'un utilisateur qui revient. */
    await session.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `try { localStorage.setItem("mrd_notif_prompt",
        JSON.stringify({ dismissCount: 3, lastDismissed: null, granted: true })); } catch (e) {}`,
    });
    await session.send("Page.navigate", { url: `${serverHandle.url}/` });
    await session.waitForEvent("Page.loadEventFired", 15_000);
    return session;
  }

  function skipIfNoBrowser(st) {
    if (browserHandle) return false;
    st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
    return true;
  }

  await t.test("[1] le menu « Plus » ouvre /lists, avec la liste de courses par défaut", async (st) => {
    if (skipIfNoBrowser(st)) return;
    const session = await openStubbed();
    try {
      await reachListsScreen(session);

      assert.equal(await evaluate(session, "window.__APP_BOOT_STATE__"), "react-mounted",
        "l'app a crashé en ouvrant les listes");
      assert.equal(await queryText(session, ".lists-page-header-title"), "Listes");
      assert.equal(await evaluate(session, "location.pathname"), "/lists",
        "l'écran doit avoir sa propre URL");

      // La liste de courses est créée par normalizeState : elle doit être là,
      // et en premier (order = -1).
      const titles = await queryAllTexts(session, ".lists-page-list-card-title");
      assert.ok(Array.isArray(titles) && titles.length >= 1, "aucune carte de liste affichée");
      assert.equal(titles[0], "Liste de courses");
    } finally {
      await session.close();
    }
  });

  await t.test("[2] ajouter un article l'affiche et met à jour le compteur", async (st) => {
    if (skipIfNoBrowser(st)) return;
    const session = await openStubbed();
    try {
      await reachListsScreen(session);
      assert.ok(await openListNamed(session, "Liste de courses"), "la liste de courses ne s'ouvre pas");
      assert.equal(await queryText(session, ".ldv-topbar-name"), "Liste de courses");

      // Une liste neuve n'a que la section « À acheter », vide.
      assert.deepEqual(await sectionTitles(session), ["À acheter"]);
      assert.equal(await queryText(session, ".ldv-empty"), "Cette section est vide");

      await addItem(session, "Baguette");

      assert.equal(await pollForSectionItems(session, "À acheter", ["Baguette"]), true,
        "l'article ajouté n'apparaît pas dans « À acheter »");
      assert.equal(await pollForText(session, ".ldv-section-count", "1 article"), true,
        "le compteur de la section n'est pas à jour");

      await addItem(session, "Lait");
      assert.equal(await pollForSectionItems(session, "À acheter", ["Baguette", "Lait"]), true,
        "le second article n'apparaît pas");
      assert.equal(await pollForText(session, ".ldv-section-count", "2 articles"), true,
        "le compteur doit se mettre au pluriel");

      assert.equal(await evaluate(session, "window.__APP_BOOT_STATE__"), "react-mounted");
    } finally {
      await session.close();
    }
  });

  await t.test("[3] cocher un article le déplace vers « Achetés », décocher le ramène", async (st) => {
    if (skipIfNoBrowser(st)) return;
    const session = await openStubbed();
    try {
      await reachListsScreen(session);
      assert.ok(await openListNamed(session, "Liste de courses"));

      await addItem(session, "Baguette");
      await addItem(session, "Lait");
      assert.equal(await pollForSectionItems(session, "À acheter", ["Baguette", "Lait"]), true);

      // La section « Achetés » n'existe pas tant que rien n'est coché.
      assert.deepEqual(await sectionTitles(session), ["À acheter"]);

      assert.ok(await toggleItemInto(session, "Baguette", "Achetés"),
        "l'article coché doit passer dans « Achetés »");
      assert.equal(await pollForSectionItems(session, "À acheter", ["Lait"]), true,
        "l'article coché doit quitter « À acheter »");

      assert.ok(await toggleItemInto(session, "Baguette", "À acheter"),
        "décocher doit ramener l'article dans « À acheter »");
      assert.equal(await pollForSectionItems(session, "À acheter", ["Baguette", "Lait"]), true,
        "les deux articles doivent être de nouveau à acheter");
      assert.equal(await pollForSectionTitles(session, ["À acheter"]), true,
        "la section « Achetés » doit disparaître quand elle est vide");
    } finally {
      await session.close();
    }
  });

  await t.test("[4] créer une liste ordinaire, puis revenir à la page des listes", async (st) => {
    if (skipIfNoBrowser(st)) return;
    const session = await openStubbed();
    try {
      await reachListsScreen(session);

      assert.ok(await click(session, ".lists-page-create-btn"), "bouton « + Nouvelle » introuvable");
      const nameSelector = 'input[placeholder="Nom de la liste…"]';
      assert.ok(await pollForSelector(session, nameSelector, 8_000), "modale de création de liste non ouverte");
      await fillInput(session, nameSelector, "Bricolage");
      await sleep(200);

      assert.ok(await evaluate(session, `(() => {
        const btn = [...document.querySelectorAll("button[type=submit]")]
          .find((b) => (b.textContent || "").trim() === "Créer la liste");
        if (!btn || btn.disabled) return false;
        btn.click();
        return true;
      })()`), "le bouton « Créer la liste » est absent ou désactivé");
      await pollUntilGone(session, nameSelector, 8_000);

      assert.equal(await pollForTextAmong(session, ".lists-page-list-card-title", "Bricolage"), true,
        "la liste créée n'apparaît pas");

      // Elle s'ouvre, et le bouton retour ramène à la page des listes.
      assert.ok(await openListNamed(session, "Bricolage"), "la liste créée ne s'ouvre pas");
      assert.equal(await queryText(session, ".ldv-topbar-name"), "Bricolage");
      // Une liste ordinaire nomme sa section « Articles », pas « À acheter ».
      assert.deepEqual(await sectionTitles(session), ["Articles"]);

      assert.ok(await click(session, ".mrd-back-btn"), "bouton retour du détail introuvable");
      assert.ok(await pollForSelector(session, ".lists-page-header-title", 8_000),
        "le retour doit ramener à la page des listes");
      assert.equal(await evaluate(session, "window.__APP_BOOT_STATE__"), "react-mounted");
    } finally {
      await session.close();
    }
  });
});
