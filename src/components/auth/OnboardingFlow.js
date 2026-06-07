import { html, useMemo, useRef, useState } from "../../lib.js"; // v2026-05-06-cocon-1

const BADGE_PALETTE = [
  ["#7F1D1D", "#B91C1C", "#DC2626", "#F87171", "#FECACA"],
  ["#7C2D12", "#C2410C", "#EA580C", "#FB923C", "#FED7AA"],
  ["#713F12", "#B45309", "#D97706", "#FCD34D", "#FEF3C7"],
  ["#14532D", "#166534", "#16A34A", "#4ADE80", "#BBF7D0"],
  ["#164E63", "#0E7490", "#06B6D4", "#67E8F9", "#CFFAFE"],
  ["#1E3A5F", "#1D4ED8", "#3B82F6", "#93C5FD", "#DBEAFE"],
  ["#3B0764", "#6D28D9", "#7C3AED", "#A78BFA", "#EDE9FE"],
  ["#881337", "#BE123C", "#E11D48", "#FB7185", "#FECDD3"],
];

const DEFAULT_COLOR = BADGE_PALETTE[0][2];
const CREATE_STEPS = ["create-first-name", "create-badge-color", "create-household-name", "create-add-members", "create-invite-members"];
const JOIN_STEPS = ["join-invitation-code", "join-confirm-household", "join-profile-name", "join-badge-color", "join-done"];
const EXISTING_PROFILE_STEPS = ["existing-profile-name", "existing-badge-color", "existing-done"];

const KIND_OPTIONS = [
  { id: "person", emoji: "👤", label: "Personne" },
  { id: "child", emoji: "🧒", label: "Enfant" },
  { id: "pet", emoji: "🐾", label: "Animal" },
];

const HOUSEHOLD_SHARES = [
  ["🍽", "Repas de la semaine"],
  ["🛒", "Listes de courses"],
  ["✓", "Tâches du foyer"],
  ["📅", "Calendrier partagé"],
];

function getFlowSteps(mode) {
  if (mode === "create") return CREATE_STEPS;
  if (mode === "join") return JOIN_STEPS;
  if (mode === "existing-profile") return EXISTING_PROFILE_STEPS;
  return [];
}

function kindLabel(kind) {
  if (kind === "child") return "Enfant";
  if (kind === "pet") return "Animal";
  return "Personne";
}

function kindEmoji(kind) {
  if (kind === "child") return "🧒";
  if (kind === "pet") return "🐾";
  return "👤";
}

function onboardingInitialState({ currentFamily, linkedPerson, draftDisplayName, user }) {
  const firstName = String(draftDisplayName || linkedPerson?.displayName || user?.displayName || "").trim();
  const badgeColor = linkedPerson?.color || DEFAULT_COLOR;
  const hasExistingHousehold = Boolean(currentFamily?.id);
  return {
    mode: hasExistingHousehold ? "existing-profile" : null,
    history: [hasExistingHousehold ? "existing-profile-name" : "choose-household-mode"],
    direction: "forward",
    create: { firstName, badgeColor, householdName: "", profiles: [], inviteSelected: [] },
    join: { invitationCode: "", preview: null, firstName, badgeColor },
    existingProfile: { firstName, badgeColor },
  };
}

// ── Swipe-back card ──────────────────────────────────────────────────────────

function OnboardingCard({ direction, onSwipeBack, children }) {
  const startX = useRef(0);
  const startY = useRef(0);

  function onTouchStart(e) {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
  }
  function onTouchEnd(e) {
    const dx = e.changedTouches[0].clientX - startX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - startY.current);
    if (dx > 60 && dy < 80) onSwipeBack?.();
  }

  return html`
    <div
      className=${`onboarding-card onboarding-card-${direction}`}
      onTouchStart=${onTouchStart}
      onTouchEnd=${onTouchEnd}
    >${children}</div>
  `;
}

// ── Progress dots ────────────────────────────────────────────────────────────

