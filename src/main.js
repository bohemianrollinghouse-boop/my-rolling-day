import { App } from "./App.js?v=2026-04-20-redesign-4";
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
  showFatalError(event.error?.stack || event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  showFatalError(event.reason?.stack || event.reason?.message || event.reason);
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
