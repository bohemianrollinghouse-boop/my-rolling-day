/**
 * Tests E2E — passerelle de thème Ionic
 *
 * La passerelle `src/theme/ionic-bridge.css` branche les variables d'Ionic sur
 * les tokens `--mrd-*`. Les tests unitaires vérifient qu'elle est bien écrite
 * (aucune couleur en dur, chaque `--ion-*` passe par un token) mais pas qu'elle
 * *fonctionne* : un `@import` mal orthographié, un ordre de cascade inversé ou
 * une classe `.ion-palette-dark` oubliée laisseraient tous les tests unitaires
 * verts et Ionic hors palette.
 *
 * Ces tests lisent donc les variables **résolues par le navigateur**, dans les
 * deux thèmes. C'est le garde-fou du reste de la migration : dès la phase 2 des
 * composants Ionic sont à l'écran, et s'ils n'héritent pas des bonnes couleurs
 * on veut l'apprendre ici, pas à l'œil sur une capture.
 *
 * Port de debug : 9226 (smoke=9222, standalone=9223, profile=9224, nav=9225,
 * captures=9230)
 */

import test from "node:test";
import assert from "node:assert/strict";

import { launchBrowser, openPageSession } from "../helpers/cdp-browser.js";
import { startStaticServer } from "../helpers/static-server.js";
import { buildE2eApp } from "../helpers/e2e-build.js";

/** Couleurs attendues, converties depuis les oklch de styles.css. */
const EXPECTED = {
  light: {
    // --mrd-bg = oklch(97% 0.012 72) = #FAF4ED = THEME_COLOR_LIGHT
    background: [250, 244, 237],
    // --mrd-aBtn = oklch(55% 0.13 28), la terracotta des boutons
    primary: [177, 79, 69],
  },
  dark: {
    // --mrd-bg sombre = oklch(22.5% 0.014 62) = #211A15 = THEME_COLOR_DARK
    background: [33, 26, 21],
    primary: [186, 80, 66],
    // --mrd-surf sombre = oklch(27% 0.016 62) = 44,37,31. Surchargee par Ionic
    // `.ion-palette-dark.ios` : c est la variable qui a revele le bug de
    // specificite, elle reste donc surveillee explicitement.
    itemBackground: [44, 37, 31],
  },
};

/** Tolérance : le moteur peut arrondir la conversion oklch d'un point. */
const TOLERANCE = 3;

function parseRgb(value) {
  const nums = String(value).match(/[\d.]+/g);
  return nums ? nums.slice(0, 3).map(Number) : null;
}

function assertClose(actual, expected, label) {
  assert.ok(actual, `${label} : valeur illisible`);
  const drift = expected.map((e, i) => Math.abs(e - actual[i]));
  assert.ok(
    drift.every((d) => d <= TOLERANCE),
    `${label} : attendu ~${expected.join(",")} mais obtenu ${actual.join(",")}`,
  );
}

