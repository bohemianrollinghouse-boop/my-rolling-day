import test from "node:test";
import assert from "node:assert/strict";

import {
  hasPremiumEntitlement,
  purchaseErrorMessage,
  selectPlansFromOffering,
} from "../../src/app/providers/clientPurchases.js";
import { PREMIUM_DEFAULT_PLAN, PREMIUM_PLANS } from "../../src/app/config/premiumPlans.js";

function pkg(identifier, priceString, productId = "p") {
  return { identifier, product: { identifier: productId, priceString } };
}

// ── Formules ──────────────────────────────────────────────────────────────

test("formules : les trois packages attendus sont declares dans le bon ordre", () => {
  assert.deepEqual(PREMIUM_PLANS.map((plan) => plan.id), ["monthly", "yearly", "lifetime"]);
  assert.deepEqual(PREMIUM_PLANS.map((plan) => plan.packageId),
    ["$rc_monthly", "$rc_annual", "$rc_lifetime"]);
  assert.ok(PREMIUM_PLANS.some((plan) => plan.id === PREMIUM_DEFAULT_PLAN),
    "la formule par defaut doit exister");
});

test("formules : aucun prix n'est ecrit en dur", () => {
  const serialise = JSON.stringify(PREMIUM_PLANS);
  assert.doesNotMatch(serialise, /\d+[.,]\d{2}\s*€/, "les montants doivent venir de l'offering");
});

test("selectPlansFromOffering : croise les formules avec les packages, prix compris", () => {
  const plans = selectPlansFromOffering({
    availablePackages: [
      pkg("$rc_annual", "39,99 €", "yearly"),
      pkg("$rc_monthly", "4,99 €", "monthly"),
      pkg("$rc_lifetime", "89,99 €", "lifetime"),
    ],
  });
  assert.deepEqual(plans.map((plan) => plan.id), ["monthly", "yearly", "lifetime"],
    "l'ordre vient de PREMIUM_PLANS, pas de l'offering");
  assert.deepEqual(plans.map((plan) => plan.priceString), ["4,99 €", "39,99 €", "89,99 €"]);
  assert.equal(plans[2].productId, "lifetime");
  assert.equal(plans[1].recommended, true);
  assert.equal(plans[2].oneTime, true);
});

test("selectPlansFromOffering : une formule sans package est ecartee", () => {
  const plans = selectPlansFromOffering({
    availablePackages: [pkg("$rc_monthly", "4,99 €")],
  });
  assert.deepEqual(plans.map((plan) => plan.id), ["monthly"]);
});

test("selectPlansFromOffering : un package sans prix est ecarte", () => {
  // Mieux vaut deux formules facturables qu'une troisieme sans montant.
  const plans = selectPlansFromOffering({
    availablePackages: [pkg("$rc_monthly", "4,99 €"), { identifier: "$rc_annual", product: {} }],
  });
  assert.deepEqual(plans.map((plan) => plan.id), ["monthly"]);
});

test("selectPlansFromOffering : une offering vide ou absente ne rend rien", () => {
  assert.deepEqual(selectPlansFromOffering(null), []);
  assert.deepEqual(selectPlansFromOffering({}), []);
  assert.deepEqual(selectPlansFromOffering({ availablePackages: [] }), []);
  assert.deepEqual(selectPlansFromOffering({ availablePackages: "oups" }), []);
});

test("selectPlansFromOffering : un package inconnu est ignore", () => {
  const plans = selectPlansFromOffering({
    availablePackages: [pkg("$rc_weekly", "1,99 €"), pkg("$rc_monthly", "4,99 €")],
  });
  assert.deepEqual(plans.map((plan) => plan.id), ["monthly"]);
});

// ── Entitlement ───────────────────────────────────────────────────────────

test("hasPremiumEntitlement : vrai seulement si l'entitlement est actif", () => {
  assert.equal(hasPremiumEntitlement({ entitlements: { active: { my_rolling_day_pro: {} } } }), true);
  assert.equal(hasPremiumEntitlement({ entitlements: { active: {} } }), false);
  assert.equal(hasPremiumEntitlement({ entitlements: { active: { autre_chose: {} } } }), false);
});

test("hasPremiumEntitlement : une reponse incomplete ne debloque rien", () => {
  assert.equal(hasPremiumEntitlement(null), false);
  assert.equal(hasPremiumEntitlement({}), false);
  assert.equal(hasPremiumEntitlement({ entitlements: {} }), false);
  assert.equal(hasPremiumEntitlement({ entitlements: { active: null } }), false);
});

test("hasPremiumEntitlement : un entitlement expire ne figure pas dans active", () => {
  // RevenueCat ne met dans `active` que ce qui est en cours de validite ;
  // `all` contient aussi l'historique, qu'on ne doit surtout pas lire.
  const info = { entitlements: { all: { my_rolling_day_pro: {} }, active: {} } };
  assert.equal(hasPremiumEntitlement(info), false);
});

// ── Messages d'erreur ─────────────────────────────────────────────────────

test("purchaseErrorMessage : une annulation ne produit aucun message", () => {
  assert.equal(purchaseErrorMessage({ userCancelled: true }), "");
  assert.equal(purchaseErrorMessage({ code: "1" }), "");
  assert.equal(purchaseErrorMessage({ code: 1 }), "");
});

test("purchaseErrorMessage : les echecs connus ont un message dedie", () => {
  assert.match(purchaseErrorMessage({ code: "2" }), /autoris/);
  assert.match(purchaseErrorMessage({ code: "3" }), /indisponibles/);
  assert.match(purchaseErrorMessage({ code: "6" }), /disponible/);
});

test("purchaseErrorMessage : un echec inconnu reste comprehensible", () => {
  const message = purchaseErrorMessage({ code: "999" });
  assert.match(message, /Réessaie/);
  assert.equal(purchaseErrorMessage(undefined), message);
});
