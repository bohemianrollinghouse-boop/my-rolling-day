/**
 * NewHouseholdWizard
 *
 * Wizard modal pour créer un nouveau foyer depuis les Réglages.
 * Reprend le style visuel de l'OnboardingFlow (mêmes classes CSS,
 * mêmes étapes) mais sans les étapes "prénom / couleur" déjà remplies.
 *
 * Étapes :
 *   1. Nom du foyer (avec suggestions)
 *   2. Membres du foyer (personnes, enfants, animaux)
 *   3. Qui aura l'app ? (seulement si des membres ont été ajoutés)
 *
 * Props :
 *   onClose()                   — ferme le wizard sans créer
 *   onSubmit(payload)           — crée le foyer (format handleCreateHouseholdOnboarding)
 *   busy                        — désactive le bouton "Créer" pendant la requête
 *   errorMessage                — erreur remontée depuis le parent
 *   linkedPerson                — profil lié de l'utilisateur courant (displayName, color)
 *   userProfile                 — profil Firebase de l'utilisateur (displayName)
 */

import { html, useState } from "../../lib.js";

// ─── Constantes ────────────────────────────────────────────────────────────────

const KIND_OPTIONS = [
  { id: "person", emoji: "👤", label: "Personne" },
  { id: "child",  emoji: "🧒", label: "Enfant"   },
  { id: "pet",    emoji: "🐾", label: "Animal"   },
];

const KIND_TO_TYPE = { person: "adult", child: "child", pet: "pet" };

function kindLabel(kind) {
  if (kind === "child") return "Enfant";
  if (kind === "pet")   return "Animal";
  return "Personne";
}

function kindEmoji(kind) {
  if (kind === "child") return "🧒";
  if (kind === "pet")   return "🐾";
  return "👤";
}

// ─── Sous-composants réutilisant les classes CSS de l'onboarding ───────────────

function ProgressDots({ total, current }) {
  return html`
    <div className="onb-step-dots">
      ${Array.from({ length: total }, (_, i) => html`
        <span
          key=${i}
          className=${`onb-dot ${
            i === current ? "onb-dot-active"
            : i < current ? "onb-dot-done"
            : "onb-dot-pending"
          }`}
        ></span>
      `)}
    </div>
  `;
}

function WizardFooter({ canGoBack, onBack, onNext, nextLabel, nextDisabled, busy }) {
  return html`
    <div className="onb-step-footer">
      <button
        type="button"
        className="onb-footer-back"
        onClick=${onBack}
        disabled=${!canGoBack}
        aria-label="Étape précédente"
      >←</button>
      <button
        type="button"
        className="onb-footer-next"
        onClick=${onNext}
        disabled=${nextDisabled || busy}
      >${busy ? "Création…" : nextLabel}</button>
    </div>
  `;
}

// ─── Étape 1 : Nom du foyer ────────────────────────────────────────────────────

function StepHouseholdName({ value, onChange, onNext, total }) {
  const SUGGESTIONS = ["Chez nous", "La maison", "Notre nid", "La famille"];

  return html`
    <div className="onboarding-step">
      <div className="onb-step-header">
        <div className="onboarding-kicker">Étape 1 sur ${total}</div>
        <h1 className="onb-step-title">Nom du foyer</h1>
        <p className="onboarding-subtitle">
          Comment s'appelle ton nouveau foyer ?
        </p>
      </div>

      <div className="onboarding-field">
        <input
          className="onboarding-input"
          value=${value}
          placeholder="Ex. Famille Dupont, L'appart…"
          autoFocus
          onInput=${(e) => onChange(e.target.value)}
          onKeyDown=${(e) => { if (e.key === "Enter" && value.trim()) onNext(); }}
        />
      </div>

      <div className="onb-suggestion-chips">
        ${SUGGESTIONS.map((s) => html`
          <button
            key=${s}
            type="button"
            className=${`onb-suggestion-chip${value === s ? " onb-suggestion-chip-active" : ""}`}
            onClick=${() => onChange(s)}
          >${s}</button>
        `)}
      </div>
    </div>
  `;
}

// ─── Étape 2 : Membres ─────────────────────────────────────────────────────────

