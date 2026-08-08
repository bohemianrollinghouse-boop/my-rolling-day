import { html, useState } from "../../lib.js";

const FEATURE_INFO = {
  meals: {
    title: "Débloque les Repas Premium",
    text: "Planifie tes repas de la semaine et relie-les à tes recettes.",
  },
  inventory: {
    title: "Débloque l'Inventaire Premium",
    text: "Suis ton stock, tes dates de péremption et tes emplacements de rangement.",
  },
  recipes: {
    title: "Débloque les Recettes Premium",
    text: "Enregistre et organise toutes tes recettes, avec suggestions.",
  },
};

const BENEFITS = [
  { icon: "🍽️", text: "Planification des repas de la semaine, liée à tes recettes" },
  { icon: "📦", text: "Inventaire complet : stock, péremption, rangement" },
  { icon: "📖", text: "Recettes illimitées, avec suggestions automatiques" },
  { icon: "🔗", text: "Listes liées à l'inventaire : déduction automatique des courses" },
  { icon: "👨‍👩‍👧‍👦", text: "Débloqué pour tout le foyer, pas seulement toi" },
];

const PLANS = {
  monthly: { label: "Mensuel", price: "4,99 €", period: "/ mois", cta: "4,99 €/mois", badge: null },
  annual: { label: "Annuel", price: "39,99 €", period: "/ an", cta: "39,99 €/an", badge: "Économise 33 %", sub: "soit 3,33 €/mois" },
};

export function PremiumLockScreen({ feature, onActivatePremium, onOpenPremiumSettings }) {
  const [plan, setPlan] = useState("annual");
  const info = FEATURE_INFO[feature] || { title: "Débloque Premium", text: "Cette fonction fait partie de l'offre Premium." };
  const activePlan = PLANS[plan];
  return html`
    <div className="premium-lock-card">
      <div className="premium-lock-icon">⭐</div>
      <h2 className="premium-lock-title">${info.title}</h2>
      <p className="premium-lock-text">${info.text}</p>

      <ul className="premium-lock-benefits">
        ${BENEFITS.map((b) => html`
          <li key=${b.text}>
            <span className="premium-lock-benefit-icon">${b.icon}</span>
            <span>${b.text}</span>
          </li>
        `)}
      </ul>

      <div className="premium-lock-plans">
        ${Object.entries(PLANS).map(([key, p]) => html`
          <button
            key=${key}
            type="button"
            className=${`premium-lock-plan${plan === key ? " on" : ""}`}
            onClick=${() => setPlan(key)}
          >
            ${p.badge ? html`<span className="premium-lock-plan-badge">${p.badge}</span>` : null}
            <span className="premium-lock-plan-label">${p.label}</span>
            <span className="premium-lock-plan-price">${p.price}<small>${p.period}</small></span>
            ${p.sub ? html`<span className="premium-lock-plan-sub">${p.sub}</span>` : null}
          </button>
        `)}
      </div>

      <button className="premium-lock-cta" onClick=${() => onActivatePremium?.()}>
        Activer Premium — ${activePlan.cta}
      </button>
      <button type="button" className="premium-lock-secondary" onClick=${() => onOpenPremiumSettings?.()}>
        Gérer depuis les Réglages
      </button>
    </div>
  `;
}
