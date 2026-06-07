/**
 * Tests E2E — Création de profil (flux complet d'onboarding)
 *
 * Documente et vérifie chaque étape du parcours :
 *
 *   [1] Chargement → spinner (.ldr) visible
 *   [2] Firebase auth résolu → pas de profil → OnboardingFlow (.onboarding-shell)
 *   [3] choose-household-mode → cartes "Créer" et "Rejoindre" visibles
 *   [4] Clic "Créer un foyer" → create-first-name
 *   [5] Saisie du prénom → bouton Suivant actif
 *   [6] Suivant → create-badge-color — grille de couleurs visible
 *   [7] Sélection couleur → create-household-name
 *   [8] Saisie nom du foyer → create-add-members
 *   [9] Terminer (sans membres) → onCreateHousehold → writeBatch.commit()
 *   [10] Listeners Firestore re-fire → bootLoading=false → .mrd-bnav visible
 *
 * Section 1 (Node.js pur) :
 *   – makeInviteCode : format XXX-XXX
 *   – CREATE_STEPS : séquence des étapes
 *   – isCurrentStepValid : validation par étape
 *   – nextLabel : libellé du bouton de progression
 *
 * Section 2 (CDP, skippée si pas de navigateur) :
 *   – Inject un <script type="importmap"> dans index.html (Fetch interception)
 *     pour rediriger les modules Firebase CDN vers tests/fixtures/firebase-stubs/
 *   – Parcours complet de l'onboarding jusqu'à la page d'accueil
 *
 * Port de debug : 9224
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, join } from "node:path";

import { launchBrowser, openPageSession } from "../helpers/cdp-browser.js";
import { startStaticServer } from "../helpers/static-server.js";

const projectRoot = resolve(
  "C:/Users/Myenn/Documents/Codex/2026-04-17-files-mentioned-by-the-user-code/planning-react"
);

// ─────────────────────────────────────────────────────────────────────────────
// Répliques des fonctions pures d'OnboardingFlow.js (testées sans React)
// ─────────────────────────────────────────────────────────────────────────────

const CREATE_STEPS = [
  "create-first-name",
  "create-badge-color",
  "create-household-name",
  "create-add-members",
  "create-invite-members",
];

/** Réplique exacte de makeInviteCode() dans OnboardingFlow.js */
function makeInviteCode(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) { out += A[h % A.length]; h = Math.floor(h / 7) + 13 * (i + 1); }
  return out.slice(0, 3) + "-" + out.slice(3);
}

/** Réplique de isCurrentStepValid() dans OnboardingFlow.js */
function isCurrentStepValid(step, state) {
  if (step === "create-first-name") return Boolean(state.create.firstName.trim());
  if (step === "create-badge-color") return Boolean(state.create.badgeColor);
  if (step === "create-household-name") return Boolean(state.create.householdName.trim());
  if (step === "create-add-members") return true;
  if (step === "create-invite-members") return true;
  return false;
}

/** Réplique de nextLabel() dans OnboardingFlow.js */
function nextLabel(step, profileCount) {
  if (step === "create-add-members" && profileCount === 0) return "Terminer";
  if (step === "create-invite-members") return "Terminer";
  return "Suivant";
}

// ─────────────────────────────────────────────────────────────────────────────
// Import map — redirige Firebase CDN vers les stubs locaux
// ─────────────────────────────────────────────────────────────────────────────

const FIREBASE_CDN_VERSION = "10.12.5";
const FIREBASE_CDN_BASE = `https://www.gstatic.com/firebasejs/${FIREBASE_CDN_VERSION}`;
const STUB_MODULES = [
  "firebase-app",
  "firebase-auth",
  "firebase-firestore",
  "firebase-messaging",
  "firebase-analytics",
  "firebase-storage",
  "firebase-functions",
];

function buildImportMapHtml() {
  const imports = {};
  for (const mod of STUB_MODULES) {
    imports[`${FIREBASE_CDN_BASE}/${mod}.js`] =
      `/tests/fixtures/firebase-stubs/${mod}.js`;
  }
  return `<script type="importmap">${JSON.stringify({ imports })}</script>`;
}

