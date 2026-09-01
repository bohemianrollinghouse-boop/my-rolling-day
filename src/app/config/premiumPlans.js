// Formules Premium — données pures, aucune dépendance (couche `config/`).
//
// Les identifiants ci-dessous sont ceux du projet RevenueCat `my-rolling-day`
// (proj9e1ddf07), offering `default`. Ils ne sont PAS des prix : les montants
// et les libellés monétaires viennent toujours de l'offering lue à l'exécution.
//
// C'est délibéré. Les prix étaient jusqu'ici écrits en dur à deux endroits —
// `PremiumLockScreen.js` annonçait 4,99 €/mois pendant que le site vitrine
// annonçait 3,99 € (www/.env, PUBLIC_PREMIUM_PRICE). Deux copies d'un chiffre
// que seul le store connaît vraiment : elles finissent toujours par diverger,
// et elles ne peuvent pas connaître la devise ni les tarifs régionaux.

/** Entitlement RevenueCat qui débloque l'app. */
export const PREMIUM_ENTITLEMENT = "my_rolling_day_pro";

/**
 * Packages de l'offering `default`, dans l'ordre d'affichage.
 *
 * `$rc_monthly`, `$rc_annual` et `$rc_lifetime` sont les identifiants
 * standards de RevenueCat — ils ne sont pas choisis par nous.
 */
export const PREMIUM_PLANS = [
  {
    id: "monthly",
    packageId: "$rc_monthly",
    label: "Mensuel",
    period: "/ mois",
    hint: "Sans engagement, résiliable à tout moment.",
  },
  {
    id: "yearly",
    packageId: "$rc_annual",
    label: "Annuel",
    period: "/ an",
    hint: "Le meilleur rapport pour un usage à l'année.",
    recommended: true,
  },
  {
    id: "lifetime",
    packageId: "$rc_lifetime",
    label: "À vie",
    period: "une seule fois",
    hint: "Un paiement unique, aucun renouvellement.",
    oneTime: true,
  },
];

/** Formule pré-sélectionnée à l'ouverture. */
export const PREMIUM_DEFAULT_PLAN = "yearly";

export const PREMIUM_BENEFITS = [
  { icon: "🍽️", text: "Planification des repas de la semaine, liée à tes recettes" },
  { icon: "📦", text: "Inventaire complet : stock, péremption, rangement" },
  { icon: "📖", text: "Recettes illimitées, avec suggestions automatiques" },
  { icon: "🔗", text: "Listes liées à l'inventaire : déduction automatique des courses" },
  { icon: "👨‍👩‍👧‍👦", text: "Débloqué pour tout le foyer, pas seulement toi" },
];
