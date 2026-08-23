/**
 * Banc de mesure des zones sûres (safe areas).
 *
 * Pourquoi ce fichier existe : la garde visuelle de `capture.mjs` a validé
 * 57/57 captures IDENTIQUE pendant toute la migration Ionic, et pourtant trois
 * défauts de marge sont passés — barre d'onglets écrasée en bas, accueil et
 * repas collés à l'heure du téléphone en haut. Chrome headless n'a **aucun
 * inset** : `env(safe-area-inset-*)` valait 0 partout, donc les captures ne
 * pouvaient rien voir. L'app ne tourne jamais dans ces conditions sur un
 * téléphone.
 *
 * `Emulation.setSafeAreaInsetsOverride` (CDP) permet de forcer de vrais insets.
 * On mesure alors la géométrie réelle plutôt que de comparer des pixels : où
 * commence le contenu, quelle hauteur utile reste à la barre d'onglets, et
 * est-ce que le premier élément visible est sous l'encoche.
 *
 * Usage :
 *   node tests/screenshots/safe-area.mjs            # tableau de mesures
 *   node tests/screenshots/safe-area.mjs --shots    # + captures dans safe-area/
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildE2eApp } from "../helpers/e2e-build.js";
import { startStaticServer } from "../helpers/static-server.js";
import { launchBrowser, openPageSession } from "../helpers/cdp-browser.js";
import { PLANNER_SEED, FROZEN_DATE } from "./seed.mjs";
// Le parcours d onboarding est deja ecrit et maintenu dans `capture.mjs` : on
// le reutilise plutot que d en tenir une deuxieme copie qui divergerait.
import { reachHome, dismissPostOnboarding, clickAny, TAB_SELECTORS } from "./capture.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const WANT_SHOTS = process.argv.includes("--shots");

/* iPhone 15 en portrait : 393×852 points, encoche 59, indicateur d'accueil 34.
   Ce sont les insets que WKWebView expose réellement, pas une approximation. */
const DEVICE = { width: 393, height: 852, insets: { top: 59, bottom: 34, left: 0, right: 0 } };

/* Écrans à mesurer. Les quatre premiers sont des onglets ; les suivants
   s'ouvrent par la feuille « Plus » et n'ont **pas** d'en-tête (cf.
   `renderPageHeader`), ce qui est exactement le cas à surveiller. */
const SCREENS = [
  { id: "home", label: "Accueil", tab: "home" },
  { id: "tasks", label: "Tâches", tab: "tasks" },
  { id: "agenda", label: "Agenda", tab: "agenda" },
  { id: "meals", label: "Repas", tab: "meals" },
  { id: "lists", label: "Listes", quick: "Listes" },
  { id: "recipes", label: "Recettes", quick: "Recettes" },
];

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function evaluate(session, expression) {
  const { result } = await session.send("Runtime.evaluate", {
    expression, returnByValue: true, awaitPromise: true,
  });
  return result?.value;
}

/* Mesure exécutée dans la page. Renvoie des nombres, pas des impressions.

   `firstContentTop` est le haut du premier élément réellement peint dans la
   page (hors conteneurs vides) : c'est lui qui doit être sous l'encoche.
   `tabBarUsable` est la hauteur qui reste aux boutons une fois le padding bas
   retiré — `height: 50px` en `box-sizing: border-box` **inclut** le padding de
   safe area, donc 50 - 34 = 16 px pour les boutons. C'est le défaut. */
