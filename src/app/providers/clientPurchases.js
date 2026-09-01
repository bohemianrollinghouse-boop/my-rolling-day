// Achats in-app — adaptateur RevenueCat.
//
// Le SDK natif n'existe pas sur le web : `Capacitor.isNativePlatform()` garde
// chaque appel, et les fonctions renvoient un état « indisponible » plutôt que
// de lever. Une PWA doit pouvoir afficher l'écran de vente et expliquer que
// l'achat se fait depuis l'app, pas planter dessus.

import { Capacitor } from "@capacitor/core";
import { PREMIUM_ENTITLEMENT, PREMIUM_PLANS } from "../config/premiumPlans.js";
import { environment } from "../../environments/environment.js";

let configured = null;

/** Clé publique du SDK pour la plateforme courante, ou "" si non renseignée. */
export function publicSdkKeyForPlatform(platform = Capacitor.getPlatform()) {
  const keys = environment.revenueCat || {};
  return keys[platform] || keys.default || "";
}

/**
 * Configure le SDK une seule fois.
 *
 * ⚠️ La clé attendue est la clé PUBLIQUE du SDK (`appl_…` iOS, `goog_…`
 * Android, ou celle du Test Store). Ne jamais y mettre la clé secrète `sk_` :
 * elle donne un accès total au projet RevenueCat par l'API REST et n'a rien à
 * faire dans un binaire distribué.
 */
export async function initPurchases(appUserId = "") {
  if (!Capacitor.isNativePlatform()) return { ok: false, reason: "web" };
  const apiKey = publicSdkKeyForPlatform();
  if (!apiKey) return { ok: false, reason: "missing-key" };
  if (configured) return configured;

  configured = (async () => {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    await Purchases.configure({ apiKey, appUserID: appUserId || undefined });
    return { ok: true };
  })().catch((error) => {
    configured = null; // laisse une nouvelle tentative possible
    console.error("[achats] configuration RevenueCat echouee", error?.message, error);
    return { ok: false, reason: "error", error };
  });

  return configured;
}

// ── Fonctions pures (testables sans SDK ni navigateur) ───────────────────────

/**
 * Croise nos formules avec les packages de l'offering.
 *
 * Le prix affiché vient TOUJOURS de `product.priceString` : c'est le seul qui
 * porte la devise et le tarif régional du store. Une formule dont le package
 * est absent de l'offering est écartée — mieux vaut proposer deux formules
 * valides qu'une troisième qu'on ne saurait pas facturer.
 */
export function selectPlansFromOffering(offering, plans = PREMIUM_PLANS) {
  const packages = Array.isArray(offering?.availablePackages) ? offering.availablePackages : [];
  const byId = new Map(packages.map((entry) => [entry?.identifier, entry]));
  return plans
    .map((plan) => {
      const pkg = byId.get(plan.packageId);
      const priceString = pkg?.product?.priceString;
      if (!priceString) return null;
      return { ...plan, priceString, productId: pkg?.product?.identifier || "", package: pkg };
    })
    .filter(Boolean);
}

/** true si le client possède l'entitlement premium, actif. */
export function hasPremiumEntitlement(customerInfo, entitlement = PREMIUM_ENTITLEMENT) {
  const active = customerInfo?.entitlements?.active;
  if (!active || typeof active !== "object") return false;
  return Boolean(active[entitlement]);
}

/**
 * Message utilisateur pour un échec d'achat.
 *
 * Une annulation n'est pas une erreur : l'utilisateur a fermé la feuille du
 * store. La signaler comme un échec est le meilleur moyen d'inquiéter pour rien.
 */
export function purchaseErrorMessage(error) {
  if (error?.userCancelled || error?.code === "1" || error?.code === 1) return "";
  const code = String(error?.code || "");
  if (code === "2") return "Le store n'a pas autorisé cet achat.";
  if (code === "3") return "Achats indisponibles sur cet appareil.";
  if (code === "6") return "Cet achat n'est pas disponible pour le moment.";
  return "L'achat n'a pas abouti. Réessaie dans un instant.";
}

// ── Appels SDK ───────────────────────────────────────────────────────────────

/** Offering courante, ou null si indisponible. */
export async function fetchCurrentOffering() {
  if (!Capacitor.isNativePlatform()) return null;
  const { Purchases } = await import("@revenuecat/purchases-capacitor");
  const offerings = await Purchases.getOfferings();
  return offerings?.current || null;
}

/** Lance l'achat d'un package. Renvoie { purchased, customerInfo, cancelled }. */
export async function purchasePlan(pkg) {
  const { Purchases } = await import("@revenuecat/purchases-capacitor");
  try {
    const result = await Purchases.purchasePackage({ aPackage: pkg });
    return { purchased: hasPremiumEntitlement(result?.customerInfo), customerInfo: result?.customerInfo, cancelled: false };
  } catch (error) {
    if (error?.userCancelled) return { purchased: false, cancelled: true };
    throw error;
  }
}

/** Restaure les achats — obligatoire pour Apple, et attendu sur un changement d'appareil. */
export async function restorePurchases() {
  const { Purchases } = await import("@revenuecat/purchases-capacitor");
  const { customerInfo } = await Purchases.restorePurchases();
  return { restored: hasPremiumEntitlement(customerInfo), customerInfo };
}
