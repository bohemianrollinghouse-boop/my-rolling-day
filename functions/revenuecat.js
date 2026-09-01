/**
 * Logique de décision du webhook RevenueCat — module pur, sans Firestore.
 *
 * Séparé de `index.js` pour être testable sans émulateur ni déploiement :
 * c'est ici qu'est le vrai risque du dispositif. Se tromper d'événement, c'est
 * soit couper l'accès à quelqu'un qui a payé, soit l'offrir à quelqu'un qui ne
 * paie plus.
 *
 * Le contrat d'entrée est le corps d'un webhook RevenueCat : `{ event: {...} }`.
 * `app_user_id` porte l'IDENTIFIANT DU FOYER — c'est ce que l'app passe à
 * `Purchases.configure()` (voir src/app/providers/clientPurchases.js).
 */

const PREMIUM_ENTITLEMENT = "my_rolling_day_pro";

/**
 * Types qui retirent l'accès, indépendamment de la date d'expiration.
 *
 * `CANCELLATION` n'en fait PAS partie, et c'est le piège principal : résilier
 * arrête le renouvellement, l'accès court jusqu'à la fin de la période déjà
 * payée. C'est `EXPIRATION` qui coupe. `BILLING_ISSUE` non plus : c'est un
 * avertissement pendant le délai de grâce, l'accès est toujours dû.
 */
const LOCKING_TYPES = new Set(["EXPIRATION", "SUBSCRIPTION_PAUSED"]);

/** Événement de test envoyé depuis le tableau de bord — ne touche à rien. */
const IGNORED_TYPES = new Set(["TEST"]);

function firstAppUserId(value) {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

/**
 * Traduit un événement en action sur Firestore.
 *
 * @returns {null|{kind:"set",familyId:string,active:boolean,type:string,expiresAt:number|null,productId:string}
 *          |{kind:"transfer",from:string,to:string,type:string}}
 *   `null` = événement sans rapport avec notre entitlement, on ne touche à rien.
 */
function decidePremiumFromEvent(event, now = Date.now()) {
  if (!event || typeof event !== "object") return null;
  const type = String(event.type || "").toUpperCase();
  if (!type || IGNORED_TYPES.has(type)) return null;

  // Un même reçu qui passe d'un foyer à un autre : deux écritures, pas une.
  // C'est le seul cas où l'ancien foyer doit PERDRE l'accès.
  if (type === "TRANSFER") {
    const from = firstAppUserId(event.transferred_from);
    const to = firstAppUserId(event.transferred_to);
    if (!to) return null;
    return { kind: "transfer", from, to, type };
  }

  const familyId = String(event.app_user_id || "").trim();
  if (!familyId) return null;

  // `entitlement_ids` absent : on ne peut pas conclure que l'événement nous
  // concerne, mais on ne l'ignore pas non plus — certains événements
  // non-renouvelables ne le portent pas. Present mais sans notre entitlement :
  // c'est un autre produit, on ne touche a rien.
  const ids = Array.isArray(event.entitlement_ids)
    ? event.entitlement_ids
    : event.entitlement_id
      ? [event.entitlement_id]
      : null;
  if (ids && !ids.includes(PREMIUM_ENTITLEMENT)) return null;

  const productId = String(event.product_id || "");

  if (LOCKING_TYPES.has(type)) {
    return { kind: "set", familyId, active: false, type, expiresAt: null, productId };
  }

  // `expiration_at_ms` vaut null pour un achat à vie : il n'expire jamais.
  const raw = event.expiration_at_ms;
  const expiresAt = raw === null || raw === undefined ? null : Number(raw);
  const active = expiresAt === null || (Number.isFinite(expiresAt) && expiresAt > now);
  return { kind: "set", familyId, active, type, expiresAt, productId };
}

/** Champs à écrire sur le document foyer pour une décision `set`. */
function premiumFieldsFor(decision) {
  return {
    premium: decision.active,
    premiumSource: "revenuecat",
    premiumProductId: decision.active ? decision.productId || "" : "",
    premiumExpiresAt: decision.active ? decision.expiresAt : null,
    premiumLastEvent: decision.type,
  };
}

module.exports = { PREMIUM_ENTITLEMENT, decidePremiumFromEvent, premiumFieldsFor };
