import { App } from "./App.js";
import { createRoot, html } from "./lib.js";

if (window.__pushBootLog) {
  window.__APP_BOOT_STATE__ = "main-imported";
  window.__pushBootLog("main-imported", "main.js charge");
}

// Overlay d'erreur SÉPARÉ de #root : écraser innerHTML du conteneur React
// détruisait son DOM → cascade d'erreurs removeChild qui masquait l'erreur
// d'origine. On affiche la première erreur (la cause) et on ne l'écrase pas.
let fatalOverlayShown = false;
function showFatalError(message) {
  if (fatalOverlayShown) return; // la première erreur est la vraie cause
  fatalOverlayShown = true;
  const overlay = document.createElement("div");
  overlay.id = "mrd-fatal-overlay";
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:99999;overflow:auto;padding:24px;padding-top:max(24px, env(safe-area-inset-top));font-family:DM Sans,sans-serif;background:#fff7f7;color:#8f1d1d";
  const title = document.createElement("h1");
  title.style.cssText = "margin-bottom:12px;font-size:22px";
  title.textContent = "Erreur visible";
  const pre = document.createElement("pre");
  pre.style.cssText = "white-space:pre-wrap;font-size:13px";
  pre.textContent = String(message || "Erreur inconnue");
  overlay.append(title, pre);
  document.body.appendChild(overlay);
}

window.addEventListener("error", (event) => {
  // Cross-origin CDN errors (Firebase, gstatic, etc.) arrive with no error object
  // and message = "Script error." — they can't be diagnosed and must not crash the UI.
  if (!event.error && (!event.message || event.message === "Script error.")) return;
  showFatalError(event.error?.stack || event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  // Suppress Firebase / push-messaging rejections silently — they're non-fatal.
  if (reason?.code?.startsWith?.("messaging/") || reason?.name === "FirebaseError") return;
  // WebKit n'inclut pas le message dans error.stack — on concatène pour diagnostiquer.
  const detail = [reason?.message, reason?.code, reason?.stack].filter(Boolean).join("\n");
  console.error("[fatal] unhandledrejection:", reason?.message || reason, reason?.code || "");
  showFatalError(detail || reason);
});

const root = createRoot(document.getElementById("root"));
if (window.__pushBootLog) {
  window.__APP_BOOT_STATE__ = "react-rendering";
  window.__pushBootLog("react-rendering", "React render lance");
}
root.render(html`<${App} />`);
window.__APP_BOOT_STATE__ = "react-mounted";
if (window.__pushBootLog) {
  window.__pushBootLog("react-mounted", "React monte");
}
