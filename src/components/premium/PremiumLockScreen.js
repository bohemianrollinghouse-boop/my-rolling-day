import { html } from "../../lib.js";

const FEATURE_INFO = {
  meals: {
    title: "Repas Premium",
    text: "Planifie tes repas de la semaine, relie-les à tes recettes et déduis automatiquement ton inventaire.",
  },
  inventory: {
    title: "Inventaire Premium",
    text: "Suis ton stock, tes dates de péremption et tes emplacements de rangement.",
  },
  recipes: {
    title: "Recettes Premium",
    text: "Enregistre et organise toutes tes recettes, avec suggestions et liaison automatique à l'inventaire.",
  },
};

export function PremiumLockScreen({ feature, onOpenPremiumSettings }) {
  const info = FEATURE_INFO[feature] || { title: "Fonction Premium", text: "Cette fonction fait partie de l'offre Premium." };
  return html`
    <div className="premium-lock-card">
      <div className="premium-lock-icon">⭐</div>
      <h2 className="premium-lock-title">${info.title}</h2>
      <p className="premium-lock-text">${info.text}</p>
      <button className="premium-lock-cta" onClick=${onOpenPremiumSettings}>Découvrir Premium</button>
    </div>
  `;
}
