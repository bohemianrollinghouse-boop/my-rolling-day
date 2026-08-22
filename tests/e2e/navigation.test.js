/**
 * Tests E2E — Navigation par onglets Ionic
 *
 * Ce fichier dupliquait `NAV_TABS` et `getBottomId` en JavaScript pur pour les
 * tester sans navigateur. Ces deux-là vivent maintenant dans `src/routes.js` et
 * sont couverts par `tests/unit/routes.test.js`, qui teste **le vrai module**
 * plutôt qu'une copie — une copie qui, par construction, reste verte même si
 * l'original casse. La section « logique pure » a donc disparu d'ici.
 *
 * Ce qui reste ne peut se vérifier qu'en vrai :
 *   – l'onboarding mène à une barre d'onglets Ionic
 *   – chaque onglet affiche son écran, sans crash
 *   – l'URL suit l'onglet (c'est ce que le routeur apporte)
 *   – le bouton retour du navigateur revient à l'écran précédent
 *   – le bouton « Plus » ouvre une feuille d'actions, et ses entrées naviguent
 *
 * Port de debug : 9225 (smoke=9222, standalone=9223, profile=9224,
 * theme=9226, captures=9230)
 */

import test from "node:test";
import assert from "node:assert/strict";

import { launchBrowser, openPageSession } from "../helpers/cdp-browser.js";
import { startStaticServer } from "../helpers/static-server.js";
import { buildE2eApp } from "../helpers/e2e-build.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers CDP
// ─────────────────────────────────────────────────────────────────────────────

async function evaluate(session, expression) {
  const { result } = await session.send("Runtime.evaluate", {
    expression, returnByValue: true, awaitPromise: true,
  });
  return result?.value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pollForSelector(session, selector, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(session, `!!document.querySelector(${JSON.stringify(selector)})`) === true) return true;
    await sleep(200);
  }
  return false;
}

/**
 * Texte d'un element, cherche dans la page VISIBLE uniquement.
 *
 * Indispensable depuis `IonRouterOutlet` : la page qu'on vient de quitter reste
 * montee dans le DOM, marquee `.ion-page-hidden`. Un `document.querySelector`
 * global renvoie la premiere occurrence, donc souvent celle de l'ancienne page
 * — le test lisait « Tâches » alors qu'il etait sur l'agenda. Avec une pile de
 * pages, une requete non scopee n'a plus de sens.
 */
async function queryTextInActivePage(session, selector) {
  return evaluate(session, `(() => {
    const page = [...document.querySelectorAll(".ion-page")]
      .filter((p) => !p.classList.contains("ion-page-hidden"))
      .pop();
    const root = page || document;
    return root.querySelector(${JSON.stringify(selector)})?.textContent?.trim() ?? "";
  })()`);
}

