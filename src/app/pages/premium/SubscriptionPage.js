import { html, useEffect, useState } from "../../lib.js";
import { PREMIUM_BENEFITS, PREMIUM_DEFAULT_PLAN, PREMIUM_PLANS } from "../../config/premiumPlans.js";
import {
  fetchCurrentOffering,
  purchaseErrorMessage,
  purchasePlan,
  restorePurchases,
  selectPlansFromOffering,
} from "../../providers/clientPurchases.js";

/**
 * Écran d'abonnement — Mensuel, Annuel, À vie.
 *
 * Les prix ne sont jamais écrits ici : ils viennent de l'offering RevenueCat,
 * seule source qui connaisse la devise et le tarif régional du store. Tant que
 * l'offering n'est pas chargée, l'écran affiche des squelettes plutôt que des
 * montants inventés — un prix faux sur un écran de vente est pire qu'un prix
 * absent.
 */
export function SubscriptionPage({ isPremium = false, onPurchased, onClose }) {
  const [plans, setPlans] = useState([]);
  const [selected, setSelected] = useState(PREMIUM_DEFAULT_PLAN);
  const [status, setStatus] = useState("loading"); // loading | ready | unavailable
  const [busy, setBusy] = useState("");            // "" | purchase | restore
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const offering = await fetchCurrentOffering();
        const available = selectPlansFromOffering(offering);
        if (cancelled) return;
        if (!available.length) {
          setStatus("unavailable");
          return;
        }
        setPlans(available);
        // La formule par défaut peut ne pas être proposée par l'offering.
        if (!available.some((plan) => plan.id === PREMIUM_DEFAULT_PLAN)) setSelected(available[0].id);
        setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        console.error("[premium] offering illisible", error?.message, error);
        setStatus("unavailable");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const activePlan = plans.find((plan) => plan.id === selected) || null;

  async function handlePurchase() {
    if (!activePlan || busy) return;
    setBusy("purchase");
    setMessage("");
    try {
      const { purchased, cancelled } = await purchasePlan(activePlan.package);
      if (cancelled) return;
      if (purchased) onPurchased?.();
      else setMessage("L'achat est passé mais l'accès n'est pas encore actif. Réessaie « Restaurer mes achats » dans un instant.");
    } catch (error) {
      const text = purchaseErrorMessage(error);
      if (text) setMessage(text);
    } finally {
      setBusy("");
    }
  }

  async function handleRestore() {
    if (busy) return;
    setBusy("restore");
    setMessage("");
    try {
      const { restored } = await restorePurchases();
      if (restored) onPurchased?.();
      else setMessage("Aucun achat à restaurer sur ce compte.");
    } catch (error) {
      setMessage("La restauration a échoué. Réessaie dans un instant.");
    } finally {
      setBusy("");
    }
  }

  if (isPremium) {
    return html`
      <div className="premium-page premium-page-active">
        <div className="premium-page-icon">⭐</div>
        <h2 className="premium-page-title">Premium est actif</h2>
        <p className="premium-page-text">Ton foyer a accès aux Repas, à l'Inventaire et aux Recettes.</p>
        <button type="button" className="premium-lock-secondary" onClick=${() => onClose?.()}>Retour</button>
      </div>
    `;
  }

  return html`
    <div className="premium-page">
      <div className="premium-page-icon">⭐</div>
      <h2 className="premium-page-title">Passe en Premium</h2>
      <p className="premium-page-text">Repas, Inventaire et Recettes, débloqués pour tout le foyer.</p>

      <ul className="premium-lock-benefits">
        ${PREMIUM_BENEFITS.map((benefit) => html`
          <li key=${benefit.text}>
            <span className="premium-lock-benefit-icon">${benefit.icon}</span>
            <span>${benefit.text}</span>
          </li>
        `)}
      </ul>

      ${status === "loading" ? html`
        <div className="premium-page-plans">
          ${PREMIUM_PLANS.map((plan) => html`
            <div key=${plan.id} className="premium-page-plan is-skeleton" aria-hidden="true">
              <span className="premium-lock-plan-label">${plan.label}</span>
              <span className="premium-page-plan-skeleton"></span>
            </div>
          `)}
        </div>
        <p className="premium-page-note">Chargement des tarifs…</p>
      ` : null}

      ${status === "unavailable" ? html`
        <p className="premium-page-note premium-page-note-warn">
          Les tarifs ne sont pas disponibles pour le moment. L'abonnement se souscrit depuis
          l'application iOS ou Android.
        </p>
      ` : null}

      ${status === "ready" ? html`
        <div className="premium-page-plans">
          ${plans.map((plan) => html`
            <button
              key=${plan.id}
              type="button"
              className=${`premium-page-plan${selected === plan.id ? " on" : ""}`}
              aria-pressed=${selected === plan.id}
              onClick=${() => setSelected(plan.id)}
            >
              ${plan.recommended ? html`<span className="premium-lock-plan-badge">Recommandé</span>` : null}
              <span className="premium-lock-plan-label">${plan.label}</span>
              <span className="premium-lock-plan-price">${plan.priceString}<small>${plan.period}</small></span>
              <span className="premium-lock-plan-sub">${plan.hint}</span>
            </button>
          `)}
        </div>

        <button
          type="button"
          className="premium-lock-cta"
          disabled=${busy !== "" || !activePlan}
          onClick=${handlePurchase}
        >
          ${busy === "purchase"
            ? "Achat en cours…"
            : activePlan?.oneTime
              ? `Acheter — ${activePlan.priceString}`
              : `S'abonner — ${activePlan?.priceString || ""}`}
        </button>
      ` : null}

      ${message ? html`<p className="premium-page-note premium-page-note-warn">${message}</p>` : null}

      <button type="button" className="premium-lock-secondary" disabled=${busy !== ""} onClick=${handleRestore}>
        ${busy === "restore" ? "Restauration…" : "Restaurer mes achats"}
      </button>

      <p className="premium-page-legal">
        Les abonnements se renouvellent automatiquement jusqu'à résiliation, gérable depuis ton
        compte ${" "}App Store ou Google Play. L'achat « À vie » est un paiement unique.
      </p>

      <button type="button" className="premium-lock-secondary" onClick=${() => onClose?.()}>Retour</button>
    </div>
  `;
}