function StepMembers({ profiles, draft, onDraftChange, onAddProfile, onRemoveProfile, total }) {
  return html`
    <div className="onboarding-step">
      <div className="onb-step-header">
        <div className="onboarding-kicker">Étape 2 sur ${total}</div>
        <h1 className="onb-step-title">Ton foyer</h1>
        <p className="onboarding-subtitle">
          Personnes, enfants, animaux — tout le monde a sa place.
        </p>
      </div>

      <div className="onb-member-add-card">
        <div className="onb-member-add-label">Nouveau membre</div>

        <div className="onb-kind-tabs">
          ${KIND_OPTIONS.map(({ id, emoji, label }) => html`
            <button
              key=${id}
              type="button"
              className=${`onb-kind-tab${draft.kind === id ? " onb-kind-tab-active" : ""}`}
              onClick=${() => onDraftChange({ kind: id })}
            >
              <span className="onb-kind-tab-emoji">${emoji}</span>
              <span>${label}</span>
            </button>
          `)}
        </div>

        <input
          className="onboarding-input"
          value=${draft.firstName}
          placeholder=${draft.kind === "pet" ? "Nom de l'animal" : "Prénom"}
          onInput=${(e) => onDraftChange({ firstName: e.target.value })}
          onKeyDown=${(e) => { if (e.key === "Enter") { e.preventDefault(); onAddProfile(); } }}
        />

        <button
          type="button"
          className="onb-member-add-btn"
          onClick=${onAddProfile}
          disabled=${!draft.firstName.trim()}
        >+ Ajouter au foyer</button>
      </div>

      <div className="onboarding-profile-list">
        ${profiles.length === 0
          ? html`<div className="onboarding-empty-state">Aucun autre membre pour le moment.</div>`
          : profiles.map((p) => {
              const k = p.kind || "person";
              return html`
                <div key=${p.id} className="onb-member-row">
                  <div className="onb-member-avatar" style=${{ background: "oklch(60% 0.12 35)" }}>
                    ${k === "pet" ? "🐾" : p.firstName.slice(0, 1).toUpperCase()}
                    ${k !== "person" ? html`<span className="onb-member-avatar-badge">${kindEmoji(k)}</span>` : null}
                  </div>
                  <div style=${{ flex: 1, minWidth: 0 }}>
                    <div className="onb-member-name">${p.firstName}</div>
                    <div className="onb-member-type">${kindLabel(k)}</div>
                  </div>
                  <button type="button" className="onb-member-remove" onClick=${() => onRemoveProfile(p.id)}>×</button>
                </div>
              `;
            })
        }
      </div>
    </div>
  `;
}

// ─── Étape 3 : Qui aura l'app ? ───────────────────────────────────────────────

function StepInvites({ profiles, selected, onToggle, total }) {
  const eligible = profiles.filter((p) => p.kind !== "pet");

  return html`
    <div className="onboarding-step">
      <div className="onb-step-header">
        <div className="onboarding-kicker">Étape 3 sur ${total}</div>
        <h1 className="onb-step-title">Qui aura l'app ?</h1>
        <p className="onboarding-subtitle">
          Un code d'invitation sera généré pour chaque personne sélectionnée.
        </p>
      </div>

      ${eligible.length === 0
        ? html`<div className="onb-invite-empty">Aucune personne éligible ajoutée.</div>`
        : html`
          <div className="onb-invite-list">
            ${eligible.map((p) => {
              const on  = selected.includes(p.id);
              const k   = p.kind || "person";
              return html`
                <button
                  key=${p.id}
                  type="button"
                  className=${`onb-invite-row${on ? " onb-invite-row-on" : ""}`}
                  onClick=${() => onToggle(p.id)}
                >
                  <div className="onb-member-avatar" style=${{ background: "oklch(60% 0.12 35)" }}>
                    ${p.firstName.slice(0, 1).toUpperCase()}
                    ${k === "child" ? html`<span className="onb-member-avatar-badge">🧒</span>` : null}
                  </div>
                  <div style=${{ flex: 1, minWidth: 0 }}>
                    <div className="onb-invite-name">
                      ${p.firstName}
                      ${k === "child" ? html`<span className="onb-invite-tag">Enfant</span>` : null}
                    </div>
                    ${on
                      ? html`<div className="onb-invite-code-row"><span className="onb-invite-code-label">Recevra un code</span></div>`
                      : html`<div className="onb-invite-none">Pas d'accès à l'app</div>`
                    }
                  </div>
                  <div className=${`onb-invite-check${on ? " onb-invite-check-on" : ""}`}>
                    ${on ? "✓" : ""}
                  </div>
                </button>
              `;
            })}
          </div>
          <div className="onb-invite-hint">
            ✉ Les codes seront affichés après la création du foyer.
          </div>
        `
      }
    </div>
  `;
}

// ─── Composant principal ───────────────────────────────────────────────────────