test("CDP: la passerelle de thème Ionic est branchée", { timeout: 180_000 }, async (t) => {
  let serverHandle;
  let browserHandle;
  let browserLaunchError = null;

  t.before(async () => {
    serverHandle = await startStaticServer(await buildE2eApp());
    try {
      browserHandle = await launchBrowser(9226);
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
   * Ouvre l'app avec un thème imposé et renvoie les variables Ionic résolues.
   * `getComputedStyle` sur :root résout la chaîne complète
   * `--ion-* → var(--mrd-*) → oklch(...)`, ce qu'aucun test de fichier ne peut
   * faire.
   */
  async function readIonicVars(theme) {
    const session = await openPageSession(browserHandle);
    await session.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `try { localStorage.setItem("mrd-theme", ${JSON.stringify(theme)}); } catch (e) {}`,
    });
    await session.send("Page.navigate", { url: `${serverHandle.url}/` });
    await session.waitForEvent("Page.loadEventFired", 20_000);

    // Attendre que React soit monté : c'est src/utils/theme.js qui pose la
    // classe .ion-palette-dark, le script inline d'index.html n'étant qu'un
    // anti-flash.
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const { result } = await session.send("Runtime.evaluate", {
        expression: `window.__APP_BOOT_STATE__ === "react-mounted"`,
        returnByValue: true,
      });
      if (result.value === true) break;
      await new Promise((r) => setTimeout(r, 200));
    }

    const { result } = await session.send("Runtime.evaluate", {
      expression: `(() => {
        const cs = getComputedStyle(document.documentElement);
        const read = (name) => cs.getPropertyValue(name).trim();
        /* Les tokens du projet sont en oklch, et Chrome conserve l espace
           d origine : getComputedStyle renvoie « oklch(0.97 0.012 72) », pas
           du rgb. On passe donc par un canvas, qui applique la vraie
           conversion vers sRGB — et qui vaut aussi verification que la valeur
           est une couleur valide : une variable non resolue donne du noir. */
        const toSrgb = (value) => {
          if (!value) return null;
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 1;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#000000";
          ctx.fillStyle = value;
          ctx.fillRect(0, 0, 1, 1);
          const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
          return r + "," + g + "," + b;
        };
        return JSON.stringify({
          dataTheme: document.documentElement.getAttribute("data-theme"),
          ionicDarkClass: document.documentElement.classList.contains("ion-palette-dark"),
          background: read("--ion-background-color"),
          primary: read("--ion-color-primary"),
          primaryRgb: read("--ion-color-primary-rgb"),
          textColor: read("--ion-text-color"),
          fontFamily: read("--ion-font-family"),
          // Résolution effective : si la passerelle est cassée, ces deux
          // valeurs tombent sur les defaults d'Ionic (bleu #3880ff) ou sur du
          // vide, et les assertions le disent.
          resolvedBg: toSrgb(read("--ion-background-color")),
          resolvedPrimary: toSrgb(read("--ion-color-primary")),
          resolvedItemBg: toSrgb(read("--ion-item-background")),
        });
      })()`,
      returnByValue: true,
    });
    await session.close();
    return JSON.parse(result.value);
  }

  await t.test("le CSS d'Ionic est bien chargé", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }
    const vars = await readIonicVars("light");
    // core.css définit --ion-font-family ; s'il n'était pas chargé, la
    // passerelle serait la seule à écrire cette variable et le test passerait
    // quand même — d'où la vérification sur une valeur *résolue* plus bas.
    assert.ok(vars.background, "--ion-background-color absente : @import cassé ?");
    assert.ok(vars.primary, "--ion-color-primary absente");
    assert.match(vars.fontFamily, /DM Sans/, "la police de l'app doit passer dans --ion-font-family");
  });

  await t.test("thème clair : Ionic hérite des couleurs de la marque", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }
    const vars = await readIonicVars("light");
    assert.equal(vars.dataTheme, "light");
    assert.equal(vars.ionicDarkClass, false, ".ion-palette-dark ne doit pas être posée en clair");
    assertClose(parseRgb(vars.resolvedBg), EXPECTED.light.background, "--ion-background-color (clair)");
    assertClose(parseRgb(vars.resolvedPrimary), EXPECTED.light.primary, "--ion-color-primary (clair)");
    // Le bleu Ionic par défaut est #3880ff = 56,128,255. S'il apparaît, la
    // passerelle n'a pas pris.
    assert.notDeepEqual(parseRgb(vars.resolvedPrimary), [56, 128, 255], "Ionic est resté sur son bleu par défaut");
  });

  await t.test("thème sombre : la bascule emmène Ionic avec elle", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }
    const vars = await readIonicVars("dark");
    assert.equal(vars.dataTheme, "dark");
    assert.equal(vars.ionicDarkClass, true, ".ion-palette-dark doit être posée en sombre");
    assertClose(parseRgb(vars.resolvedBg), EXPECTED.dark.background, "--ion-background-color (sombre)");
    assertClose(parseRgb(vars.resolvedPrimary), EXPECTED.dark.primary, "--ion-color-primary (sombre)");
    assertClose(parseRgb(vars.resolvedItemBg), EXPECTED.dark.itemBackground, "--ion-item-background (sombre)");
    // Le noir d'Ionic en mode ios sombre. S'il revient, c'est que la
    // réaffirmation `.ion-palette-dark.ios` de la passerelle a sauté.
    assert.notDeepEqual(parseRgb(vars.resolvedBg), [0, 0, 0], "le fond est retombé sur le noir d'Ionic");
  });

  await t.test("les triplets -rgb sont exploitables par rgba()", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }
    const vars = await readIonicVars("light");
    // Ionic écrit `rgba(var(--ion-color-primary-rgb), .08)` pour ses états.
    // Un oklch y produirait une couleur invalide, et la règle serait ignorée :
    // le survol et le ripple disparaîtraient sans erreur.
    assert.match(vars.primaryRgb, /^\d+\s+\d+\s+\d+$/, `--ion-color-primary-rgb doit être un triplet, reçu « ${vars.primaryRgb} »`);
  });
});