/** Presence d'un selecteur dans la page visible. */
async function pollForSelectorInActivePage(session, selector, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = await evaluate(session, `(() => {
      const page = [...document.querySelectorAll(".ion-page")]
        .filter((p) => !p.classList.contains("ion-page-hidden"))
        .pop();
      return !!(page || document).querySelector(${JSON.stringify(selector)});
    })()`);
    if (found === true) return true;
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

/** Clique l'onglet dont l'aria-label commence par ce libellé. */
async function clickTab(session, label) {
  return evaluate(session, `(() => {
    const btn = [...document.querySelectorAll("ion-tab-button")]
      .find((b) => (b.getAttribute("aria-label") || "").startsWith(${JSON.stringify(label)}));
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
}

/**
 * Attend la fin de la transition de page.
 *
 * `IonRouterOutlet` garde la page sortante montée le temps de l'animation, en
 * lui posant `.ion-page-hidden`. Sans cette attente, une assertion peut lire le
 * contenu de la page qu'on vient de quitter et échouer par intermittence.
 */
async function waitForPageSettled(session, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const settled = await evaluate(session, `(() => {
      const pages = [...document.querySelectorAll(".ion-page")];
      if (!pages.length) return false;
      if (pages.some((p) => p.classList.contains("ion-page-invisible"))) return false;
      return pages.filter((p) => !p.classList.contains("ion-page-hidden")).length === 1;
    })()`);
    if (settled === true) return true;
    await sleep(120);
  }
  return false;
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

/** Balayage depuis le bord gauche — le geste de retour iOS. */
async function swipeBackFromLeftEdge(session, { y = 400, to = 340 } = {}) {
  const touch = (type, x) => session.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: type === "touchEnd" ? [] : [{ x, y }],
  });
  await touch("touchStart", 3);
  for (let x = 20; x <= to; x += 20) {
    await touch("touchMove", x);
    await sleep(16);
  }
  await touch("touchEnd", to);
  await sleep(900);
  await waitForPageSettled(session);
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
  await setInputValue(session, ".onboarding-input", "E2E Nav");
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

// ─────────────────────────────────────────────────────────────────────────────

test("CDP: navigation entre onglets — aucun crash", { timeout: 240_000 }, async (t) => {
  let serverHandle;
  let browserHandle;
  let browserLaunchError = null;

  t.before(async () => {
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

  /**
   * Ouvre une session sur le build stubbé.
   *
   * `touch: true` active l'émulation tactile **avant** la navigation, et c'est
   * indispensable : Ionic arme le geste de retour à l'initialisation de
   * l'outlet. L'activer après coup laisse le geste inerte — le test échouait
   * en restant sur `/notes` alors que le même scénario fonctionnait quand
   * l'émulation précédait le chargement.
   */
  async function openStubbed({ touch = false } = {}) {
    const session = await openPageSession(browserHandle);
    if (touch) {
      await session.send("Emulation.setDeviceMetricsOverride", {
        width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
      });
      await session.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
      /* La modale « Activer les notifications ? » s'ouvre juste après
         l'onboarding et couvre tout l'écran : elle avalait le geste de
         balayage, et le test échouait en restant sur `/notes` alors que le
         geste était bien armé. Marquer la demande comme déjà traitée
         (`src/utils/storage.js`) reproduit l'état d'un utilisateur qui revient,
         ce qui est le contexte où le geste a un sens. */
      await session.send("Page.addScriptToEvaluateOnNewDocument", {
        source: `try { localStorage.setItem("mrd_notif_prompt",
          JSON.stringify({ dismissCount: 3, lastDismissed: null, granted: true })); } catch (e) {}`,
      });
    }
    await session.send("Page.navigate", { url: `${serverHandle.url}/` });
    await session.waitForEvent("Page.loadEventFired", 15_000);
    return session;
  }

  await t.test("[1] onboarding → page d'accueil (ion-tab-bar visible)", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }
    const session = await openStubbed();
    try {
      assert.ok(await reachHomePage(session), "ion-tab-bar doit être visible après l'onboarding");
      assert.equal(await evaluate(session, "window.__APP_BOOT_STATE__"), "react-mounted");
      // La coque Ionic doit envelopper l'app, sinon rien du reste ne tient.
      assert.ok(await evaluate(session, `!!document.querySelector("ion-app")`), "ion-app absent");
      assert.ok(await evaluate(session, `!!document.querySelector("ion-router-outlet")`), "ion-router-outlet absent");
    } finally {
      await session.close();
    }
  });

  /* Chaque onglet est testé en séquence dans la même session : rejouer
     l'onboarding cinq fois coûterait une minute pour rien. */
  await t.test("[2] chaque onglet affiche son écran, et l'URL suit", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }

    const TABS = [
      { navLabel: "Tâches", path: "/tasks/daily", charSelector: ".mrd-screen-hdr-title", charText: "Tâches" },
      { navLabel: "Agenda", path: "/agenda",      charSelector: ".mrd-screen-hdr-title", charText: "Agenda" },
      { navLabel: "Repas",  path: "/meals",       charSelector: ".mrd-screen-hdr-title", charText: "Repas" },
      { navLabel: "Accueil", path: "/home",       charSelector: ".mrd-home",             charText: null },
    ];

    const session = await openStubbed();
    try {
      assert.ok(await reachHomePage(session), "Prérequis : ion-tab-bar visible");

      for (const tab of TABS) {
        assert.ok(await clickTab(session, tab.navLabel), `onglet « ${tab.navLabel} » introuvable`);
        await waitForPageSettled(session);
        await sleep(250);

        assert.equal(await evaluate(session, "window.__APP_BOOT_STATE__"), "react-mounted",
          `Onglet « ${tab.navLabel} » : l'app a crashé`);

        // Le gain du routeur : l'écran a une URL, donc un état partageable.
        assert.equal(await evaluate(session, "location.pathname"), tab.path,
          `Onglet « ${tab.navLabel} » : l'URL doit être ${tab.path}`);

        /* Comment Ionic marque l'onglet actif : l'attribut `selected="true"`
           et la classe `tab-selected`. **Pas** `aria-selected` (essayé, absent)
           ni `aria-current="page"` (c'était l'ancienne barre maison). Vérifié
           par inspection du DOM rendu, pas déduit de la doc. */
        const marks = await evaluate(session, `(() => {
          const btn = [...document.querySelectorAll("ion-tab-button")]
            .find((b) => (b.getAttribute("aria-label") || "").startsWith(${JSON.stringify(tab.navLabel)}));
          if (!btn) return null;
          return JSON.stringify({
            selected: btn.getAttribute("selected"),
            hasClass: btn.classList.contains("tab-selected"),
          });
        })()`);
        assert.ok(marks, `onglet « ${tab.navLabel} » introuvable pour la vérification d'état`);
        const { selected, hasClass } = JSON.parse(marks);
        assert.equal(selected, "true", `Onglet « ${tab.navLabel} » : selected="true" attendu`);
        assert.ok(hasClass, `Onglet « ${tab.navLabel} » : classe .tab-selected attendue`);

        /* Et un seul à la fois : deux onglets allumés est un symptôme de
           `selectedTab` désynchronisé de l'URL. */
        const selectedCount = await evaluate(session,
          `document.querySelectorAll("ion-tab-button.tab-selected").length`);
        assert.equal(selectedCount, 1, `un seul onglet doit être actif (trouvé ${selectedCount})`);

        assert.ok(await pollForSelectorInActivePage(session, tab.charSelector, 5_000),
          `Onglet « ${tab.navLabel} » : ${tab.charSelector} absent de la page visible`);

        if (tab.charText !== null) {
          const text = await queryTextInActivePage(session, tab.charSelector);
          assert.ok(text.includes(tab.charText),
            `Onglet « ${tab.navLabel} » : ${tab.charSelector} doit contenir « ${tab.charText} » (trouvé « ${text} »)`);
        }
      }
    } finally {
      await session.close();
    }
  });

  /* Le vrai apport du routeur, et ce qui était impossible avant : le bouton
     retour du navigateur — donc le bouton retour matériel d'Android, que
     Capacitor y branche. */
  await t.test("[3] le bouton retour revient à l'écran précédent", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }
    const session = await openStubbed();
    try {
      assert.ok(await reachHomePage(session), "Prérequis : ion-tab-bar visible");

      await clickTab(session, "Agenda");
      await waitForPageSettled(session);
      assert.equal(await evaluate(session, "location.pathname"), "/agenda");

      await evaluate(session, "history.back()");
      await sleep(900);
      await waitForPageSettled(session);

      assert.equal(await evaluate(session, "location.pathname"), "/home",
        "le retour navigateur doit ramener sur l'accueil");
      assert.equal(await evaluate(session, "window.__APP_BOOT_STATE__"), "react-mounted");
      assert.ok(await pollForSelectorInActivePage(session, ".mrd-home", 5_000), "l'accueil doit être réaffiché");
    } finally {
      await session.close();
    }
  });

  /* Listes, Notes, Inventaire, Recettes et Historique n'ont pas d'onglet : ils
     passent par le bouton « Plus », qui ouvre désormais une feuille d'actions
     Ionic au lieu d'un menu maison replié par un écouteur `document
     mousedown`. */
  await t.test("[4] le bouton « Plus » ouvre une feuille d'actions qui navigue", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }
    const session = await openStubbed();
    try {
      assert.ok(await reachHomePage(session), "Prérequis : ion-tab-bar visible");

      assert.ok(await clickTab(session, "Plus"), "onglet « Plus » introuvable");
      assert.ok(await pollForSelector(session, "ion-action-sheet", 4_000),
        "« Plus » doit ouvrir une ion-action-sheet");

      // Les boutons de la feuille sont dans un shadow root : hors de portée de
      // document.querySelector.
      const clicked = await evaluate(session, `(() => {
        const sheet = document.querySelector("ion-action-sheet");
        const root = sheet?.shadowRoot || sheet;
        const btn = [...(root?.querySelectorAll("button") || [])]
          .find((b) => (b.textContent || "").includes("Listes"));
        if (!btn) return false;
        btn.click();
        return true;
      })()`);
      assert.ok(clicked, "l'entrée « Listes » doit être présente dans la feuille");

      await waitForPageSettled(session);
      assert.ok(await pollForSelectorInActivePage(session, ".lists-page-header", 6_000),
        "« Listes » doit ouvrir l'écran Listes");
      assert.equal(await evaluate(session, "location.pathname"), "/lists");
      assert.equal(await evaluate(session, "window.__APP_BOOT_STATE__"), "react-mounted");
    } finally {
      await session.close();
    }
  });

  /* Le vrai gain de la phase 4 : les écrans du menu « Plus » s'empilent
     par-dessus l'accueil au lieu d'être un simple changement d'état, ce qui
     leur donne un bouton retour Ionic **et** le geste de balayage. Les trois
     chemins de retour (bouton, geste, retour matériel) remontent maintenant la
     même pile. */
  await t.test("[5] le bouton retour Ionic remonte la pile", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }
    const session = await openStubbed({ touch: true });
    try {
      assert.ok(await reachHomePage(session), "Prérequis : ion-tab-bar visible");
      assert.ok(await openQuickScreen(session, "Notes"), "« Notes » doit s'ouvrir");
      assert.equal(await evaluate(session, "location.pathname"), "/notes");

      // Un bouton retour maison n'aurait rien dit de la pile ; celui d'Ionic
      // n'apparaît que si la page a bien été empilée.
      assert.ok(await evaluate(session, `!!document.querySelector("ion-back-button")`),
        "l'écran secondaire doit porter un ion-back-button");
      assert.ok(await evaluate(session,
        `[...document.querySelectorAll(".ion-page")].some((p) => p.classList.contains("can-go-back"))`),
        "la page doit être marquée can-go-back");

      /* Un seul clic, et il faut y veiller : `el?.click() ?? autre.click()`
         clique DEUX fois, `click()` renvoyant `undefined` — donc `??` évalue
         aussi la branche de droite. Le test remontait alors deux niveaux de
         pile et échouait sur une URL inattendue. */
      await evaluate(session, `(() => {
        const btn = document.querySelector("ion-back-button");
        const inner = btn?.shadowRoot?.querySelector("button");
        (inner || btn)?.click();
        return !!btn;
      })()`);
      await sleep(900);
      await waitForPageSettled(session);

      assert.equal(await evaluate(session, "location.pathname"), "/home");
      assert.ok(await pollForSelectorInActivePage(session, ".mrd-home", 5_000),
        "l'accueil doit être réaffiché");
    } finally {
      await session.close();
    }
  });

  /* Impossible avant la migration : il n'y avait pas de pile à remonter.
     Testé par vrais événements tactiles — c'est le seul moyen de savoir si le
     geste est réellement armé, et non simplement si le code semble correct. */
  await t.test("[6] le balayage depuis le bord gauche revient en arrière", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }
    const session = await openStubbed({ touch: true });
    try {
      assert.ok(await reachHomePage(session), "Prérequis : ion-tab-bar visible");
      assert.ok(await openQuickScreen(session, "Notes"), "« Notes » doit s'ouvrir");
      assert.equal(await evaluate(session, "location.pathname"), "/notes");

      await swipeBackFromLeftEdge(session);

      assert.equal(await evaluate(session, "location.pathname"), "/home",
        "le balayage depuis le bord gauche doit remonter la pile");
      assert.ok(await pollForSelectorInActivePage(session, ".mrd-home", 5_000),
        "l'accueil doit être réaffiché après le geste");
      assert.equal(await evaluate(session, "window.__APP_BOOT_STATE__"), "react-mounted");
    } finally {
      await session.close();
    }
  });

  /* Non-régression sur un bug de la phase 5, invisible à l'écran.

     Un effet remettait à zéro l'écran des réglages quand `user` passait à
     `null` : trois `setState` devenus trois navigations, dont deux empilaient
     `/settings`. Et cet effet tourne aussi au démarrage, `user` valant `null`
     avant la réponse de Firebase. Résultat : après l'onboarding, l'historique
     contenait « / → /settings → /settings → /home », et deux retours depuis
     n'importe quel écran ramenaient dans les réglages. Rien ne se voyait :
     l'app s'affichait correctement, seule la pile était polluée. */
  await t.test("[7] l'historique ne contient pas d'entrée parasite", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }
    const session = await openStubbed({ touch: true });
    try {
      assert.ok(await reachHomePage(session), "Prérequis : ion-tab-bar visible");
      assert.ok(await openQuickScreen(session, "Notes"), "« Notes » doit s'ouvrir");
      assert.equal(await evaluate(session, "location.pathname"), "/notes");

      await evaluate(session, "history.back()");
      await sleep(900);
      await waitForPageSettled(session);
      assert.equal(await evaluate(session, "location.pathname"), "/home",
        "premier retour : l'accueil");

      /* Le deuxième retour doit sortir de l'app (ou ne rien faire), jamais
         atterrir dans les réglages : rien n'a ouvert les réglages de tout le
         parcours. */
      await evaluate(session, "history.back()");
      await sleep(900);
      const after = await evaluate(session, "location.pathname");
      assert.notEqual(after, "/settings",
        `deuxième retour : ne doit pas ramener dans les réglages (obtenu ${after})`);
      assert.equal(await evaluate(session, "window.__APP_BOOT_STATE__"), "react-mounted");
    } finally {
      await session.close();
    }
  });
});