function OnboardingProgress({ steps, currentStep }) {
  const currentIndex = steps.indexOf(currentStep);
  return html`
    <div className="onb-step-dots">
      ${steps.map((step, i) => html`
        <span
          key=${step}
          className=${`onb-dot ${i === currentIndex ? "onb-dot-active" : i < currentIndex ? "onb-dot-done" : "onb-dot-pending"}`}
        ></span>
      `)}
    </div>
  `;
}

// ── Flat colour grid ─────────────────────────────────────────────────────────

function OnboardingColorGrid({ value, onChange }) {
  return html`
    <div className="onb-color-grid">
      ${BADGE_PALETTE.flat().map((hex) => html`
        <button
          key=${hex}
          type="button"
          className=${`onb-color-swatch${value === hex ? " onb-color-swatch-active" : ""}`}
          style=${{ background: hex }}
          onClick=${() => onChange(hex)}
          aria-label=${hex}
        ></button>
      `)}
    </div>
  `;
}

// ── Footer: ← back  |  next → ───────────────────────────────────────────────

function OnboardingFooter({ canGoBack, onBack, nextLabel, onNext, nextDisabled, busy }) {
  return html`
    <div className="onb-step-footer">
      <button
        type="button"
        className="onb-footer-back"
        onClick=${onBack}
        disabled=${!canGoBack}
      >←</button>
      <button
        type="button"
        className="onb-footer-next"
        onClick=${onNext}
        disabled=${nextDisabled || busy}
      >${busy ? "..." : nextLabel}</button>
    </div>
  `;
}

// ── 6-box code input ─────────────────────────────────────────────────────────

function CodeBoxesInput({ value, onChange, hasError }) {
  const refs = useRef([]);
  const chars = (value + "      ").slice(0, 6).split("");

  function setChar(i, c) {
    c = (c || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 1);
    if (!c && !value[i]) return;
    const arr = (value + "      ").slice(0, 6).split("");
    arr[i] = c || " ";
    const next = arr.join("").trimEnd().slice(0, 6);
    onChange(next);
    if (c && i < 5) refs.current[i + 1]?.focus();
  }

  function onKey(i, e) {
    if (e.key === "Backspace" && !value[i] && i > 0) {
      const arr = (value + "      ").slice(0, 6).split("");
      arr[i - 1] = " ";
      onChange(arr.join("").trimEnd().slice(0, 6));
      refs.current[i - 1]?.focus();
    }
  }

  function onPaste(e) {
    e.preventDefault();
    const txt = (e.clipboardData.getData("text") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    onChange(txt);
    setTimeout(() => refs.current[Math.min(txt.length, 5)]?.focus(), 0);
  }

  return html`
    <div className="onb-code-boxes">
      ${[0, 1, 2].map((i) => html`
        <input
          key=${i}
          ref=${(el) => (refs.current[i] = el)}
          className=${`onb-code-box${hasError ? " onb-code-box-error" : ""}`}
          value=${chars[i].trim()}
          maxLength=${1}
          autoFocus=${i === 0}
          onInput=${(e) => setChar(i, e.target.value)}
          onKeyDown=${(e) => onKey(i, e)}
          onPaste=${onPaste}
        />
      `)}
      <span className="onb-code-dash">-</span>
      ${[3, 4, 5].map((i) => html`
        <input
          key=${i}
          ref=${(el) => (refs.current[i] = el)}
          className=${`onb-code-box${hasError ? " onb-code-box-error" : ""}`}
          value=${chars[i].trim()}
          maxLength=${1}
          onInput=${(e) => setChar(i, e.target.value)}
          onKeyDown=${(e) => onKey(i, e)}
          onPaste=${onPaste}
        />
      `)}
    </div>
  `;
}

// ── Add members step ─────────────────────────────────────────────────────────

function AddMembersStep({ profiles, draft, onDraftChange, onAddProfile, onRemoveProfile, totalSteps = 5 }) {
  return html`
    <div className="onboarding-step">
      <div className="onb-step-header">
        <div className="onb-step-kicker">Étape 4 sur ${totalSteps}</div>
        <h1 className="onb-step-title">Ajoute ton foyer</h1>
        <p className="onb-step-subtitle">Personnes, enfants, animaux — tout le monde a sa place.</p>
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
        ${profiles.length === 0 ? html`
          <div className="onboarding-empty-state">Aucun autre membre ajouté pour le moment.</div>
        ` : profiles.map((p) => {
          const k = p.kind || (p.profileType === "child" ? "child" : p.profileType === "pet" ? "pet" : "person");
          return html`
            <div key=${p.id} className="onb-member-row">
              <div className="onb-member-avatar" style=${{ background: p.badgeColor || "oklch(60% 0.12 35)" }}>
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
        })}
      </div>
    </div>
  `;
}

// ── Invite members step ──────────────────────────────────────────────────────

function InviteMembersStep({ profiles, selected, onToggle }) {
  const eligible = profiles.filter((p) => p.kind !== "pet");

  return html`
    <div className="onboarding-step">
      <div className="onb-step-header">
        <div className="onb-step-kicker">Étape 5 sur 5</div>
        <h1 className="onb-step-title">Qui aura l'app ?</h1>
        <p className="onb-step-subtitle">Choisis les personnes qui utiliseront My Rolling Day. Un code leur sera attribué à la création du foyer.</p>
      </div>

      ${eligible.length === 0 ? html`
        <div className="onb-invite-empty">
          Aucune personne ou enfant dans ton foyer pour le moment.<br/>
          Tu pourras inviter quelqu'un plus tard depuis les réglages.
        </div>
      ` : html`
        <div className="onb-invite-list">
          ${eligible.map((p) => {
            const on = selected.includes(p.id);
            const k = p.kind || "person";
            const color = p.badgeColor || "oklch(60% 0.12 35)";
            return html`
              <button
                key=${p.id}
                type="button"
                className=${`onb-invite-row${on ? " onb-invite-row-on" : ""}`}
                onClick=${() => onToggle(p.id)}
              >
                <div className="onb-member-avatar" style=${{ background: color }}>
                  ${p.firstName.slice(0, 1).toUpperCase()}
                  ${k === "child" ? html`<span className="onb-member-avatar-badge">🧒</span>` : null}
                </div>
                <div style=${{ flex: 1, minWidth: 0 }}>
                  <div className="onb-invite-name">
                    ${p.firstName}
                    ${k === "child" ? html`<span className="onb-invite-tag">Enfant</span>` : null}
                  </div>
                  ${on ? html`
                    <div className="onb-invite-code-row">
                      <span className="onb-invite-code-label">Recevra un code</span>
                    </div>
                  ` : html`
                    <div className="onb-invite-none">Pas d'accès à l'app</div>
                  `}
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
      `}
    </div>
  `;
}

