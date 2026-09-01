import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

// `functions/` est en CommonJS (runtime Node des Cloud Functions) alors que la
// suite est en ESM : createRequire est le pont, et il evite d'y toucher.
const require_ = createRequire(import.meta.url);
const { decidePremiumFromEvent, premiumFieldsFor } = require_("../../functions/revenuecat.js");

const NOW = Date.UTC(2026, 8, 2, 12, 0);
const DANS_UN_MOIS = NOW + 30 * 24 * 3600 * 1000;
const IL_Y_A_UN_JOUR = NOW - 24 * 3600 * 1000;

function evt(over = {}) {
  return {
    type: "INITIAL_PURCHASE",
    app_user_id: "family-42",
    entitlement_ids: ["my_rolling_day_pro"],
    expiration_at_ms: DANS_UN_MOIS,
    product_id: "monthly",
    ...over,
  };
}

// ── Ce qui débloque ───────────────────────────────────────────────────────

test("webhook : un achat initial debloque le foyer", () => {
  const d = decidePremiumFromEvent(evt(), NOW);
  assert.deepEqual(d, { kind: "set", familyId: "family-42", active: true, type: "INITIAL_PURCHASE", expiresAt: DANS_UN_MOIS, productId: "monthly" });
});

test("webhook : renouvellement, reactivation et changement de formule debloquent", () => {
  ["RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE"].forEach((type) => {
    assert.equal(decidePremiumFromEvent(evt({ type }), NOW).active, true, type);
  });
});

test("webhook : l'achat a vie n'expire jamais", () => {
  // expiration_at_ms est null pour un non-renouvelable : c'est ce qui distingue
  // le Lifetime d'un abonnement arrive a echeance.
  const d = decidePremiumFromEvent(
    evt({ type: "NON_RENEWING_PURCHASE", expiration_at_ms: null, product_id: "lifetime" }), NOW);
  assert.equal(d.active, true);
  assert.equal(d.expiresAt, null);
  assert.equal(d.productId, "lifetime");
});

// ── Ce qui ne débloque pas ────────────────────────────────────────────────

test("webhook : une resiliation NE coupe PAS l'acces deja paye", () => {
  // Piege principal : CANCELLATION arrete le renouvellement, il ne met pas fin
  // a la periode en cours. Couper ici, c'est punir quelqu'un qui a paye.
  const d = decidePremiumFromEvent(evt({ type: "CANCELLATION" }), NOW);
  assert.equal(d.active, true);
});

test("webhook : un incident de paiement laisse l'acces pendant le delai de grace", () => {
  const d = decidePremiumFromEvent(evt({ type: "BILLING_ISSUE" }), NOW);
  assert.equal(d.active, true);
});

test("webhook : l'expiration coupe l'acces", () => {
  const d = decidePremiumFromEvent(evt({ type: "EXPIRATION", expiration_at_ms: IL_Y_A_UN_JOUR }), NOW);
  assert.equal(d.active, false);
});

test("webhook : une pause d'abonnement coupe l'acces", () => {
  // Meme avec une date d'expiration future : la pause prime sur la date.
  const d = decidePremiumFromEvent(evt({ type: "SUBSCRIPTION_PAUSED" }), NOW);
  assert.equal(d.active, false);
});

test("webhook : une date d'expiration depassee coupe, quel que soit le type", () => {
  const d = decidePremiumFromEvent(evt({ type: "RENEWAL", expiration_at_ms: IL_Y_A_UN_JOUR }), NOW);
  assert.equal(d.active, false);
});

// ── Transfert entre foyers ────────────────────────────────────────────────

test("webhook : un transfert deplace l'acces d'un foyer a l'autre", () => {
  const d = decidePremiumFromEvent({
    type: "TRANSFER", transferred_from: ["family-1"], transferred_to: ["family-2"],
  }, NOW);
  assert.deepEqual(d, { kind: "transfer", from: "family-1", to: "family-2", type: "TRANSFER" });
});

test("webhook : un transfert sans destinataire ne touche a rien", () => {
  assert.equal(decidePremiumFromEvent({ type: "TRANSFER", transferred_from: ["family-1"] }, NOW), null);
});

test("webhook : un transfert accepte aussi une valeur non tableau", () => {
  const d = decidePremiumFromEvent({ type: "TRANSFER", transferred_from: "a", transferred_to: "b" }, NOW);
  assert.deepEqual(d, { kind: "transfer", from: "a", to: "b", type: "TRANSFER" });
});

// ── Ce qu'on ignore ───────────────────────────────────────────────────────

test("webhook : un evenement d'un AUTRE entitlement ne touche a rien", () => {
  // Sans ce garde, un futur produit sans rapport pourrait revoquer le premium.
  assert.equal(decidePremiumFromEvent(evt({ entitlement_ids: ["autre_chose"] }), NOW), null);
});

test("webhook : entitlement_ids absent n'est pas un motif d'ignorer", () => {
  // Certains evenements non-renouvelables ne le portent pas : les ignorer ferait
  // rater de vrais achats.
  const d = decidePremiumFromEvent(evt({ entitlement_ids: undefined }), NOW);
  assert.equal(d.active, true);
});

test("webhook : entitlement_id au singulier est accepte", () => {
  const d = decidePremiumFromEvent(evt({ entitlement_ids: undefined, entitlement_id: "my_rolling_day_pro" }), NOW);
  assert.equal(d.active, true);
});

test("webhook : l'evenement de test du tableau de bord ne touche a rien", () => {
  assert.equal(decidePremiumFromEvent(evt({ type: "TEST" }), NOW), null);
});

test("webhook : un evenement sans foyer ou malforme ne touche a rien", () => {
  assert.equal(decidePremiumFromEvent(evt({ app_user_id: "" }), NOW), null);
  assert.equal(decidePremiumFromEvent(evt({ app_user_id: "   " }), NOW), null);
  assert.equal(decidePremiumFromEvent(evt({ type: "" }), NOW), null);
  assert.equal(decidePremiumFromEvent(null, NOW), null);
  assert.equal(decidePremiumFromEvent("oups", NOW), null);
});

// ── Champs écrits ─────────────────────────────────────────────────────────

test("webhook : les champs ecrits refletent la decision", () => {
  const actif = premiumFieldsFor(decidePremiumFromEvent(evt(), NOW));
  assert.deepEqual(actif, {
    premium: true, premiumSource: "revenuecat", premiumProductId: "monthly",
    premiumExpiresAt: DANS_UN_MOIS, premiumLastEvent: "INITIAL_PURCHASE",
  });
});

test("webhook : une revocation efface produit et echeance", () => {
  // Laisser un premiumProductId sur un foyer sans acces laisse croire a un bug.
  const inactif = premiumFieldsFor(decidePremiumFromEvent(evt({ type: "EXPIRATION" }), NOW));
  assert.equal(inactif.premium, false);
  assert.equal(inactif.premiumProductId, "");
  assert.equal(inactif.premiumExpiresAt, null);
});
