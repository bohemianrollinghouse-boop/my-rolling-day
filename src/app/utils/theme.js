// Application du thème clair / sombre — point unique.
//
// Le thème s'écrivait à deux endroits (App.js au démarrage, SettingsView au
// changement) plus un script inline dans index.html. Trois copies de la même
// séquence, qu'il fallait maintenir ensemble. L'arrivée d'Ionic ajoute une
// quatrième chose à poser (`.ion-palette-dark`) : d'où cette centralisation.

import { THEME_COLOR_DARK, THEME_COLOR_LIGHT } from "../config/constants.js";
import { applyStatusBarTheme } from "../plugins/statusBar.js";

export const THEME_STORAGE_KEY = "mrd-theme";

/** Classe attendue par `@ionic/react/css/palettes/dark.class.css`. */
const IONIC_DARK_CLASS = "ion-palette-dark";

export function readStoredTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch (error) {
    return "light";
  }
}

/**
 * Pose le thème sur le document. Idempotent.
 *
 * @param {"light"|"dark"} mode
 * @param {{ persist?: boolean }} [options] `persist` écrit dans localStorage —
 *   à ne faire que sur une action utilisateur, pas au démarrage (relire puis
 *   réécrire la même valeur au boot n'apporte rien et masque un état corrompu).
 */
export function applyTheme(mode, { persist = false } = {}) {
  const isDark = mode === "dark";
  const root = document.documentElement;

  root.setAttribute("data-theme", isDark ? "dark" : "light");
  // Ionic ne lit pas `data-theme` : sans cette classe, une app en sombre
  // afficherait des composants Ionic restés clairs.
  root.classList.toggle(IONIC_DARK_CLASS, isDark);

  try {
    if (persist) localStorage.setItem(THEME_STORAGE_KEY, isDark ? "dark" : "light");
    // Doit rester égal à --mrd-bg des deux thèmes, et à la couleur posée par
    // applyStatusBarTheme() en natif.
    const themeColor = isDark ? THEME_COLOR_DARK : THEME_COLOR_LIGHT;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", themeColor));
    const statusBarMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (statusBarMeta) statusBarMeta.setAttribute("content", isDark ? "black" : "default");
  } catch (error) {
    console.warn("[theme] impossible d appliquer le theme", error);
  }

  applyStatusBarTheme(isDark);
}
