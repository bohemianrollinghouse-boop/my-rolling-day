import { html } from "../../lib.js";
import { PREMIUM_BENEFITS } from "../../config/premiumPlans.js";

/**
 * Encart affiché à la place d'un écran verrouillé (Repas, Inventaire, Recettes).
 *
 * Il ne montre NI prix NI formules, volontairement : c'est le premier des deux
 * temps. Ici on explique ce que Premium débloque, et on emmène vers l'écran
 * d'abonnement (/premium) qui, lui, présente les trois formules. Proposer le
 * choix aux deux endroits obligeait à le refaire deux fois de suite.
 *
 * L'autre raison est plus dure : les prix affichés ici étaient écrits en dur
 * (4,99 € / 39,99 €) alors que l'écran d'abonnement les lit dans l'offering
 * RevenueCat. Deux sources pour un même chiffre, dont une qui ne connaît ni la
 * devise ni les tarifs régionaux — elles auraient fini par se contredire.
 */
const FEATURE_INFO = {
  meals: {
    title: "Les Repas sont dans Premium",
    text: "Planifie tes repas de la semaine et relie-les à tes recettes.",
    // Les bénéfices les plus parlants depuis cet écran-là, en premier.
    highlights: ["🍽️", "🔗", "👨‍👩‍👧‍👦"],
  },
  inventory: {
    title: "L'Inventaire est dans Premium",
    text: "Suis ton stock, tes dates de péremption et tes emplacements de rangement.",
    highlights: ["📦", "🔗", "👨‍👩‍👧‍👦"],
  },
  recipes: {
    title: "Les Recettes sont dans Premium",
    text: "Enregistre et organise toutes tes recettes, avec suggestions.",
    highlights: ["📖", "🍽️", "👨‍👩‍👧‍👦"],
  },
};

const DEFAULT_INFO = {
  title: "Cette fonction est dans Premium",
  text: "Elle fait partie de l'offre Premium.",
  highlights: ["🍽️", "📦", "📖"],
};

export function PremiumLockScreen({ feature, onActivatePremium, onOpenPremiumSettings }) {
  const info = FEATURE_INFO[feature] || DEFAULT_INFO;
  // On garde l'ordre de `highlights`, pas celui de la liste complète : le
  // bénéfice qui correspond à l'écran verrouillé doit venir en tête.
  const benefits = info.highlights
    .map((icon) => PREMIUM_BENEFITS.find((benefit) => benefit.icon === icon))
    .filter(Boolean);

  return html`
    <div className="premium-lock-card">
      <div className="premium-lock-icon">⭐</div>
      <h2 className="premium-lock-title">${info.title}</h2>
      <p className="premium-lock-text">${info.text}</p>

      <ul className="premium-lock-benefits">
        ${benefits.map((benefit) => html`
          <li key=${benefit.text}>
            <span className="premium-lock-benefit-icon">${benefit.icon}</span>
            <span>${benefit.text}</span>
          </li>
        `)}
      </ul>

      <button type="button" className="premium-lock-cta" onClick=${() => onActivatePremium?.()}>
        Voir les formules
      </button>
      <button type="button" className="premium-lock-secondary" onClick=${() => onOpenPremiumSettings?.()}>
        Gérer depuis les Réglages
      </button>
    </div>
  `;
}
