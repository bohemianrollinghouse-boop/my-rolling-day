import { html, useState } from "../../lib.js";
import { SettingsSwitch } from "./SettingsUI.js";

// ── Modal : édition d'un membre du foyer ──────────────────────────────────

export function EditMemberModal({
  person,
  role,
  hasPendingCode,
  canInvite,
  linkedAccount,
  onClose,
  onUpdateMemberRole,
  onUpdatePerson,
  onCreateInvitation,
  onInviteCreated,
  onDeletePerson,
}) {
  return html`
    <div className="modal-backdrop settings-modal-backdrop" onClick=${onClose}>
      <div className="modal-card task-modal foyer-modal" onClick=${(e) => e.stopPropagation()}>
        <div className="task-modal-head">
          <div className="foyer-modal-member-head">
            <div className="foyer-member-badge foyer-member-badge--lg"
              style=${{ background: person.color || "#8B7355" }}>
              ${(person.displayName || "?").slice(0, 2).toUpperCase()}
            </div>
            <div className="foyer-modal-member-info">
              <strong>${person.displayName || "Sans nom"}</strong>
              ${linkedAccount?.email ? html`
                <span className="foyer-modal-member-email">${linkedAccount.email}</span>
              ` : (person.linkedAccountId ? html`
                <span className="foyer-modal-member-email foyer-modal-member-email--unknown">Compte lié (email inconnu)</span>
              ` : null)}
            </div>
          </div>
          <button type="button" className="acn foyer-modal-close" onClick=${onClose}>✕</button>
        </div>
        <div className="foyer-modal-actions">
          ${person.type !== "animal" ? (role === "admin" ? html`
            <button type="button" className="abtn foyer-modal-action-btn"
              onClick=${async () => {
                if (person.linkedAccountId) await onUpdateMemberRole(person.linkedAccountId, "member");
                else await onUpdatePerson(person.id, { role: "member" });
                onClose();
              }}>
              Retirer le role admin
            </button>
          ` : html`
            <button type="button" className="abtn foyer-modal-action-btn"
              onClick=${async () => {
                if (person.linkedAccountId) await onUpdateMemberRole(person.linkedAccountId, "admin");
                else await onUpdatePerson(person.id, { role: "admin" });
                onClose();
              }}>
              Mettre en admin
            </button>
          `) : null}
          ${canInvite ? html`
            <button type="button" className="abtn foyer-modal-action-btn"
              onClick=${async () => {
                const result = await onCreateInvitation(person.id, "");
                onClose();
                if (result?.invitationCode && onInviteCreated) {
                  onInviteCreated({ memberName: person.displayName || "Ce membre", invitationCode: result.invitationCode });
                }
              }}>
              ${person.linkedAccountId ? "Recréer l'accès" : (hasPendingCode ? "Recreer un code" : "Creer un code")}
            </button>
          ` : null}
          <button type="button" className="ghost-btn settings-danger-btn foyer-modal-action-btn foyer-modal-delete-btn"
            onClick=${() => {
              if (window.confirm('Supprimer "' + (person.displayName || "ce membre") + '" ?')) {
                onDeletePerson(person.id);
                onClose();
              }
            }}>
            Supprimer le compte
          </button>
        </div>
      </div>
    </div>
  `;
}

// ── Modal : ajout d'un nouveau membre ────────────────────────────────────

