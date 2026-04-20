import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";

import { launchBrowser, openPageSession } from "../helpers/cdp-browser.js";
import { startStaticServer } from "../helpers/static-server.js";

const projectRoot = resolve("C:/Users/Myenn/Documents/Codex/2026-04-17-files-mentioned-by-the-user-code/planning-react");

let serverHandle;
let browserHandle;
let browserLaunchError = null;

test.before(async () => {
  serverHandle = await startStaticServer(projectRoot);
  try {
    browserHandle = await launchBrowser();
  } catch (error) {
    browserLaunchError = error;
    browserHandle = null;
  }
});

test.after(async () => {
  if (browserHandle) await browserHandle.close();
  if (serverHandle) await serverHandle.close();
});

test("smoke HTTP: la page d entree est servie", async () => {
  const response = await fetch(`${serverHandle.url}/`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /<title>Planning Famille<\/title>/);
  assert.match(html, /src=\"\.\/src\/main\.js\?v=/);
});

test("smoke HTTP: les assets critiques sont servis", async () => {
  const indexResponse = await fetch(`${serverHandle.url}/`);
  const indexHtml = await indexResponse.text();
  const mainMatch = indexHtml.match(/src=\"(\.\/src\/main\.js\?v=[^\"]+)\"/);

  assert.ok(mainMatch, "main.js versionne introuvable dans index.html");

  const mainResponse = await fetch(`${serverHandle.url}/${mainMatch[1].replace(/^\.\//, "")}`);
  const mainSource = await mainResponse.text();

  assert.equal(mainResponse.status, 200);
  assert.match(mainSource, /react-mounted/);
  assert.match(mainSource, /createRoot/);
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