// HTML modifié, construit une seule fois (le serveur est le même pour tous les tests)
const ORIGINAL_INDEX_HTML = readFileSync(join(projectRoot, "index.html"), "utf8");
// L'importmap doit précéder tout <script type="module">
const MODIFIED_INDEX_HTML = ORIGINAL_INDEX_HTML.replace(
  /<script type="module"/,
  `${buildImportMapHtml()}\n    <script type="module"`,
);

// Chemin du fichier HTML temporaire servi à la racine du projet
// (pour que les chemins relatifs ./src/ restent valides)
const STUB_INDEX_PATH = join(projectRoot, "e2e-onboarding.html");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers CDP
// ─────────────────────────────────────────────────────────────────────────────

/** Attend qu'un sélecteur CSS soit présent (polling 250 ms). */
async function pollForSelector(session, selector, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { result } = await session.send("Runtime.evaluate", {
      expression: `!!document.querySelector(${JSON.stringify(selector)})`,
      returnByValue: true,
    });
    if (result.value === true) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/** Lit le textContent d'un élément. */
async function queryText(session, selector) {
  const { result } = await session.send("Runtime.evaluate", {
    expression: `document.querySelector(${JSON.stringify(selector)})?.textContent?.trim() ?? ""`,
    returnByValue: true,
  });
  return result.value ?? "";
}

/** Attend que le bouton .onb-footer-next soit actif (non disabled). */
async function waitForNextEnabled(session, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const disabled = await queryProp(session, ".onb-footer-next", "disabled");
    if (!disabled) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

/** Lit une propriété JS sur un élément. */
async function queryProp(session, selector, prop) {
  const { result } = await session.send("Runtime.evaluate", {
    expression: `document.querySelector(${JSON.stringify(selector)})?.[${JSON.stringify(prop)}] ?? null`,
    returnByValue: true,
  });
  return result.value;
}

/** Clique sur le premier élément correspondant. */
async function click(session, selector) {
  await session.send("Runtime.evaluate", {
    expression: `document.querySelector(${JSON.stringify(selector)})?.click()`,
  });
}

// pas d'helper Fetch — on navigue directement vers le fichier temporaire

// ─────────────────────────────────────────────────────────────────────────────
// Section 1 — Logique pure (toujours exécutée, pas de navigateur requis)
// ─────────────────────────────────────────────────────────────────────────────

test("makeInviteCode : produit exactement 7 caractères au format XXX-XXX", () => {
  const code = makeInviteCode("seed-de-test-123");
  assert.equal(code.length, 7, `Code "${code}" doit faire 7 caractères`);
  assert.match(code, /^[A-Z2-9]{3}-[A-Z2-9]{3}$/, `Code "${code}" doit être XXX-XXX`);
});

test("makeInviteCode : le tiret est exactement en position 3", () => {
  const code = makeInviteCode("autre-seed-789");
  assert.equal(code[3], "-", "Le tiret doit être au 4ème caractère (index 3)");
});

test("makeInviteCode : deux seeds différentes donnent deux codes différents", () => {
  const a = makeInviteCode("alice");
  const b = makeInviteCode("bob");
  assert.notEqual(a, b, "Des seeds différentes doivent donner des codes différents");
});

test("makeInviteCode : la même seed donne toujours le même code (déterministe)", () => {
  assert.equal(makeInviteCode("foyer-martin"), makeInviteCode("foyer-martin"));
});

test("CREATE_STEPS : contient les 5 étapes dans le bon ordre", () => {
  assert.deepEqual(CREATE_STEPS, [
    "create-first-name",
    "create-badge-color",
    "create-household-name",
    "create-add-members",
    "create-invite-members",
  ]);
});

test("isCurrentStepValid : create-first-name faux si prénom vide", () => {
  const s = { create: { firstName: "", badgeColor: "#DC2626", householdName: "" } };
  assert.equal(isCurrentStepValid("create-first-name", s), false);
});

test("isCurrentStepValid : create-first-name vrai si prénom non vide", () => {
  const s = { create: { firstName: "Alice", badgeColor: "#DC2626", householdName: "" } };
  assert.equal(isCurrentStepValid("create-first-name", s), true);
});

test("isCurrentStepValid : create-badge-color faux si couleur absente", () => {
  const s = { create: { firstName: "Alice", badgeColor: "", householdName: "" } };
  assert.equal(isCurrentStepValid("create-badge-color", s), false);
});

test("isCurrentStepValid : create-badge-color vrai si couleur choisie", () => {
  const s = { create: { firstName: "Alice", badgeColor: "#DC2626", householdName: "" } };
  assert.equal(isCurrentStepValid("create-badge-color", s), true);
});

test("isCurrentStepValid : create-household-name faux si nom vide", () => {
  const s = { create: { firstName: "Alice", badgeColor: "#DC2626", householdName: "   " } };
  assert.equal(isCurrentStepValid("create-household-name", s), false);
});

test("isCurrentStepValid : create-household-name vrai si nom non vide", () => {
  const s = { create: { firstName: "Alice", badgeColor: "#DC2626", householdName: "Chez nous" } };
  assert.equal(isCurrentStepValid("create-household-name", s), true);
});

test("isCurrentStepValid : create-add-members toujours valide (optionnel)", () => {
  const s = { create: { firstName: "", badgeColor: "", householdName: "" } };
  assert.equal(isCurrentStepValid("create-add-members", s), true);
});

test("isCurrentStepValid : create-invite-members toujours valide", () => {
  const s = { create: { firstName: "", badgeColor: "", householdName: "" } };
  assert.equal(isCurrentStepValid("create-invite-members", s), true);
});

test("nextLabel : 'Suivant' aux étapes intermédiaires", () => {
  assert.equal(nextLabel("create-first-name", 0), "Suivant");
  assert.equal(nextLabel("create-badge-color", 0), "Suivant");
  assert.equal(nextLabel("create-household-name", 0), "Suivant");
});

test("nextLabel : 'Terminer' à create-add-members sans membres", () => {
  assert.equal(nextLabel("create-add-members", 0), "Terminer");
});

test("nextLabel : 'Suivant' à create-add-members avec membres", () => {
  assert.equal(nextLabel("create-add-members", 2), "Suivant");
});

test("nextLabel : 'Terminer' à create-invite-members", () => {
  assert.equal(nextLabel("create-invite-members", 0), "Terminer");
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 2 — Suite CDP (skippée si pas de navigateur headless)
// ─────────────────────────────────────────────────────────────────────────────

test("CDP: création de profil — du spinner à la page d'accueil", { timeout: 180_000 }, async (t) => {
  let serverHandle;
  let browserHandle;
  let browserLaunchError = null;

  t.before(async () => {
    // Écrire le HTML modifié (avec import map) à la racine du projet
    // pour que les chemins relatifs ./src/ restent valides.
    writeFileSync(STUB_INDEX_PATH, MODIFIED_INDEX_HTML, "utf8");

    serverHandle = await startStaticServer(projectRoot);
    try {
      browserHandle = await launchBrowser(9224);
    } catch (err) {
      browserLaunchError = err;
      browserHandle = null;
    }
  });

  t.after(async () => {
    // Chrome tient parfois ses fichiers sqlite quelques ms après kill() → EBUSY ignoré
    if (browserHandle) try { await browserHandle.close(); } catch { /* ignoré */ }
    if (serverHandle) await serverHandle.close();
    try { unlinkSync(STUB_INDEX_PATH); } catch { /* ignoré */ }
  });

  /** Ouvre un onglet et navigue vers le HTML stubé. */
  async function openStubbed() {
    const session = await openPageSession(browserHandle);
    await session.send("Page.navigate", { url: `${serverHandle.url}/e2e-onboarding.html` });
    await session.waitForEvent("Page.loadEventFired", 15_000);
    return session;
  }

  // ── [1] Spinner visible dès le chargement ──────────────────────────────────

  await t.test("[1] spinner .ldr visible au démarrage", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }

    const session = await openStubbed();
    try {
      // Le spinner est injecté dans le HTML statique donc visible immédiatement,
      // avant même que React monte. React retire le .ldr une fois bootLoading=false.
      const hasLdr = await pollForSelector(session, ".ldr", 4_000);
      // Ou si React a déjà monté, on accepte toute vue résolue
      const hasResolved = await pollForSelector(session, ".onboarding-shell, .auth-shell, .mrd-outer", 4_000);
      assert.ok(hasLdr || hasResolved, "La page doit afficher le spinner ou une vue résolue");
    } finally {
      await session.close();
    }
  });

  // ── [2] OnboardingFlow visible après auth ──────────────────────────────────

  await t.test("[2] .onboarding-shell visible après résolution Firebase Auth", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }

    const session = await openStubbed();
    try {
      // Le stub auth (firebase-auth.js) fire onAuthStateChanged(TEST_USER) après 350 ms.
      // Le stub Firestore renvoie un profil sans famille → needsFamilySetup=true.
      // L'app sort de bootLoading et affiche OnboardingFlow.
      const found = await pollForSelector(session, ".onboarding-shell", 12_000);

      if (!found) {
        // Diagnostic complet pour comprendre l'échec
        const { result: diag } = await session.send("Runtime.evaluate", {
          expression: `JSON.stringify({
            title: document.title,
            bootState: window.__APP_BOOT_STATE__,
            bootLogs: (window.__APP_BOOT_LOGS__ || []).slice(-5).map(l => l.step + ': ' + l.detail),
            rootHtml: document.querySelector('#root')?.innerHTML?.slice(0, 400) || '(root absent)',
            hasLdr: !!document.querySelector('.ldr'),
            hasOnboarding: !!document.querySelector('.onboarding-shell'),
            hasAuth: !!document.querySelector('.auth-shell'),
          })`,
          returnByValue: true,
        });
        assert.fail(`.onboarding-shell introuvable — diagnostic: ${diag.value}`);
      }
    } finally {
      await session.close();
    }
  });

  // ── [3] choose-household-mode — deux cartes visibles ──────────────────────

  await t.test("[3] choose-household-mode — cartes Créer et Rejoindre", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }

    const session = await openStubbed();
    try {
      await pollForSelector(session, ".onboarding-shell", 12_000);

      const { result: cardCount } = await session.send("Runtime.evaluate", {
        expression: `document.querySelectorAll(".onboarding-choice-card").length`,
        returnByValue: true,
      });
      assert.equal(cardCount.value, 2, "Deux cartes de choix doivent être visibles");

      const firstTitle = await queryText(session, ".onboarding-choice-card:first-child .onboarding-choice-title");
      assert.match(firstTitle, /Créer/i, "La première carte doit proposer de créer un foyer");

      const { result: hasJoin } = await session.send("Runtime.evaluate", {
        expression: `[...document.querySelectorAll(".onboarding-choice-title")].some(el => /Rejoindre/i.test(el.textContent))`,
        returnByValue: true,
      });
      assert.ok(hasJoin.value, "Une carte 'Rejoindre' doit être présente");
    } finally {
      await session.close();
    }
  });

  // ── [4–7] create-first-name → create-badge-color → create-household-name ──

  await t.test("[4-7] create-first-name → couleur → nom du foyer", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }

    const session = await openStubbed();
    try {
      await pollForSelector(session, ".onboarding-shell", 12_000);

      // [4] Clic "Créer un foyer"
      await click(session, ".onboarding-choice-card:first-child");

      // [5] Input de prénom visible, kicker "Étape 1"
      const inputOk = await pollForSelector(session, ".onboarding-input", 5_000);
      assert.ok(inputOk, "Le champ prénom doit apparaître à create-first-name");

      const kicker1 = await queryText(session, ".onb-step-kicker");
      assert.match(kicker1, /Étape 1/i, "Kicker doit indiquer 'Étape 1'");

      // Saisir le prénom via React synthetic event
      await session.send("Runtime.evaluate", {
        expression: `
          const el = document.querySelector(".onboarding-input");
          if (el) {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
            setter.call(el, "E2E Testeur");
            el.dispatchEvent(new Event("input", { bubbles: true }));
          }
        `,
      });

      const nextActive = await waitForNextEnabled(session);
      assert.ok(nextActive, "Le bouton Suivant doit devenir actif après saisie du prénom");

      // [6] Suivant → create-badge-color
      await click(session, ".onb-footer-next");
      const colorOk = await pollForSelector(session, ".onb-color-grid", 5_000);
      assert.ok(colorOk, "La grille de couleurs doit apparaître à create-badge-color");

      const kicker2 = await queryText(session, ".onb-step-kicker");
      assert.match(kicker2, /Étape 2/i, "Kicker doit indiquer 'Étape 2'");

      // [7] Clic sur une couleur, puis Suivant
      await click(session, ".onb-color-swatch");
      await new Promise((r) => setTimeout(r, 150));
      await click(session, ".onb-footer-next");

      // [8] create-household-name visible
      const hnOk = await pollForSelector(session, ".onboarding-input", 5_000);
      assert.ok(hnOk, "Le champ nom du foyer doit apparaître à create-household-name");

      const kicker3 = await queryText(session, ".onb-step-kicker");
      assert.match(kicker3, /Étape 3/i, "Kicker doit indiquer 'Étape 3'");
    } finally {
      await session.close();
    }
  });

  // ── [8–10] nom du foyer → Terminer → page d'accueil (.mrd-bnav) ───────────

  await t.test("[8-10] nom du foyer → Terminer → .mrd-bnav", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }

    const session = await openStubbed();
    try {
      await pollForSelector(session, ".onboarding-shell", 12_000);

      // Avancer jusqu'à create-household-name en attendant le bouton à chaque étape

      // Étape 1 : prénom
      await click(session, ".onboarding-choice-card:first-child");
      await pollForSelector(session, ".onboarding-input", 5_000);
      await session.send("Runtime.evaluate", {
        expression: `
          const el = document.querySelector(".onboarding-input");
          if (el) {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "E2E Testeur");
            el.dispatchEvent(new Event("input", { bubbles: true }));
          }
        `,
      });
      await waitForNextEnabled(session);
      await click(session, ".onb-footer-next"); // → create-badge-color

      // Étape 2 : couleur
      await pollForSelector(session, ".onb-color-swatch", 5_000);
      await click(session, ".onb-color-swatch");
      await waitForNextEnabled(session);
      await click(session, ".onb-footer-next"); // → create-household-name

      // [8] Étape 3 : nom du foyer
      // Utiliser un chip de suggestion (onClick → updateCreate direct, sans simulation d'input)
      await pollForSelector(session, ".onb-suggestion-chip", 5_000);
      await click(session, ".onb-suggestion-chip");
      await waitForNextEnabled(session);
      await click(session, ".onb-footer-next"); // → create-add-members

      // [9] Étape create-add-members — kicker "Étape 4", bouton "Terminer"
      const kicker4 = await queryText(session, ".onb-step-kicker");
      assert.match(kicker4, /Étape 4/i, "Le kicker doit indiquer 'Étape 4' (ajout membres)");

      const btnLabel = await queryText(session, ".onb-footer-next");
      assert.match(btnLabel, /Terminer/i, "Le bouton doit afficher 'Terminer' sans membres");

      // [10] Clic Terminer → writeBatch.commit() → stubs re-fire listeners
      await click(session, ".onb-footer-next");

      // Les stubs Firestore re-fire par vagues (120 ms, 320 ms, 440 ms après commit).
      // Après la vague finale (peopleBootstrapped=true), bootLoading=false → .mrd-bnav.
      const homeOk = await pollForSelector(session, ".mrd-bnav", 15_000);
      assert.ok(homeOk, ".mrd-bnav (bottom nav) doit être visible après création du foyer");

      const { result: noOnboarding } = await session.send("Runtime.evaluate", {
        expression: `!document.querySelector(".onboarding-shell")`,
        returnByValue: true,
      });
      assert.ok(noOnboarding.value, ".onboarding-shell doit avoir disparu");
    } finally {
      await session.close();
    }
  });
});