// ── Choose mode step ─────────────────────────────────────────────────────────

function ChooseHouseholdModeStep({ onSelectCreate, onSelectJoin, onChangeAccount }) {
  return html`
    <div className="onboarding-step">
      <div className="onboarding-header">
        <h1 className="onboarding-title">Créer ou rejoindre un foyer</h1>
        <p className="onboarding-subtitle">Un foyer est l'espace partagé par les membres, les tâches, les repas et les courses.</p>
      </div>
      <div className="onboarding-choice-grid">
        <button type="button" className="onboarding-choice-card" onClick=${onSelectCreate}>
          <div className="onboarding-choice-emoji">🏠</div>
          <div className="onboarding-choice-title">Créer un foyer</div>
          <div className="onboarding-choice-text">Démarre un nouveau foyer et invite tes proches.</div>
        </button>
        <button type="button" className="onboarding-choice-card" onClick=${onSelectJoin}>
          <div className="onboarding-choice-emoji">🔗</div>
          <div className="onboarding-choice-title">Rejoindre un foyer</div>
          <div className="onboarding-choice-text">Tu as un code d'invitation, rejoins le foyer.</div>
        </button>
      </div>
      <div className="onboarding-choice-footer">
        <button type="button" className="onboarding-account-switch-button" onClick=${onChangeAccount}>
          Se déconnecter ou changer de compte
        </button>
      </div>
    </div>
  `;
}

// ── Reusable avatar preview ──────────────────────────────────────────────────