export function NewHouseholdWizard({
  onClose,
  onSubmit,
  busy = false,
  errorMessage = "",
  linkedPerson = null,
  userProfile = null,
}) {
  const [step, setStep]                   = useState(0);  // 0 = name, 1 = members, 2 = invites
  const [householdName, setHouseholdName] = useState("");
  const [profiles, setProfiles]           = useState([]);
  const [draft, setDraft]                 = useState({ firstName: "", kind: "person" });
  const [inviteSelected, setInviteSelected] = useState([]);
  const [localError, setLocalError]       = useState("");

  // L'étape "invitations" n'apparaît que si des membres ont été ajoutés
  const totalSteps = profiles.length > 0 ? 3 : 2;
  const isLastStep = step === totalSteps - 1;
  const canGoBack  = step > 0;

  const displayedError = localError || errorMessage;

  // ── Membres ────────────────────────────────────────────────────────────────

  function addProfile() {
    const firstName = String(draft.firstName || "").trim();
    if (!firstName) return;
    setProfiles((prev) => [
      ...prev,
      {
        id:          `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        firstName,
        profileType: KIND_TO_TYPE[draft.kind] || "adult",
        badgeColor:  "",
        hasAccount:  false,
        role:        "member",
        kind:        draft.kind,
      },
    ]);
    setDraft((prev) => ({ firstName: "", kind: prev.kind }));
  }

  function removeProfile(id) {
    setProfiles((prev) => prev.filter((p) => p.id !== id));
    setInviteSelected((prev) => prev.filter((pid) => pid !== id));
  }

  function toggleInvite(id) {
    setInviteSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  function goBack() {
    setLocalError("");
    setStep((s) => Math.max(0, s - 1));
  }

  async function goNext() {
    setLocalError("");

    // Étape 0 → 1 : valider le nom du foyer
    if (step === 0) {
      if (!householdName.trim()) {
        setLocalError("Donne un nom au foyer.");
        return;
      }
      setStep(1);
      return;
    }

    // Étape 1 → 2 ou soumission directe si pas de membres
    if (step === 1) {
      if (profiles.length > 0) {
        setStep(2);
      } else {
        await submit();
      }
      return;
    }

    // Étape 2 → soumission
    if (step === 2) {
      await submit();
    }
  }

  async function submit() {
    const selectedSet = new Set(inviteSelected);
    const markedProfiles = profiles.map((p) => ({
      ...p,
      hasAccount: selectedSet.has(p.id),
    }));
    try {
      await onSubmit({
        householdName: householdName.trim(),
        profile: {
          firstName:  linkedPerson?.displayName || userProfile?.displayName || "",
          badgeColor: linkedPerson?.color       || "#8B7355",
        },
        profiles:       markedProfiles,
        inviteSelected: [...inviteSelected],
      });
      // Le parent ferme le wizard après succès
    } catch (err) {
      setLocalError(err?.message || "Erreur lors de la création.");
    }
  }

  // ── Libellé du bouton "Suivant / Créer" ────────────────────────────────────

  function nextLabel() {
    if (step === 1 && profiles.length === 0) return "Créer le foyer";
    if (isLastStep) return "Créer le foyer";
    return "Suivant";
  }

  const canProceed = step === 0 ? Boolean(householdName.trim()) : true;

  // ── Rendu ──────────────────────────────────────────────────────────────────

  return html`
    <div
      className="modal-backdrop new-household-wizard-backdrop"
      onClick=${onClose}
      style=${{ zIndex: 1100 }}
    >
      <div
        className="onboarding-shell new-household-wizard-shell"
        onClick=${(e) => e.stopPropagation()}
        style=${{
          position: "relative",
          maxWidth: 480,
          width: "100%",
          margin: "auto",
          borderRadius: 24,
          minHeight: "auto",
          maxHeight: "90dvh",
          overflowY: "auto",
          padding: "24px 20px 20px",
        }}
      >
        <!-- Bouton fermer -->
        <button
          type="button"
          className="mrd-mclose"
          onClick=${onClose}
          style=${{ position: "absolute", top: 16, right: 16, zIndex: 10 }}
          aria-label="Fermer"
        >✕</button>

        <!-- Points de progression -->
        <${ProgressDots} total=${totalSteps} current=${step} />

        <!-- Étapes -->
        ${step === 0 ? html`
          <${StepHouseholdName}
            value=${householdName}
            onChange=${setHouseholdName}
            onNext=${goNext}
            total=${totalSteps}
          />
        ` : null}

        ${step === 1 ? html`
          <${StepMembers}
            profiles=${profiles}
            draft=${draft}
            onDraftChange=${(u) => setDraft((prev) => ({ ...prev, ...u }))}
            onAddProfile=${addProfile}
            onRemoveProfile=${removeProfile}
            total=${totalSteps}
          />
        ` : null}

        ${step === 2 ? html`
          <${StepInvites}
            profiles=${profiles}
            selected=${inviteSelected}
            onToggle=${toggleInvite}
            total=${totalSteps}
          />
        ` : null}

        <!-- Erreur -->
        ${displayedError ? html`
          <div className="error-box" style=${{ marginTop: 8 }}>${displayedError}</div>
        ` : null}

        <!-- Footer -->
        <${WizardFooter}
          canGoBack=${canGoBack}
          onBack=${goBack}
          onNext=${goNext}
          nextLabel=${nextLabel()}
          nextDisabled=${!canProceed}
          busy=${busy}
        />
      </div>
    </div>
  `;
}
