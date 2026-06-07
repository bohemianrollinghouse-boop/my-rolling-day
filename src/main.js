import { App } from "./App.js";
import { createRoot, html } from "./lib.js";

if (window.__pushBootLog) {
  window.__APP_BOOT_STATE__ = "main-imported";
  window.__pushBootLog("main-imported", "main.js charge");
}

function showFatalError(message) {
  const root = document.getElementById("root");
  if (!root) return;
  root.innerHTML = `
    <div style="min-height:100vh;padding:24px;font-family:DM Sans,sans-serif;background:#fff7f7;color:#8f1d1d">
      <h1 style="margin-bottom:12px;font-size:22px">Erreur visible</h1>
      <pre style="white-space:pre-wrap">${String(message || "Erreur inconnue")}</pre>
    </div>
  `;
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
  showFatalError(reason?.stack || reason?.message || reason);
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
