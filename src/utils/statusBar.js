// Synchronise la barre de statut native avec le thème de l'app (mrd-theme).
// En natif, les <meta name="theme-color"> n'ont aucun effet : sans ça, une app
// en sombre sur un téléphone en clair affiche du texte noir sur fond sombre.
// No-op en web/PWA.

import { Capacitor } from "@capacitor/core";

const isNative = Capacitor.isNativePlatform();

export async function applyStatusBarTheme(isDark) {
  if (!isNative) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    // Style.Dark = texte clair sur fond sombre ; Style.Light = l'inverse
    await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
    if (Capacitor.getPlatform() === "android") {
      await StatusBar.setBackgroundColor({ color: isDark ? "#211A15" : "#FAF4ED" });
    }
  } catch (error) {
    console.warn("[statusbar] applyStatusBarTheme échoué", error);
  }
}