const MEASURE = `(() => {
  const page = [...document.querySelectorAll(".ion-page")]
    .filter((el) => !el.classList.contains("ion-page-hidden"))
    .filter((el) => !el.closest("ion-modal"))
    .pop();
  const bar = document.querySelector("ion-tab-bar");
  const barStyle = bar ? getComputedStyle(bar) : null;
  const barRect = bar ? bar.getBoundingClientRect() : null;
  const header = page ? page.querySelector("ion-header") : null;
  const content = page ? page.querySelector("ion-content") : null;

  /* Premier element peint dans la page.

     Attention : le contenu d ion-content vit dans le LIGHT DOM (il est slotte
     dans .inner-scroll). Marcher le shadow root ne trouve donc que
     .inner-scroll et le slot -- aucune boite reelle. On marche les descendants
     du light DOM. (Pas de backtick dans ce commentaire : il est lui-meme
     dans un template literal.) */
  let firstContentTop = null, firstContentTag = null;
  if (content) {
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
      const el = walker.currentNode;
      const r = el.getBoundingClientRect();
      if (r.width > 40 && r.height > 8) {
        firstContentTop = Math.round(r.top);
        firstContentTag = el.tagName.toLowerCase()
          + (typeof el.className === "string" && el.className ? "." + el.className.split(" ")[0] : "");
        break;
      }
    }
  }

  const shell = document.querySelector(".mrd-shell");
  return {
    insetTop: getComputedStyle(document.documentElement).getPropertyValue("--ion-safe-area-top").trim(),
    insetBottom: getComputedStyle(document.documentElement).getPropertyValue("--ion-safe-area-bottom").trim(),
    shellPadTop: shell ? getComputedStyle(shell).paddingTop : "(pas de .mrd-shell)",
    pageTop: page ? Math.round(page.getBoundingClientRect().top) : null,
    hasHeader: !!header,
    headerHeight: header ? Math.round(header.getBoundingClientRect().height) : 0,
    headerTop: header ? Math.round(header.getBoundingClientRect().top) : null,
    firstContentTop,
    firstContentTag,
    barTop: barRect ? Math.round(barRect.top) : null,
    barHeight: barRect ? Math.round(barRect.height) : null,
    barPadBottom: barStyle ? barStyle.paddingBottom : null,
    barUsable: barRect && barStyle
      ? Math.round(barRect.height - parseFloat(barStyle.paddingBottom || 0))
      : null,
    barBottom: barRect ? Math.round(barRect.bottom) : null,
    barBoxSizing: barStyle ? barStyle.boxSizing : null,
    contentOffsetTop: content ? getComputedStyle(content).getPropertyValue("--offset-top").trim() : null,
    contentPadTop: content ? getComputedStyle(content).getPropertyValue("--padding-top").trim() : null,
    viewportHeight: window.innerHeight,
  };
})()`;

