import test from "node:test";
import assert from "node:assert/strict";

import { resolveFirebaseAuthDomain } from "../../src/constants.js";

test.afterEach(() => {
  delete globalThis.window;
});

test("resolveFirebaseAuthDomain garde firebaseapp en local", () => {
  globalThis.window = { location: { hostname: "localhost", protocol: "http:" } };

  assert.equal(resolveFirebaseAuthDomain(), "my-rolling-day.firebaseapp.com");
});

test("resolveFirebaseAuthDomain utilise le domaine courant en production HTTPS", () => {
  globalThis.window = { location: { hostname: "myrollingday.netlify.app", protocol: "https:" } };

  assert.equal(resolveFirebaseAuthDomain(), "myrollingday.netlify.app");
});
