/**
 * Captures d ecran de reference — garde anti-regression visuelle.
 *
 *   node tests/screenshots/capture.mjs baseline     # avant migration
 *   node tests/screenshots/capture.mjs phase-2      # apres une phase
 *   node tests/screenshots/capture.mjs --list       # ecrans connus
 *
 * Les captures vont dans `tests/screenshots/<label>/`. La comparaison se fait
 * avec `compare.mjs`, qui ne cherche pas le pixel parfait mais les ecarts de
 * mise en page francs (voir son en-tete).
 *
 * La navigation passe par une strategie a double detente : les selecteurs
 * maison d aujourd hui, puis les selecteurs Ionic / l URL apres migration. Le
 * meme script sert donc avant et apres, sans quoi la comparaison n aurait
 * aucune reference stable.
 */

import { mkdir, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

import { launchBrowser, openPageSession } from "../helpers/cdp-browser.js";
import { startStaticServer } from "../helpers/static-server.js";
import { buildE2eApp } from "../helpers/e2e-build.js";
import { PLANNER_SEED, FROZEN_DATE } from "./seed.mjs";

const OUT_ROOT = resolve(import.meta.dirname);
const DEBUG_PORT = 9230; // distinct des suites e2e (9222-9225)

/* ── Ecrans ──────────────────────────────────────────────────────────────── */

/**
 * `nav` decrit comment atteindre l ecran. `legacy` = aujourd hui, `route` =
 * apres l arrivee du router (Phase 2). On tente `route` d abord des qu il
 * existe, parce que naviguer par URL est infiniment plus stable qu une
 * cascade de clics.
 */
const SCREENS = [
  { id: "home",          label: "Accueil",              nav: { tab: "Accueil" },                      ready: ".mrd-home" },
  { id: "tasks-daily",   label: "Taches — jour",        nav: { tab: "Tâches" },                       ready: ".task-card, .task-empty-state" },
  { id: "tasks-weekly",  label: "Taches — semaine",     nav: { tab: "Tâches", sub: "Semaine" },       ready: ".task-card, .task-empty-state" },
  { id: "tasks-monthly", label: "Taches — mois",        nav: { tab: "Tâches", sub: "Mois" },          ready: ".task-card, .task-empty-state" },
  { id: "tasks-mine",    label: "Taches — les miennes", nav: { tab: "Tâches", sub: "Mes tâches" },    ready: ".task-card, .task-empty-state" },
  { id: "agenda",        label: "Agenda",               nav: { tab: "Agenda" },                       ready: ".cnt" },
  { id: "meals",         label: "Repas",                nav: { tab: "Repas" },                        ready: ".cnt" },
  { id: "quick-menu",    label: "Menu « Plus » ouvert",  nav: { quickOpen: true },                     ready: ".mrd-bnav-quick-menu, ion-action-sheet" },
  { id: "lists",         label: "Listes",               nav: { quick: "Listes" },                     ready: ".cnt" },
  { id: "notes",         label: "Notes",                nav: { quick: "Notes" },                      ready: ".cnt" },
  { id: "inventory",     label: "Inventaire",           nav: { quick: "Inventaire" },                 ready: ".cnt" },
  { id: "recipes",       label: "Recettes",             nav: { quick: "Recettes" },                   ready: ".cnt" },
  { id: "history",       label: "Historique",           nav: { quick: "Historique" },                 ready: ".cnt" },
  { id: "settings",      label: "Reglages",             nav: { gear: true },                          ready: ".mrd-set-page, .cnt" },

  /* ── Etats de modale ───────────────────────────────────────────────────
     Sans eux, la garde visuelle serait aveugle sur toute la phase 7 : les
     16 overlays maison passent a `IonModal` et aucune capture ne les
     montrait. `open` decrit le clic qui ouvre la modale, une fois l ecran
     atteint. */
  { id: "modal-task-create", label: "Modale — nouvelle tache", nav: { tab: "Tâches" },
    open: { selector: ".mrd-fab, ion-fab-button" }, ready: ".task-modal-redesign, ion-modal" },
  /* Attention : les notes du jeu d essai appartiennent a l utilisateur, et une
     note qu on possede s edite EN LIGNE (`startInlineEdit`) au lieu d ouvrir la
     modale. Cette capture montre donc l edition en ligne. La modale de note ne
     s ouvre que pour une note d un autre membre, cas non couvert. */
  { id: "modal-note",        label: "Note — edition en ligne", nav: { quick: "Notes" },
    open: { text: ["Code du portail"], selector: ".ncard" }, ready: ".note-inline-editing, .note-modal-card, ion-modal" },
  { id: "modal-inventory",   label: "Modale — article",        nav: { quick: "Inventaire" },
    open: { selector: ".mrd-fab, ion-fab-button" }, ready: ".modal-card, ion-modal" },
  /* La carte de recette n est pas cliquable en entier : elle porte un bouton
     « Ouvrir ». Le premier selecteur essaye la carte, faute de quoi on clique
     le bouton par son libelle. */
  { id: "modal-recipe",      label: "Fiche recette",           nav: { quick: "Recettes" },
    open: { text: ["Ouvrir"], selector: "button" },
    ready: ".recipes-page--sheet, .mrd-recipe-view-sheet, .recipe-sheet, ion-modal" },
  { id: "modal-list",        label: "Detail de liste",         nav: { quick: "Listes" },
    open: { text: ["Liste de courses"], selector: ".lists-page-list-card" },
    ready: ".ldv-item, .ldv-head, ion-modal" },
];

/**
 * Variantes capturees.
 *
 * `desktop-light` (1280x900) a ete retiree en phase 6 : le rendu bureau a ete
 * supprime sur decision produit, l app ciblant iOS et Android. Elle est
 * remplacee par un grand telephone — c est la haut de la gamme reellement
 * visee, et c est la que les mises en page serrees se detendent (grilles a
 * deux colonnes, en-tetes, barre segmentee).
 *
 * 390x844  = iPhone 14 / 15 / 16, Pixel 7 — le format le plus courant.
 * 430x932  = iPhone 16 Pro Max, Pixel 9 Pro XL.
 */
const VARIANTS = [
  { id: "mobile-light",  width: 390, height: 844, mobile: true, theme: "light" },
  { id: "mobile-dark",   width: 390, height: 844, mobile: true, theme: "dark"  },
  { id: "mobile-xl-light", width: 430, height: 932, mobile: true, theme: "light" },
];

/* ── Primitives CDP ──────────────────────────────────────────────────────── */

async function evaluate(session, expression) {
  const { result } = await session.send("Runtime.evaluate", {
    expression, returnByValue: true, awaitPromise: true,
  });
  return result?.value;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitFor(session, selector, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = await evaluate(session, `!!document.querySelector(${JSON.stringify(selector)})`);
    if (found === true) return true;
    await sleep(200);
  }
  return false;
}

/**
 * Recherche un element dans le document ET dans les shadow roots.
 *
 * Necessaire depuis Ionic : `ion-action-sheet` et compagnie rendent leurs
 * boutons dans un shadow root, hors de portee de `document.querySelector`.
 */
const DEEP_QUERY_HELPER = `
  window.__mrdDeepAll = (selector) => {
    const out = [];
    const walk = (root) => {
      out.push(...root.querySelectorAll(selector));
      for (const el of root.querySelectorAll("*")) if (el.shadowRoot) walk(el.shadowRoot);
    };
    walk(document);
    return out;
  };
`;

/** Clic sur le premier element (shadow DOM inclus) dont le texte correspond. */
async function clickByText(session, selector, text) {
  return evaluate(session, `(() => {
    ${DEEP_QUERY_HELPER}
    const wanted = ${JSON.stringify(text)}.trim().toLowerCase();
    const page = [...document.querySelectorAll(".ion-page")]
      .filter((p) => !p.classList.contains("ion-page-hidden"))
      .filter((p) => !p.classList.contains("ion-delegate-host") && !p.closest("ion-modal"))
      .pop();
    const scoped = page ? [...page.querySelectorAll(${JSON.stringify(selector)})] : [];
    const nodes = scoped.length ? scoped : window.__mrdDeepAll(${JSON.stringify(selector)});
    const norm = (n) => (n.textContent || "").trim().toLowerCase();
    const hit = nodes.find((n) => norm(n) === wanted)
             || nodes.find((n) => norm(n).includes(wanted))
             || nodes.find((n) => (n.getAttribute("aria-label") || "").trim().toLowerCase().startsWith(wanted));
    if (!hit) return false;
    hit.click();
    return true;
  })()`);
}

/**
 * Clic sur le premier element correspondant, **dans la page visible**.
 *
 * `document.querySelector` prend le premier du document, donc celui d une page
 * restee montee et cachee : la capture de la modale d inventaire ouvrait en
 * fait celle des taches, depuis la page precedente. Meme piege que pour les
 * assertions e2e — avec une pile de pages, une requete non scopee n a plus de
 * sens.
 */
async function clickSelector(session, selector) {
  return evaluate(session, `(() => {
    ${DEEP_QUERY_HELPER}
    const page = [...document.querySelectorAll(".ion-page")]
      .filter((p) => !p.classList.contains("ion-page-hidden"))
      .filter((p) => !p.classList.contains("ion-delegate-host") && !p.closest("ion-modal"))
      .pop();
    const scoped = page ? [...page.querySelectorAll(${JSON.stringify(selector)})] : [];
    const el = scoped[0] || window.__mrdDeepAll(${JSON.stringify(selector)})[0];
    if (!el) return false;
    el.click();
    return true;
  })()`);
}

/**
 * Attend la fin d une transition de page Ionic.
 *
 * `IonRouterOutlet` garde la page sortante montee le temps de l animation, en
 * lui posant `.ion-page-hidden`. Capturer pendant ce laps donne une image a
 * mi-course, ou deux pages superposees. On attend donc qu il ne reste qu une
 * seule page visible et aucune page marquee invisible.
 */
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
      if (!pages.length) return true; // pas encore de router : rien a attendre
      if (pages.some((p) => p.classList.contains("ion-page-invisible"))) return false;
      return pages.filter((p) => !p.classList.contains("ion-page-hidden")).length === 1;
    })()`);
    if (settled === true) return true;
    await sleep(120);
  }
  return false;
}

/* ── Onboarding : atteindre la page d accueil ─────────────────────────────── */

async function setInputValue(session, selector, value) {
  await evaluate(session, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
}

async function waitNextEnabled(session, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const disabled = await evaluate(session, `document.querySelector(".onb-footer-next")?.disabled ?? null`);
    if (disabled === false) return true;
    await sleep(150);
  }
  return false;
}

/** Reproduit le parcours CREATE de l onboarding (cf. tests/e2e/navigation.test.js). */
async function reachHome(session) {
  if (!await waitFor(session, ".onboarding-shell", 20_000)) {
    // Deja passe (session reutilisee) ou ecran different.
    return waitFor(session, ".mrd-bnav, ion-tab-bar", 10_000);
  }
  await clickSelector(session, ".onboarding-choice-card:first-child");
  await waitFor(session, ".onboarding-input", 6000);
  await setInputValue(session, ".onboarding-input", "Steve");
  await waitNextEnabled(session);
  await clickSelector(session, ".onb-footer-next");

  await waitFor(session, ".onb-color-swatch", 6000);
  await clickSelector(session, ".onb-color-swatch");
  await waitNextEnabled(session);
  await clickSelector(session, ".onb-footer-next");

  await waitFor(session, ".onb-suggestion-chip", 6000);
  await clickSelector(session, ".onb-suggestion-chip");
  await waitNextEnabled(session);
  await clickSelector(session, ".onb-footer-next");

  await waitFor(session, ".onb-footer-next", 4000);
  await clickSelector(session, ".onb-footer-next");

  return waitFor(session, ".mrd-bnav, ion-tab-bar", 20_000);
}

/** Ferme les modales post-onboarding (notifications, bienvenue) s il y en a. */
async function dismissPostOnboarding(session) {
  for (let i = 0; i < 4; i++) {
    const closed = await evaluate(session, `(() => {
      const later = [...document.querySelectorAll("button")].find((b) => {
        const t = (b.textContent || "").trim().toLowerCase();
        return t === "plus tard" || t === "non merci" || t === "fermer" || t === "compris";
      });
      if (later) { later.click(); return true; }
      const closeBtn = document.querySelector(".notif-prompt-card button:last-child, .invite-codes-backdrop button, .mrd-mclose");
      if (closeBtn) { closeBtn.click(); return true; }
      return false;
    })()`);
    if (!closed) break;
    await sleep(400);
  }
}

/* ── Navigation vers un ecran ────────────────────────────────────────────── */

/**
 * Selecteurs de navigation, valables avant ET apres la migration Ionic.
 *
 * Le meme script sert de reference pour toutes les phases : il tente d abord
 * le selecteur Ionic, puis le selecteur maison. Sans quoi la baseline serait
 * perdue a la premiere phase et il n y aurait plus rien a comparer.
 */
const TAB_SELECTORS = ["ion-tab-button", ".mrd-bnav-btn"];
const QUICK_ITEM_SELECTORS = [".action-sheet-button", "ion-action-sheet button", ".mrd-bnav-quick-item"];
const SUBTAB_SELECTORS = ["ion-segment-button", ".mrd-subtab-btn"];

/** Clique le premier selecteur de la liste qui trouve le libelle demande. */
async function clickAny(session, selectors, text) {
  for (const selector of selectors) {
    if (await clickByText(session, selector, text) === true) return true;
  }
  return false;
}

/** Ferme une modale restee ouverte — sinon l ecran suivant est capture dessous. */
async function dismissModal(session) {
  const open = await evaluate(session, `!!document.querySelector("ion-modal, .modal-backdrop, .note-modal-backdrop, .recipes-page--sheet")`);
  if (!open) return;
  await evaluate(session, `(() => {
    const m = document.querySelector("ion-modal");
    if (m?.dismiss) { m.dismiss(); return; }
    // Overlays maison : cliquer le fond, ou le bouton de fermeture.
    const closer = document.querySelector(".mrd-mclose, .note-modal-close, .delbtn, .mrd-back-btn");
    if (closer) { closer.click(); return; }
    document.querySelector(".modal-backdrop, .note-modal-backdrop")?.click();
  })()`);
  await sleep(450);
}

/** Ferme une feuille d actions ouverte, si besoin. */
async function dismissActionSheet(session) {
  const open = await evaluate(session, `!!document.querySelector("ion-action-sheet")`);
  if (!open) return;
  await evaluate(session, `document.querySelector("ion-action-sheet")?.dismiss?.()`);
  await sleep(400);
}

/**
 * Revient a l accueil, quel que soit l ecran courant.
 *
 * Les etapes sont conditionnelles a dessein : avec 19 ecrans x 3 variantes,
 * quelques centaines de millisecondes de frais fixes par ecran finissent par
 * faire des minutes. On ne paie que ce qui est necessaire.
 */
async function backToHome(session) {
  await dismissActionSheet(session);
  await dismissModal(session);
  // Un ecran secondaire ou les reglages : sortir d abord par le bouton retour.
  const hasBack = await evaluate(session, `!!document.querySelector("ion-back-button, .mrd-back-btn")`);
  if (hasBack === true) {
    await clickSelector(session, "ion-back-button");
    await clickSelector(session, ".mrd-back-btn");
    await waitForPageSettled(session);
  }
  await clickAny(session, TAB_SELECTORS, "Accueil");
  await waitForPageSettled(session);
  await sleep(200);
}

/**
 * Amene l app sur l ecran demande, en cliquant comme un utilisateur.
 *
 * La navigation par URL a ete essayee puis abandonnee : `history.pushState`
 * suivi d un `popstate` synthetique change bien l URL — la barre d onglets
 * s allumait au bon endroit — mais ne declenche pas la navigation de React
 * Router, donc `IonRouterOutlet` gardait la page precedente a l ecran. Les
 * captures montraient l accueil sous le titre « Agenda ».
 */
/**
 * Ouvre une modale depuis l ecran courant.
 *
 * `text` d abord (cliquer un element identifiable par son libelle), sinon le
 * premier selecteur qui repond. Les deux listes acceptent les selecteurs
 * maison ET Ionic, pour que le meme script serve avant et apres la phase 7.
 */
async function openOverlay(session, open) {
  if (!open) return true;
  let clicked = false;
  if (open.text) {
    for (const label of open.text) {
      if (await clickByText(session, open.selector, label) === true) { clicked = true; break; }
    }
  }
  if (!clicked) clicked = await clickSelector(session, open.selector) === true;
  if (!clicked) return false;
  // Une modale Ionic s anime : attendre qu elle soit posee.
  await sleep(700);
  return true;
}

async function gotoScreen(session, screen) {
  const { tab, sub, quick, quickOpen, gear } = screen.nav;

  await backToHome(session);

  if (gear) {
    const ok = await clickSelector(session, `.mrd-gear-btn[aria-label="Paramètres"]`);
    await waitForPageSettled(session);
    await sleep(500);
    return ok === true;
  }

  if (quickOpen || quick) {
    await clickAny(session, TAB_SELECTORS, "Plus");
    await sleep(500);
    if (quickOpen) return true;
    const ok = await clickAny(session, QUICK_ITEM_SELECTORS, quick);
    await waitForPageSettled(session);
    await sleep(500);
    if (ok !== true) return false;
    return openOverlay(session, screen.open);
  }

  if (tab) {
    const ok = await clickAny(session, TAB_SELECTORS, tab);
    await waitForPageSettled(session);
    await sleep(400);
    if (sub) {
      await clickAny(session, SUBTAB_SELECTORS, sub);
      await sleep(400);
    }
    return ok === true;
  }
  return false;
}

/* ── Capture ─────────────────────────────────────────────────────────────── */

async function screenshot(session, path) {
  const { data } = await session.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(path, Buffer.from(data, "base64"));
}

async function runVariant(browser, serverUrl, variant, outDir, report) {
  const session = await openPageSession(browser, "about:blank");

  await session.send("Emulation.setDeviceMetricsOverride", {
    width: variant.width, height: variant.height,
    deviceScaleFactor: 2, mobile: variant.mobile,
  });
  // Desactive les animations : sinon une capture attrape une transition a
  // mi-course et la comparaison signale un faux ecart.
  await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });

  const bootScript = `
    window.__E2E_PLANNER_SEED = ${JSON.stringify(PLANNER_SEED)};
    window.__E2E_PREMIUM = true;
    try {
      localStorage.setItem("mrd-theme", ${JSON.stringify(variant.theme)});
      // Date figee (cf. src/utils/date.js) : sans elle, « Aujourd hui » et la
      // grille de semaine changent a chaque execution et toute comparaison
      // visuelle devient du bruit.
      localStorage.setItem("mrd-app-time-mode", "simulated");
      localStorage.setItem("mrd-app-time-simulated", ${JSON.stringify(FROZEN_DATE)});
      // Neutralise la modale « Activer les notifications ? » (src/utils/storage.js).
      localStorage.setItem("mrd_notif_prompt", JSON.stringify({ dismissCount: 3, lastDismissed: null, granted: true }));
    } catch (e) {}
    const style = document.createElement("style");
    style.textContent = "*,*::before,*::after{animation-duration:0s !important;animation-delay:0s !important;transition-duration:0s !important;transition-delay:0s !important}";
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(style));
  `;
  await session.send("Page.addScriptToEvaluateOnNewDocument", { source: bootScript });

  await session.send("Page.navigate", { url: serverUrl });
  await session.waitForEvent("Page.loadEventFired", 30_000).catch(() => {});

  const reached = await reachHome(session);
  if (!reached) {
    report.push({ variant: variant.id, screen: "(onboarding)", ok: false, note: "page d accueil jamais atteinte" });
    await session.close();
    return;
  }
  await dismissPostOnboarding(session);
  await sleep(600);

  for (const screen of SCREENS) {
    let ok = false;
    try {
      ok = await gotoScreen(session, screen);
      if (ok && screen.ready) await waitFor(session, screen.ready, 6000);
      await waitForPageSettled(session);
      await sleep(400);
      await screenshot(session, join(outDir, `${variant.id}__${screen.id}.png`));
      const crashed = await evaluate(session, `window.__APP_BOOT_STATE__ !== "react-mounted" || !!document.getElementById("mrd-fatal-overlay")`);
      report.push({
        variant: variant.id, screen: screen.id, ok: ok && !crashed,
        note: crashed ? "ERREUR FATALE affichee" : (ok ? "" : "navigation echouee"),
      });
    } catch (error) {
      report.push({ variant: variant.id, screen: screen.id, ok: false, note: String(error.message || error) });
    }
  }

  await session.close();
}

/* ── Entree ──────────────────────────────────────────────────────────────── */

async function main() {
  const label = process.argv[2];
  if (!label || label === "--list") {
    console.log("Ecrans :", SCREENS.map((s) => s.id).join(", "));
    console.log("Variantes :", VARIANTS.map((v) => v.id).join(", "));
    if (!label) console.log("\nUsage : node tests/screenshots/capture.mjs <label>");
    return;
  }

  const outDir = join(OUT_ROOT, label);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  console.log("→ build e2e (Vite + stubs Firebase)…");
  const distDir = await buildE2eApp();

  const server = await startStaticServer(distDir);
  console.log(`→ serveur ${server.url}`);

  const browser = await launchBrowser(DEBUG_PORT);
  if (!browser) {
    await server.close();
    throw new Error("Aucun navigateur headless trouve (voir BROWSER_CANDIDATES dans tests/helpers/cdp-browser.js).");
  }

  const report = [];
  try {
    for (const variant of VARIANTS) {
      console.log(`→ ${variant.id}…`);
      await runVariant(browser, server.url, variant, outDir, report);
    }
  } finally {
    await browser.close();
    await server.close();
  }

  const failures = report.filter((r) => !r.ok);
  console.log(`\n${report.length - failures.length}/${report.length} captures reussies → ${outDir}`);
  for (const f of failures) console.log(`  ✗ ${f.variant} / ${f.screen} — ${f.note}`);
  await writeFile(join(outDir, "report.json"), JSON.stringify(report, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