async function goTo(session, screen) {
  if (screen.tab) {
    return evaluate(session, `(() => {
      const btn = document.querySelector('ion-tab-button[tab="${screen.tab}"]');
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
  }
  // Feuille d'actions « Plus » : ses boutons vivent dans un shadow root, d'où
  // le `clickAny` de capture.mjs qui traverse les shadow roots.
  await clickAny(session, TAB_SELECTORS, "Plus");
  await sleep(500);
  return clickAny(session, ["ion-action-sheet button", ".action-sheet-button"], screen.quick);
}

async function main() {
  const distDir = await buildE2eApp();
  const server = await startStaticServer(distDir);
  const browser = await launchBrowser();
  if (!browser) {
    console.log("Aucun navigateur trouve — mesure impossible.");
    await server.close();
    return;
  }

  const session = await openPageSession(browser, "about:blank");
  await session.send("Emulation.setDeviceMetricsOverride", {
    width: DEVICE.width, height: DEVICE.height, deviceScaleFactor: 2, mobile: true,
  });
  // Le point de tout ce fichier : de vrais insets, comme sur un iPhone.
  await session.send("Emulation.setSafeAreaInsetsOverride", { insets: DEVICE.insets });

  await session.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__E2E_PLANNER_SEED = ${JSON.stringify(PLANNER_SEED)};
      window.__E2E_PREMIUM = true;
      try {
        localStorage.setItem("mrd-theme", "light");
        localStorage.setItem("mrd-app-time-mode", "simulated");
        localStorage.setItem("mrd-app-time-simulated", ${JSON.stringify(FROZEN_DATE)});
        localStorage.setItem("mrd_notif_prompt", JSON.stringify({ dismissCount: 3, lastDismissed: null, granted: true }));
      } catch (e) {}
      const style = document.createElement("style");
      style.textContent = "*,*::before,*::after{animation-duration:0s !important;transition-duration:0s !important}";
      document.addEventListener("DOMContentLoaded", () => document.head.appendChild(style));
    `,
  });

  await session.send("Page.navigate", { url: server.url });
  await session.waitForEvent("Page.loadEventFired", 30_000).catch(() => {});

  if (!await reachHome(session)) {
    console.log("Page d accueil jamais atteinte — onboarding bloque.");
    await session.close();
    await browser.close();
    await server.close();
    return;
  }
  await dismissPostOnboarding(session);
  await sleep(800);

  const outDir = join(HERE, "safe-area");
  if (WANT_SHOTS) await mkdir(outDir, { recursive: true });

  const rows = [];
  for (const screen of SCREENS) {
    const reached = await goTo(session, screen);
    await sleep(900);
    const m = await evaluate(session, MEASURE);
    rows.push({ tab: screen.label, reached, ...m });
    if (WANT_SHOTS) {
      const { data } = await session.send("Page.captureScreenshot", { format: "png" });
      await writeFile(join(outDir, `${screen.id}.png`), Buffer.from(data, "base64"));
    }
    // Revenir à l'accueil avant l'écran suivant : les écrans secondaires
    // s'empilent, et la feuille « Plus » n'est atteignable que depuis un onglet.
    if (screen.quick) {
      await evaluate(session, "history.back()");
      await sleep(700);
    }
  }

  console.log(`\niPhone 15 simule — ${DEVICE.width}x${DEVICE.height}, insets haut ${DEVICE.insets.top} / bas ${DEVICE.insets.bottom}\n`);
  console.log("--ion-safe-area-top    :", rows[0]?.insetTop || "(vide)");
  console.log("--ion-safe-area-bottom :", rows[0]?.insetBottom || "(vide)");
  console.log(".mrd-shell padding-top :", rows[0]?.shellPadTop);
  console.log("");
  const cols = [
    ["onglet", 9, (r) => r.tab],
    ["en-tete", 8, (r) => (r.hasHeader ? "oui" : "NON")],
    ["hautPage", 9, (r) => r.pageTop],
    ["hEntete", 8, (r) => r.headerTop ?? "-"],
    ["hContenu", 9, (r) => r.firstContentTop ?? "-"],
    ["1er element", 24, (r) => String(r.firstContentTag ?? "-").slice(0, 23)],
    ["offsetTop", 10, (r) => r.contentOffsetTop || "-"],
    ["barreY", 7, (r) => r.barTop],
    ["barreH", 7, (r) => r.barHeight],
    ["padBas", 7, (r) => r.barPadBottom],
    ["utile", 6, (r) => r.barUsable],
  ];
  console.log(cols.map(([h, w]) => h.padEnd(w)).join(""));
  for (const r of rows) {
    console.log(cols.map(([, w, get]) => String(get(r)).padEnd(w)).join(""));
  }
  console.log(`\nhauteur de vue ${rows[0]?.viewportHeight} · bas de barre ${rows[0]?.barBottom} · box-sizing ${rows[0]?.barBoxSizing}`);
  console.log(`\nAttendu : hautContenu >= ${DEVICE.insets.top} (sous l'encoche), barreUtile >= 48 (cible tactile).`);
  const tooHigh = rows.filter((r) => r.firstContentTop !== null && r.firstContentTop < DEVICE.insets.top);
  if (tooHigh.length) {
    console.log(`\n⚠️  contenu sous l'encoche : ${tooHigh.map((r) => `${r.tab} (${r.firstContentTop}px)`).join(", ")}`);
  }
  if (rows[0]?.barUsable !== null && rows[0].barUsable < 48) {
    console.log(`⚠️  barre d'onglets ecrasee : ${rows[0].barUsable}px utiles pour les boutons`);
  }
  if (WANT_SHOTS) console.log(`\ncaptures → ${outDir}`);

  await session.close();
  await browser.close();
  await server.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