function AvatarPreview({ initial, name, color }) {
  const style = color
    ? { background: color, boxShadow: `0 10px 30px ${color}55` }
    : {};
  return html`
    <div className="onb-avatar-wrap">
      <div className="onb-avatar-preview" style=${style}>${initial}</div>
      ${name ? html`<div className="onb-avatar-name">${name}</div>` : null}
    </div>
  `;
}

// ── Main onboarding component ─────────────────────────────────────────────────

export function OnboardingFlow({
  user,
  currentFamily,
  linkedPerson,
  draftDisplayName = "",
  busy = false,
  errorMessage = "",
  accountMessage = "",
  onPreviewInvitationCode,
  onCreateHousehold,
  onJoinHousehold,
  onCompleteExistingProfile,
  onChangeAccount,
}) {
  const [state, setState] = useState(() =>
    onboardingInitialState({ currentFamily, linkedPerson, draftDisplayName, user }),
  );
  const [memberDraft, setMemberDraft] = useState({ firstName: "", kind: "person" });
  const [localError, setLocalError] = useState("");
  const [codeError, setCodeError] = useState(false);

  const currentStep = state.history[state.history.length - 1];
  const progressSteps = useMemo(() => {
    if (state.mode === "create") {
      return state.create.profiles.length > 0 ? CREATE_STEPS : CREATE_STEPS.slice(0, -1);
    }
    return getFlowSteps(state.mode);
  }, [state.mode, state.create.profiles.length]);
  const hasWizard = Boolean(progressSteps.length);
  const canGoBack = state.history.length > 1;
  const effectiveError = localError || errorMessage;

  function updateCreate(u) { setState((s) => ({ ...s, create: { ...s.create, ...u } })); }
  function updateJoin(u) { setState((s) => ({ ...s, join: { ...s.join, ...u } })); }
  function updateExistingProfile(u) { setState((s) => ({ ...s, existingProfile: { ...s.existingProfile, ...u } })); }

  function pushStep(step, nextMode = state.mode) {
    setLocalError("");
    setState((s) => ({ ...s, mode: nextMode, direction: "forward", history: [...s.history, step] }));
  }

  function goBack() {
    if (!canGoBack) return;
    setLocalError("");
    setCodeError(false);
    setState((s) => {
      const nextHistory = s.history.slice(0, -1);
      return {
        ...s, direction: "backward", history: nextHistory,
        mode: nextHistory[nextHistory.length - 1] === "choose-household-mode" ? null : s.mode,
      };
    });
  }

  function handleAddProfile() {
    const firstName = String(memberDraft.firstName || "").trim();
    if (!firstName) return;
    const kindToProfileType = { person: "adult", child: "child", pet: "pet" };
    updateCreate({
      profiles: [
        ...state.create.profiles,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          firstName,
          profileType: kindToProfileType[memberDraft.kind] || "adult",
          badgeColor: "",
          hasAccount: false,
          role: "member",
          kind: memberDraft.kind,
        },
      ],
    });
    setMemberDraft((prev) => ({ firstName: "", kind: prev.kind }));
  }

  function handleRemoveProfile(id) {
    updateCreate({ profiles: state.create.profiles.filter((p) => p.id !== id) });
  }

  function nextLabel() {
    if (currentStep === "create-add-members" && state.create.profiles.length === 0) return "Terminer";
    if (currentStep === "create-invite-members") return "Terminer";
    if (currentStep === "join-done") return "Rejoindre le foyer";
    if (currentStep === "existing-done") return "Terminer";
    return "Suivant";
  }

  function isCurrentStepValid() {
    if (currentStep === "create-first-name") return Boolean(state.create.firstName.trim());
    if (currentStep === "create-badge-color") return Boolean(state.create.badgeColor);
    if (currentStep === "create-household-name") return Boolean(state.create.householdName.trim());
    if (currentStep === "create-add-members") return true;
    if (currentStep === "create-invite-members") return true;
    if (currentStep === "join-invitation-code") return state.join.invitationCode.trim().length === 6;
    if (currentStep === "join-confirm-household") return Boolean(state.join.preview?.householdName);
    if (currentStep === "join-profile-name") return Boolean(state.join.firstName.trim());
    if (currentStep === "join-badge-color" || currentStep === "join-done") return true;
    if (currentStep === "existing-profile-name") return Boolean(state.existingProfile.firstName.trim());
    if (currentStep === "existing-badge-color" || currentStep === "existing-done") return true;
    return false;
  }

  async function handleNext() {
    setLocalError("");
    if (currentStep === "create-first-name") { pushStep("create-badge-color"); return; }
    if (currentStep === "create-badge-color") { pushStep("create-household-name"); return; }
    if (currentStep === "create-household-name") { pushStep("create-add-members"); return; }
    if (currentStep === "create-add-members") {
      if (state.create.profiles.length === 0) {
        await onCreateHousehold({
          householdName: state.create.householdName,
          profile: { firstName: state.create.firstName, badgeColor: state.create.badgeColor },
          profiles: [],
          inviteSelected: [],
        });
        return;
      }
      pushStep("create-invite-members");
      return;
    }
    if (currentStep === "create-invite-members") {
      const selectedSet = new Set(state.create.inviteSelected);
      const markedProfiles = state.create.profiles.map((p) => ({
        ...p,
        hasAccount: selectedSet.has(p.id),
      }));
      await onCreateHousehold({
        householdName: state.create.householdName,
        profile: { firstName: state.create.firstName, badgeColor: state.create.badgeColor },
        profiles: markedProfiles,
        inviteSelected: state.create.inviteSelected,
      });
      return;
    }

    if (currentStep === "join-invitation-code") {
      setCodeError(false);
      try {
        const preview = await onPreviewInvitationCode(state.join.invitationCode);
        if (!preview?.householdName) { setCodeError(true); return; }
        updateJoin({ preview, firstName: preview.memberName || state.join.firstName });
        pushStep("join-confirm-household");
      } catch { setCodeError(true); }
      return;
    }
    if (currentStep === "join-confirm-household") { pushStep("join-profile-name"); return; }
    if (currentStep === "join-profile-name") { pushStep("join-badge-color"); return; }
    if (currentStep === "join-badge-color") { pushStep("join-done"); return; }
    if (currentStep === "join-done") {
      await onJoinHousehold({
        invitationCode: state.join.invitationCode,
        profile: { firstName: state.join.firstName, badgeColor: state.join.badgeColor },
      });
      return;
    }

    if (currentStep === "existing-profile-name") { pushStep("existing-badge-color", "existing-profile"); return; }
    if (currentStep === "existing-badge-color") { pushStep("existing-done", "existing-profile"); return; }
    if (currentStep === "existing-done") {
      await onCompleteExistingProfile({
        profile: { displayName: state.existingProfile.firstName, color: state.existingProfile.badgeColor },
        members: [],
      });
    }
  }

  // Household name suggestions — built outside render to avoid recreating on each render
  const householdSuggestions = ["Chez nous", `Famille ${(state.create.firstName || "").split(" ")[0] || "Martin"}`, "La maison", "Notre nid"];

  const joinHouseholdInitial = (state.join.preview?.householdName || "F").trim()[0].toUpperCase();

  return html`
    <div className="onboarding-shell">
      <div className="onboarding-page-brand">
        <img src="./src/assets/brand/mark.svg" width="52" height="52" alt="My Rolling Day" />
        <span>My Rolling Day</span>
      </div>

      <${OnboardingCard} direction=${state.direction} onSwipeBack=${goBack}>

        ${currentStep === "choose-household-mode" ? html`
          <${ChooseHouseholdModeStep}
            onSelectCreate=${() => pushStep("create-first-name", "create")}
            onSelectJoin=${() => pushStep("join-invitation-code", "join")}
            onChangeAccount=${onChangeAccount}
          />
        ` : null}

        <!-- CREATE: prénom -->
        ${currentStep === "create-first-name" ? html`
          <div className="onboarding-step">
            <div className="onb-step-header">
              <div className="onb-step-kicker">Étape 1 sur 4</div>
              <h1 className="onb-step-title">Comment t'appelles-tu ?</h1>
              <p className="onb-step-subtitle">Ton prénom apparaîtra dans ton foyer — tes proches te reconnaîtront.</p>
            </div>

            <${AvatarPreview}
              initial=${(state.create.firstName || "?").slice(0, 1).toUpperCase()}
              name=${state.create.firstName.trim() || null}
            />

            <div className="onboarding-field">
              <label className="onboarding-field-label">Prénom</label>
              <input
                className="onboarding-input"
                value=${state.create.firstName}
                placeholder="Ton prénom"
                autoFocus
                onInput=${(e) => updateCreate({ firstName: e.target.value })}
              />
            </div>

            <div className="onb-hint-card">
              <div className="onb-hint-check">✓</div>
              <p className="onb-hint-text">
                <strong>Pas besoin du nom complet.</strong> Un surnom marche aussi — tu pourras toujours le modifier plus tard.
              </p>
            </div>
          </div>
        ` : null}

        <!-- CREATE: couleur -->
        ${currentStep === "create-badge-color" ? html`
          <div className="onboarding-step">
            <div className="onb-step-header">
              <div className="onb-step-kicker">Étape 2 sur 4</div>
              <h1 className="onb-step-title">Choisis ta couleur</h1>
              <p className="onb-step-subtitle">Elle servira à te reconnaître dans le foyer.</p>
            </div>

            <${AvatarPreview}
              initial=${(state.create.firstName || "?").slice(0, 1).toUpperCase()}
              color=${state.create.badgeColor}
            />

            <${OnboardingColorGrid}
              value=${state.create.badgeColor}
              onChange=${(c) => updateCreate({ badgeColor: c })}
            />
          </div>
        ` : null}

        <!-- CREATE: nom du foyer -->
        ${currentStep === "create-household-name" ? html`
          <div className="onboarding-step">
            <div className="onb-step-header">
              <div className="onb-step-kicker">Étape 3 sur 4</div>
              <h1 className="onb-step-title">Nom du foyer</h1>
              <p className="onb-step-subtitle">Donne un petit nom à ton espace partagé.</p>
            </div>

            <div className="onboarding-field">
              <label className="onboarding-field-label">Nom du foyer</label>
              <input
                className="onboarding-input"
                value=${state.create.householdName}
                placeholder="Chez nous, Famille Martin…"
                autoFocus
                onInput=${(e) => updateCreate({ householdName: e.target.value })}
              />
            </div>

            <div className="onb-suggestion-chips">
              ${householdSuggestions.map((s) => html`
                <button
                  key=${s}
                  type="button"
                  className=${`onb-suggestion-chip${state.create.householdName === s ? " onb-suggestion-chip-active" : ""}`}
                  onClick=${() => updateCreate({ householdName: s })}
                >${s}</button>
              `)}
            </div>
          </div>
        ` : null}

        <!-- CREATE: ajout membres -->
        ${currentStep === "create-add-members" ? html`
          <${AddMembersStep}
            profiles=${state.create.profiles}
            draft=${memberDraft}
            onDraftChange=${(u) => setMemberDraft((prev) => ({ ...prev, ...u }))}
            onAddProfile=${handleAddProfile}
            onRemoveProfile=${handleRemoveProfile}
            totalSteps=${state.create.profiles.length > 0 ? 5 : 4}
          />
        ` : null}

        <!-- CREATE: invitations -->
        ${currentStep === "create-invite-members" ? html`
          <${InviteMembersStep}
            profiles=${state.create.profiles}
            selected=${state.create.inviteSelected}
            onToggle=${(id) => {
              const sel = state.create.inviteSelected;
              updateCreate({ inviteSelected: sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id] });
            }}
          />
        ` : null}

        <!-- JOIN: code d'invitation -->
        ${currentStep === "join-invitation-code" ? html`
          <div className="onboarding-step">
            <div className="onb-join-code-header">
              <div className="onb-join-code-icon">🔗</div>
              <h1 className="onb-step-title" style=${{ textAlign: "center" }}>Rejoindre un foyer</h1>
              <p className="onb-step-subtitle" style=${{ textAlign: "center" }}>
                Saisis le code d'invitation que la personne qui t'a invité·e t'a envoyé.
              </p>
            </div>

            <${CodeBoxesInput}
              value=${state.join.invitationCode}
              onChange=${(v) => { updateJoin({ invitationCode: v }); setCodeError(false); }}
              hasError=${codeError}
            />

            ${codeError ? html`
              <div className="onb-code-error">
                Code introuvable — vérifie avec la personne qui t'a invité·e.
              </div>
            ` : null}

            <button
              type="button"
              className="onb-code-paste-btn"
              onClick=${() => navigator.clipboard?.readText?.().then((t) => {
                const cleaned = (t || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
                if (cleaned) { updateJoin({ invitationCode: cleaned }); setCodeError(false); }
              })}
            >📋 Coller depuis le presse-papiers</button>

            <div className="onb-code-help">
              Pas reçu de code ?<br/>Demande à la personne qui t'a invité·e de te le renvoyer.
            </div>
          </div>
        ` : null}

        <!-- JOIN: aperçu du foyer -->
        ${currentStep === "join-confirm-household" ? html`
          <div className="onboarding-step">
            <div className="onb-invitation-header">
              <div className="onb-invitation-kicker">Invitation reçue</div>
              <h1 className="onb-step-title" style=${{ textAlign: "center" }}>Tu es invité·e !</h1>
            </div>

            <div className="onb-join-preview-card">
              <div className="onb-join-preview-bg"></div>
              <div className="onb-join-preview-content">
                <div className="onb-join-household-icon">${joinHouseholdInitial}</div>
                <div className="onb-join-household-name">${state.join.preview?.householdName}</div>
                <div className="onb-join-household-sub">
                  ${state.join.preview?.memberName
                    ? `Profil réservé pour ${state.join.preview.memberName}.`
                    : "Tu as été invité·e à rejoindre ce foyer."}
                </div>
              </div>
            </div>

            <div className="onb-join-shares">
              <div className="onb-join-shares-title">Ce que vous partagerez</div>
              ${HOUSEHOLD_SHARES.map(([emoji, text]) => html`
                <div key=${text} className="onb-join-shares-item">
                  <span className="onb-join-shares-emoji">${emoji}</span>
                  <span>${text}</span>
                </div>
              `)}
            </div>
          </div>
        ` : null}

        <!-- JOIN: prénom -->
        ${currentStep === "join-profile-name" ? html`
          <div className="onboarding-step">
            <div className="onb-step-header">
              <div className="onb-step-kicker">Étape 3 sur 5</div>
              <h1 className="onb-step-title">Confirme ton prénom</h1>
              <p className="onb-step-subtitle">Tu peux garder le prénom détecté ou le modifier avant d'entrer.</p>
            </div>

            <${AvatarPreview}
              initial=${(state.join.firstName || "?").slice(0, 1).toUpperCase()}
              name=${state.join.firstName.trim() || null}
              color=${state.join.badgeColor}
            />

            <div className="onboarding-field">
              <label className="onboarding-field-label">Prénom</label>
              <input
                className="onboarding-input"
                value=${state.join.firstName}
                placeholder="Ton prénom"
                autoFocus
                onInput=${(e) => updateJoin({ firstName: e.target.value })}
              />
            </div>
          </div>
        ` : null}

        <!-- JOIN: couleur -->
        ${currentStep === "join-badge-color" ? html`
          <div className="onboarding-step">
            <div className="onb-step-header">
              <div className="onb-step-kicker">Étape 4 sur 5</div>
              <h1 className="onb-step-title">Choisis ta couleur</h1>
              <p className="onb-step-subtitle">Choisis la couleur qui représentera ton profil dans le foyer.</p>
            </div>

            <${AvatarPreview}
              initial=${(state.join.firstName || "?").slice(0, 1).toUpperCase()}
              color=${state.join.badgeColor}
            />

            <${OnboardingColorGrid}
              value=${state.join.badgeColor}
              onChange=${(c) => updateJoin({ badgeColor: c })}
            />
          </div>
        ` : null}

        <!-- JOIN: résumé / bienvenue -->
        ${currentStep === "join-done" ? html`
          <div className="onboarding-step">
            <div className="onb-join-celebration">
              <div className="onb-join-celebration-icon">🎉</div>
              <h1 className="onb-join-celebration-title">
                Bienvenue chez <em className="onb-join-celebration-em">${state.join.preview?.householdName || "votre foyer"}</em> !
              </h1>
              <p className="onb-join-celebration-sub">
                Tout est prêt. Clique sur le bouton ci-dessous pour entrer dans le foyer.
              </p>
            </div>

            <div className="onb-join-members-card">
              <div className="onb-join-you-row">
                <div
                  className="onb-join-avatar"
                  style=${{ background: state.join.badgeColor }}
                >${(state.join.firstName || "?")[0]?.toUpperCase()}</div>
                <div style=${{ flex: 1 }}>
                  <div className="onb-join-you-name">
                    ${state.join.firstName}
                    <span className="onb-join-you-tag">(toi)</span>
                  </div>
                  <div className="onb-join-you-sub">Vient de rejoindre</div>
                </div>
              </div>
              <div className="onb-join-household-label">${state.join.preview?.householdName || "Foyer"}</div>
            </div>
          </div>
        ` : null}

        <!-- EXISTING: prénom -->
        ${currentStep === "existing-profile-name" ? html`
          <div className="onboarding-step">
            <div className="onb-step-header">
              <div className="onb-step-kicker">Profil</div>
              <h1 className="onb-step-title">Ton prénom</h1>
              <p className="onb-step-subtitle">Ton compte est connecté à un foyer. Il ne manque plus que ton profil visible dans l'application.</p>
            </div>

            <${AvatarPreview}
              initial=${(state.existingProfile.firstName || "?").slice(0, 1).toUpperCase()}
              name=${state.existingProfile.firstName.trim() || null}
            />

            <div className="onboarding-field">
              <label className="onboarding-field-label">Prénom</label>
              <input
                className="onboarding-input"
                value=${state.existingProfile.firstName}
                placeholder="Ton prénom"
                autoFocus
                onInput=${(e) => updateExistingProfile({ firstName: e.target.value })}
              />
            </div>
          </div>
        ` : null}

        <!-- EXISTING: couleur -->
        ${currentStep === "existing-badge-color" ? html`
          <div className="onboarding-step">
            <div className="onb-step-header">
              <div className="onb-step-kicker">Profil</div>
              <h1 className="onb-step-title">Couleur du badge</h1>
              <p className="onb-step-subtitle">Choisis la couleur de ton profil dans ce foyer.</p>
            </div>

            <${AvatarPreview}
              initial=${(state.existingProfile.firstName || "?").slice(0, 1).toUpperCase()}
              color=${state.existingProfile.badgeColor}
            />

            <${OnboardingColorGrid}
              value=${state.existingProfile.badgeColor}
              onChange=${(c) => updateExistingProfile({ badgeColor: c })}
            />
          </div>
        ` : null}

        <!-- EXISTING: résumé -->
        ${currentStep === "existing-done" ? html`
          <div className="onboarding-step">
            <div className="onb-join-celebration">
              <div className="onb-join-celebration-icon">✨</div>
              <h1 className="onb-join-celebration-title">Prêt à continuer !</h1>
              <p className="onb-join-celebration-sub">Profil configuré. On finalise puis tu entres dans le foyer.</p>
            </div>
            <div className="onboarding-summary-card">
              <div className="onboarding-summary-row">
                <span className="onboarding-summary-label">Foyer</span>
                <strong>${currentFamily?.name || "Foyer actif"}</strong>
              </div>
              <div className="onboarding-summary-row">
                <span className="onboarding-summary-label">Profil</span>
                <strong>${state.existingProfile.firstName || "Sans prénom"}</strong>
              </div>
            </div>
          </div>
        ` : null}

        ${accountMessage ? html`<div className="onboarding-inline-message">${accountMessage}</div>` : null}
        ${effectiveError ? html`<div className="error-box">${effectiveError}</div>` : null}

        ${hasWizard ? html`
          <div className="onboarding-actions">
            <${OnboardingProgress} steps=${progressSteps} currentStep=${currentStep} />
            <${OnboardingFooter}
              canGoBack=${canGoBack}
              onBack=${goBack}
              nextLabel=${nextLabel()}
              onNext=${handleNext}
              nextDisabled=${!isCurrentStepValid()}
              busy=${busy}
            />
          </div>
        ` : null}

      <//>
    </div>
  `;
}