export function AddPersonModal({ onClose, onAddPerson, onInviteCreated }) {
  const [noAccountType, setNoAccountType] = useState("person");
  const [role, setRole] = useState("standard");
  const [generateCode, setGenerateCode] = useState(true);
  const [firstName, setFirstName] = useState("");

  const canSubmit = firstName.trim().length > 0;

  async function handleSubmit() {
    const name = firstName.trim();
    if (!name) return;
    if ((noAccountType === "person" || noAccountType === "child") && generateCode) {
      const result = await onAddPerson({
        displayName: name,
        type: noAccountType === "child" ? "child" : "adult",
        profileMode: "app_user",
        role,
        canCompleteTasks: true,
        generateInvitation: true,
        active: true,
      });
      if (result?.invitationCode) {
        onInviteCreated({ memberName: result.memberName || name, invitationCode: result.invitationCode });
      }
    } else {
      const typeMap = { child: "child", animal: "animal", person: "adult" };
      await onAddPerson({
        displayName: name,
        type: typeMap[noAccountType] || "adult",
        profileMode: "context",
        role: "member",
        canCompleteTasks: noAccountType === "person",
        active: true,
      });
    }
    onClose();
  }

  return html`
    <div className="modal-backdrop settings-modal-backdrop" onClick=${onClose}>
      <div className="modal-card task-modal foyer-modal" onClick=${(e) => e.stopPropagation()}>
        <div className="task-modal-head">
          <strong>Ajouter un membre</strong>
          <button type="button" className="acn foyer-modal-close" onClick=${onClose}>✕</button>
        </div>

        <div className="foyer-modal-section-label">Type de membre</div>
        <div className="foyer-member-type-grid">
          ${[
            { id: "person", icon: "👤", label: "Personne", sub: "Peut rejoindre avec un code" },
            { id: "child", icon: "🧒", label: "Enfant", sub: "Peut rejoindre avec un code" },
            { id: "animal", icon: "🐾", label: "Animal", sub: "Profil du foyer" },
          ].map((type) => html`
            <button
              key=${type.id}
              type="button"
              className=${`foyer-member-type-card${noAccountType === type.id ? " on" : ""}`}
              onClick=${() => {
                setNoAccountType(type.id);
                if (type.id === "animal") setGenerateCode(false);
              }}
            >
              <span className="foyer-member-type-icon">${type.icon}</span>
              <span className="foyer-member-type-label">${type.label}</span>
              <span className="foyer-member-type-sub">${type.sub}</span>
            </button>
          `)}
        </div>

        ${noAccountType === "person" ? html`
          <div className="foyer-modal-section-label">Rôle</div>
          <div className="segmented foyer-modal-segmented foyer-modal-segmented--types">
            <button className=${`seg-btn ${role === "standard" ? "on" : ""}`}
              onClick=${() => setRole("standard")}>Standard</button>
            <button className=${`seg-btn ${role === "admin" ? "on" : ""}`}
              onClick=${() => setRole("admin")}>Admin</button>
          </div>
        ` : null}

        <div className=${`foyer-code-switch-row${noAccountType === "animal" ? " is-disabled" : ""}`}>
          <div>
            <div className="foyer-code-switch-title">Generer un code</div>
            <div className="foyer-code-switch-sub">
              ${noAccountType === "animal"
                ? "Les codes ne sont pas disponibles pour les profils Animal."
                : "Permet à ce membre de rejoindre le foyer avec son compte."}
            </div>
          </div>
          <${SettingsSwitch}
            value=${noAccountType !== "animal" && generateCode}
            onChange=${(value) => {
              if (noAccountType === "animal") return;
              setGenerateCode(value);
            }}
          />
        </div>

        <div className="foyer-modal-fields">
          <input
            className="ainp"
            placeholder="Prénom"
            value=${firstName}
            onInput=${(e) => setFirstName(e.target.value)}
          />
        </div>

        <div className="foyer-modal-footer">
          <button type="button" className="acn" onClick=${onClose}>Annuler</button>
          <button type="button" className="aok" onClick=${handleSubmit} disabled=${!canSubmit}>Valider</button>
        </div>
      </div>
    </div>
  `;
}

// ── Modal : code d'invitation généré ─────────────────────────────────────

export function NewMemberInviteModal({ invite, onClose }) {
  return html`
    <div className="modal-backdrop settings-modal-backdrop" onClick=${onClose}>
      <div className="modal-card task-modal foyer-modal foyer-modal-invite-confirm" onClick=${(e) => e.stopPropagation()}>
        <div className="task-modal-head">
          <strong>Invitation creee</strong>
          <button type="button" className="acn foyer-modal-close" onClick=${onClose}>X</button>
        </div>
        <div className="foyer-modal-invite-copy">
          <p className="foyer-modal-invite-title">
            ${invite.memberName} a bien ete ajoute, voici son code d invitation.
          </p>
          <div className="foyer-modal-invite-code">${invite.invitationCode.slice(0, 3)}-${invite.invitationCode.slice(3)}</div>
          <p className="foyer-modal-invite-help">
            Le code apparaitra dans vos reglages foyer.
          </p>
        </div>
        <div className="foyer-modal-footer">
          <button type="button" className="aok" onClick=${onClose}>Fermer</button>
        </div>
      </div>
    </div>
  `;
}
