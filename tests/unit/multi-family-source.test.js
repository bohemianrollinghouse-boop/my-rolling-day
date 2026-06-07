import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../../src/App.js", import.meta.url), "utf8");
const authSource = readFileSync(new URL("../../src/hooks/useAuth.js", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("../../src/components/settings/SettingsView.js", import.meta.url), "utf8");

test("App passe par le wrapper de bascule foyer valide", () => {
  assert.match(authSource, /async function handleSwitchFamily/);
  assert.match(authSource, /canSwitchToFamily\(userProfile, targetFamilyId\)/);
  assert.match(appSource, /onSwitchFamily=\$\{\(familyId\) => runFamilyAction\(\(\) => handleSwitchFamily\(familyId\)\)\}/);
  assert.doesNotMatch(appSource, /setCurrentFamily\(user\.uid, familyId\)/);
});

test("Settings : créer/rejoindre masqués dans la carte principale si foyer actif, présents dans la sous-page détail", () => {
  // Carte principale : create/join visibles seulement si !currentFamily
  assert.match(settingsSource, /!\s*currentFamily[\s\S]*?Creer un foyer/);
  assert.match(settingsSource, /!\s*currentFamily[\s\S]*?Rejoindre un foyer existant/);
  // Sous-page "Gérer le foyer en détail" : actions toujours présentes
  assert.match(settingsSource, /Créer un nouveau foyer/);
  assert.match(settingsSource, /Rejoindre un autre foyer/);
  // Sélecteur de foyer (chips) dans la carte principale si plusieurs foyers
  assert.match(settingsSource, /safeFamilies\.length > 1/);
});
