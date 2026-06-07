import { html, useEffect, useState } from "../../lib.js";
import { createBugReport, createFeatureRequest } from "../../firebase/client.js";
import { LegalTextPage } from "./SettingsUI.js";
import { PrivacyPolicyPage, TERMS_SECTIONS } from "./SettingsLegal.js";

// ── Page support / légal (montée quand supportPage est défini) ────────────
// Passe key=${supportPage} depuis SettingsView pour réinitialiser l'état
// automatiquement à chaque changement de page.

export function SettingsSupportPage({ supportPage, onBack, userId }) {
  const [form, setForm] = useState({ title: "", description: "", device: "" });
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Remonte en haut à chaque montage (= chaque changement de supportPage via key)
  useEffect(() => {
    const scroller = document.querySelector(".mrd-screen .cnt");
    if (scroller?.scrollTo) scroller.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  const pageTitle =
    supportPage === "bug" ? "Signaler un bug"
    : supportPage === "feature" ? "Suggerer une fonctionnalite"
    : supportPage === "contact" ? "Contacter le support"
    : supportPage === "privacy" ? "Politique de confidentialite"
    : "Conditions d'utilisation";

  async function handleSubmit(event) {
    event.preventDefault();
    setSending(true);
    setMessage("");
    setError("");
    try {
      if (supportPage === "bug") {
        await createBugReport({
          title: form.title,
          description: form.description,
          device: form.device,
          userId,
        });
        setMessage("Merci, le bug a bien ete envoye.");
      } else if (supportPage === "feature") {
        await createFeatureRequest({
          title: form.title,
          description: form.description,
          userId,
        });
        setMessage("Merci, ta suggestion a bien ete envoyee.");
      }
      setForm({ title: "", description: "", device: "" });
    } catch (err) {
      console.error("[support] submit failed", err);
      setError(err?.message || "Impossible d'envoyer pour le moment.");
    } finally {
      setSending(false);
    }
  }

  return html`
    <div className="mrd-set-page support-page">
      <div className="support-page-hero">
        <div className="onboarding-kicker">Support & legal</div>
        <h1>${pageTitle}</h1>
      </div>

      ${supportPage === "bug" || supportPage === "feature" ? html`
        <form className="support-form-card" onSubmit=${handleSubmit}>
          <label className="support-field">
            <span>Titre</span>
            <input
              className="support-input"
              value=${form.title}
              onInput=${(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder=${supportPage === "bug" ? "Ex. La liste ne se synchronise pas" : "Ex. Ajouter une vue vacances"}
            />
          </label>
          <label className="support-field">
            <span>Description</span>
            <textarea
              className="support-textarea"
              rows="6"
              value=${form.description}
              onInput=${(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="Explique ce que tu as observe ou ce que tu aimerais ajouter."
            ></textarea>
          </label>
          ${supportPage === "bug" ? html`
            <label className="support-field">
              <span>Appareil / plateforme optionnel</span>
              <input
                className="support-input"
                value=${form.device}
                onInput=${(event) => setForm((current) => ({ ...current, device: event.target.value }))}
                placeholder="iPhone, Android, Chrome, Safari..."
              />
            </label>
          ` : null}
          ${message ? html`<div className="success-box">${message}</div>` : null}
          ${error ? html`<div className="error-box">${error}</div>` : null}
          <button className="support-submit" type="submit" disabled=${sending}>
            ${sending ? "Envoi..." : "Envoyer"}
          </button>
        </form>
      ` : null}

      ${supportPage === "contact" ? html`
        <div className="support-contact-card">
          <div className="support-contact-label">Email support</div>
          <a href="mailto:contact@bohemianrollinghouse.fr">contact@bohemianrollinghouse.fr</a>
        </div>
      ` : null}

      ${supportPage === "privacy" ? html`<${PrivacyPolicyPage} />` : null}

      ${supportPage === "terms" ? html`
        <${LegalTextPage}
          title=${pageTitle}
          intro="Ces conditions expliquent les regles principales pour utiliser My Rolling Day dans un cadre familial et organise."
          sections=${TERMS_SECTIONS}
        />
      ` : null}
    </div>
  `;
}
