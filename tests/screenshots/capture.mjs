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
  { id: "home",           label: "Accueil",            nav: { legacy: { tab: "Accueil" },  route: "/home" },            ready: ".mrd-home, ion-content" },
  { id: "tasks-daily",    label: "Taches — jour",      nav: { legacy: { tab: "Tâches" },   route: "/tasks/daily" },     ready: ".task-card, .task-empty-state" },
  { id: "tasks-weekly",   label: "Taches — semaine",   nav: { legacy: { tab: "Tâches", sub: "Semaine" },   route: "/tasks/weekly" },  ready: ".task-card, .task-empty-state" },
  { id: "tasks-monthly",  label: "Taches — mois",      nav: { legacy: { tab: "Tâches", sub: "Mois" },      route: "/tasks/monthly" }, ready: ".task-card, .task-empty-state" },
  { id: "tasks-mine",     label: "Taches — les miennes", nav: { legacy: { tab: "Tâches", sub: "Mes tâches" }, route: "/tasks/mine" }, ready: ".task-card, .task-empty-state" },
  { id: "agenda",         label: "Agenda",             nav: { legacy: { tab: "Agenda" },   route: "/agenda" },          ready: ".cnt, ion-content" },
  { id: "meals",          label: "Repas",              nav: { legacy: { tab: "Repas" },    route: "/meals" },           ready: ".cnt, ion-content" },
  { id: "quick-menu",     label: "Menu « Plus » ouvert", nav: { legacy: { quickOpen: true }, route: null },             ready: ".mrd-bnav-quick-menu, ion-action-sheet" },
  { id: "lists",          label: "Listes",             nav: { legacy: { quick: "Listes" },     route: "/lists" },       ready: ".cnt, ion-content" },
  { id: "notes",          label: "Notes",              nav: { legacy: { quick: "Notes" },      route: "/notes" },       ready: ".cnt, ion-content" },
  { id: "inventory",      label: "Inventaire",         nav: { legacy: { quick: "Inventaire" }, route: "/inventory" },   ready: ".cnt, ion-content" },
  { id: "recipes",        label: "Recettes",           nav: { legacy: { quick: "Recettes" },   route: "/recipes" },     ready: ".cnt, ion-content" },
  { id: "history",        label: "Historique",         nav: { legacy: { quick: "Historique" }, route: "/history" },     ready: ".cnt, ion-content" },
  { id: "settings",       label: "Reglages",           nav: { legacy: { gear: true },      route: "/settings" },        ready: ".mrd-set-page, .cnt, ion-content" },
];

const VARIANTS = [
  { id: "mobile-light",  width: 390,  height: 844, mobile: true,  theme: "light" },
  { id: "mobile-dark",   width: 390,  height: 844, mobile: true,  theme: "dark"  },
  { id: "desktop-light", width: 1280, height: 900, mobile: false, theme: "light" },
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

/** Clic sur le premier element dont le texte correspond exactement. */
async function clickByText(session, selector, text) {
  return evaluate(session, `(() => {
    const wanted = ${JSON.stringify(text)}.trim();
    const nodes = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const hit = nodes.find((n) => (n.textContent || "").trim() === wanted)
             || nodes.find((n) => (n.textContent || "").trim().includes(wanted))
             || nodes.find((n) => (n.getAttribute("aria-label") || "").trim() === wanted);
    if (!hit) return false;
    hit.click();
    return true;
  })()`);
}

async function clickSelector(session, selector) {
  return evaluate(session, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.click();
    return true;
  })()`);
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

/** Revient a l accueil, quel que soit l ecran courant. */
async function backToHome(session, hasRouter) {
  if (hasRouter) {
    await evaluate(session, `window.__mrdNav ? window.__mrdNav("/home") : (location.hash = "#/home")`);
    await sleep(500);
    return;
  }
  // Legacy : bouton retour eventuel, puis onglet Accueil.
  await clickSelector(session, ".mrd-back-btn");
  await sleep(250);
  await clickByText(session, ".mrd-bnav-btn", "Accueil");
  await sleep(400);
}

async function detectRouter(session) {
  return (await evaluate(session, `!!document.querySelector("ion-tab-bar, ion-router-outlet")`)) === true;
}

async function gotoScreen(session, screen, hasRouter) {
  const { legacy, route } = screen.nav;

  if (hasRouter && route) {
    await evaluate(session, `(() => {
      const path = ${JSON.stringify(route)};
      if (window.__mrdNav) { window.__mrdNav(path); return; }
      history.pushState({}, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    })()`);
    await sleep(700);
    return true;
  }

  await backToHome(session, hasRouter);

  if (legacy.gear) {
    const ok = await clickSelector(session, `.mrd-gear-btn[aria-label="Paramètres"]`);
    await sleep(700);
    return ok === true;
  }

  if (legacy.quickOpen || legacy.quick) {
    await clickByText(session, ".mrd-bnav-btn", "Plus");
    await sleep(450);
    if (legacy.quickOpen) return true;
    const ok = await clickByText(session, ".mrd-bnav-quick-item", legacy.quick);
    await sleep(700);
    return ok === true;
  }

  if (legacy.tab) {
    await clickByText(session, ".mrd-bnav-btn", legacy.tab);
    await sleep(600);
    if (legacy.sub) {
      await clickByText(session, ".mrd-subtab-btn", legacy.sub);
      await sleep(500);
    }
    return true;
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

  const hasRouter = await detectRouter(session);

  for (const screen of SCREENS) {
    if (hasRouter && screen.nav.route === null) {
      report.push({ variant: variant.id, screen: screen.id, ok: true, note: "ignore (sans objet avec le router)" });
      continue;
    }
    let ok = false;
    try {
      ok = await gotoScreen(session, screen, hasRouter);
      if (ok && screen.ready) await waitFor(session, screen.ready, 6000);
      await sleep(500);
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
