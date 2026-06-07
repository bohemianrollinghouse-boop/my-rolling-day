import test from "node:test";
import assert from "node:assert/strict";

import { canSwitchToFamily, normalizeFamilyIds } from "../../src/utils/families.js";

test("normalizeFamilyIds nettoie et dedupe les foyers", () => {
  assert.deepEqual(normalizeFamilyIds(["family-a", "", " family-b ", "family-a", null]), ["family-a", "family-b"]);
});

test("canSwitchToFamily autorise uniquement les foyers du profil", () => {
  const profile = { familyIds: ["family-a", "family-b"] };

  assert.equal(canSwitchToFamily(profile, "family-b"), true);
  assert.equal(canSwitchToFamily(profile, "family-c"), false);
  assert.equal(canSwitchToFamily(profile, ""), false);
});
