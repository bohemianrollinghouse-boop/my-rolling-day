import test from "node:test";
import assert from "node:assert/strict";

import { launchBrowser, openPageSession } from "../helpers/cdp-browser.js";
import { startStaticServer } from "../helpers/static-server.js";
import { buildE2eApp } from "../helpers/e2e-build.js";

let serverHandle;
let browserHandle;
let browserLaunchError = null;

test.before(async () => {
  // On sert le build Vite, pas les sources : celles-ci utilisent des imports
  // npm nus qu'un navigateur ne sait pas résoudre.
  serverHandle = await startStaticServer(await buildE2eApp());
  try {
    browserHandle = await launchBrowser();
  } catch (error) {
    browserLaunchError = error;
    browserHandle = null;
  }
});

test.after(async () => {
  // `finally` obligatoire : si la fermeture du navigateur echoue, le serveur
  // HTTP doit quand meme etre ferme, sinon node ne rend jamais la main.
  try {
    if (browserHandle) await browserHandle.close();
  } finally {
    if (serverHandle) await serverHandle.close();
  }
});

test("smoke HTTP: la page d entree est servie", async () => {
  const response = await fetch(`${serverHandle.url}/`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /<title>My Rolling Day<\/title>/);
  // Vite injecte le bundle hashé à la place du <script src="./src/main.js">
  assert.match(html, /<script type="module"[^>]+src="\/assets\/index-[^"]+\.js"/);
});

test("smoke HTTP: les assets critiques sont servis", async () => {
  const indexResponse = await fetch(`${serverHandle.url}/`);
  const indexHtml = await indexResponse.text();
  const entryMatch = indexHtml.match(/<script type="module"[^>]+src="(\/assets\/index-[^"]+\.js)"/);

  assert.ok(entryMatch, "bundle d entree introuvable dans index.html");

  const entryResponse = await fetch(`${serverHandle.url}${entryMatch[1]}`);
  const entrySource = await entryResponse.text();

  assert.equal(entryResponse.status, 200);
  assert.match(entrySource, /react-mounted/);
  assert.match(entrySource, /__APP_BOOT_STATE__/);
});

test("smoke E2E navigateur: l application monte sans ecran fatal", async (t) => {
  if (!browserHandle) {
    t.skip(browserLaunchError ? `Navigateur headless indisponible: ${browserLaunchError.message}` : "Navigateur headless indisponible");
    return;
  }

  const session = await openPageSession(browserHandle);

  try {
    await session.send("Page.navigate", { url: `${serverHandle.url}/` });
    await session.waitForEvent("Page.loadEventFired", 15000);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 3000));

    const bootState = await session.send("Runtime.evaluate", {
      expression: "window.__APP_BOOT_STATE__",
      returnByValue: true,
    });
    const bodyText = await session.send("Runtime.evaluate", {
      expression: "document.body.innerText",
      returnByValue: true,
    });

    assert.equal(bootState.result.value, "react-mounted");
    assert.doesNotMatch(bodyText.result.value, /Demarrage bloque/i);
    assert.doesNotMatch(bodyText.result.value, /Erreur visible/i);
  } finally {
    await session.close();
  }
});
