import { html, useState } from "../../lib.js";

// ── Fiche profil (éditable ou lecture seule) ──────────────────────────────

export function ProfileModal({ profile, canEdit, draft, onDraftChange, onClose, onSave }) {
  return html`
    <div className="modal-backdrop" onClick=${onClose}>
      <div className="modal-card profile-card" onClick=${(event) => event.stopPropagation()}>
        <div className="task-modal-head">
          <div>
            <div className="miniTitle">${canEdit ? "Mon profil" : "Profil public"}</div>
            <div className="st">${profile.label}</div>
          </div>
          <button className="delbtn" onClick=${onClose}>X</button>
        </div>
        <div className="profile-hero">
          <div className="profile-avatar" style=${{ background: (canEdit ? draft.color : profile.color) || "#8B7355" }}>
            ${(canEdit ? draft.mood : profile.mood) || profile.shortId}
          </div>
          <div className="profile-meta">
            <div className="profile-name">${canEdit ? draft.displayName || profile.label : profile.label}</div>
            ${profile.email ? html`<div className="mini">${profile.email}</div>` : null}
            <div className="profile-message">
              ${canEdit ? draft.message || "Ajoute un petit mot visible par le foyer." : profile.message || "Aucun message public pour le moment."}
            </div>
          </div>
        </div>
        ${canEdit
          ? html`
              <div className="settings-actions">
                <div className="miniTitle">Nom visible</div>
                <input className="ainp" value=${draft.displayName} onInput=${(event) => onDraftChange({ ...draft, displayName: event.target.value })} />
              </div>
              <div className="settings-actions">
                <div className="miniTitle">Couleur personnelle</div>
                <input className="ainp profile-color-input" type="color" value=${draft.color || "#8B7355"} onInput=${(event) => onDraftChange({ ...draft, color: event.target.value })} />
              </div>
              <div className="settings-actions">
                <div className="miniTitle">Humeur</div>
                <div className="task-choice-row">
                  ${["😊", "😴", "😡", "🤍", "🌿", "✨"].map(
                    (mood) => html`<button type="button" className=${`task-choice ${draft.mood === mood ? "on" : ""}`} onClick=${() => onDraftChange({ ...draft, mood })}>${mood}</button>`,
                  )}
                </div>
              </div>
              <div className="settings-actions">
                <div className="miniTitle">Petit message public</div>
                <textarea className="nta profile-message-input" rows="3" maxlength="160" value=${draft.message} onInput=${(event) => onDraftChange({ ...draft, message: event.target.value })}></textarea>
              </div>
              <div className="task-modal-actions">
                <button className="acn" onClick=${onClose}>Fermer</button>
                <button className="aok" onClick=${onSave}>Enregistrer</button>
              </div>
            `
          : html`
              <div className="settings-actions">
                <div className="miniTitle">Humeur</div>
                <div className="profile-public-line">${profile.mood || "Aucune humeur partagee pour le moment."}</div>
              </div>
            `}
      </div>
    </div>
  `;
}

// ── Demande d'activation des notifications (post-onboarding) ──────────────

export function NotifPromptModal({ onActivate, onLater, dismissCount = 0 }) {
  const isReprompt = dismissCount > 0;
  const title = isReprompt ? "Toujours pas de notifications ?" : "Activer les notifications ?";
  const body = isReprompt
    ? "Tu peux activer les rappels à tout moment depuis les Réglages. Veux-tu les activer maintenant ?"
    : "My Rolling Day peut t'envoyer des rappels pour les tâches, l'agenda et les autres moments importants, même quand l'application est fermée.";

  return html`
    <div className="notif-prompt-overlay">
      <div className="notif-prompt-card">
        <div className="notif-prompt-icon">🔔</div>
        <h2 className="notif-prompt-title">${title}</h2>
        <p className="notif-prompt-body">${body}</p>
        <button type="button" className="notif-prompt-btn-primary" onClick=${onActivate}>Activer</button>
        <button type="button" className="notif-prompt-btn-secondary" onClick=${onLater}>
          ${dismissCount >= 2 ? "Non merci" : "Plus tard"}
        </button>
      </div>
    </div>
  `;
}

// ── Codes d'invitation (post-onboarding) ──────────────────────────────────

export function InviteCodesModal({ inviteCodes, onClose }) {
  return html`
    <div className="modal-backdrop invite-codes-backdrop" onClick=${onClose}>
      <div className="modal-card task-modal-redesign" style=${{ width: "min(400px, 100%)" }} onClick=${(e) => e.stopPropagation()}>
        <div className="mrd-mhd">
          <span className="mrd-mtitle">Codes d'invitation</span>
          <button type="button" className="mrd-mclose" onClick=${onClose}>✕</button>
        </div>
        <div className="mrd-mbody">
          <p style=${{ margin: 0, fontSize: "0.9rem", color: "var(--mrd-fg2)", lineHeight: 1.5 }}>
            Voici les codes pour que vos membres rejoignent le foyer. Vous les retrouverez aussi dans les réglages.
          </p>
          <div className="invite-codes-list">
            ${inviteCodes.map((item) => html`
              <div key=${item.firstName} className="invite-code-row">
                <span className="invite-code-name">${item.firstName}</span>
                <span className="invite-code-value">${item.code.slice(0, 3)}-${item.code.slice(3)}</span>
              </div>
            `)}
          </div>
          <div className="task-modal-actions">
            <button type="button" className="aok" onClick=${onClose}>Fermer</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ── Popup contextuelle au clic sur une notification ──────────────────────

export function NotificationModal({ notification, onClose, onNavigate }) {
  const [closing, setClosing] = useState(false);

  const {
    title = "",
    body = "",
    notifType = "general",
    tasks = [],
    taskId = "",
    eventId = "",
  } = notification || {};

  const hasNavTarget = Boolean(
    eventId ||
    taskId ||
    notifType === "end-of-day" ||
    notifType === "urgent" ||
    notifType === "due"
  );

  function getNavLabel() {
    if (eventId || notifType === "event") return "Voir l'événement";
    return "Voir les tâches";
  }

  // Lance l'animation de sortie, puis appelle onClose après 220ms
  function handleClose() {
    setClosing(true);
    setTimeout(onClose, 220);
  }

  function handleNavigate() {
    if (onNavigate) onNavigate(notification);
    handleClose();
  }

  return html`
    <div
      className=${`modal-backdrop notification-modal-backdrop${closing ? " is-closing" : ""}`}
      onClick=${handleClose}
    >
      <div className="notification-modal-card" onClick=${(e) => e.stopPropagation()}>
        <div style=${{ display: "flex", justifyContent: "center", marginBottom: "4px" }}>
          <span style=${{ fontSize: "36px", lineHeight: 1 }}>🔔</span>
        </div>
        <h2 className="notification-modal-title">${title}</h2>
        ${body ? html`<p className="notification-modal-text">${body}</p>` : null}
        ${tasks && tasks.length > 0 ? html`
          <ul className="notification-modal-task-list">
            ${tasks.slice(0, 6).map((task, i) => html`
              <li key=${task.id || i} className="notification-modal-task-item">
                <span className="notification-modal-task-bullet">◦</span>
                <span>${task.text}</span>
              </li>
            `)}
            ${tasks.length > 6 ? html`
              <li className="notification-modal-task-item notification-modal-task-more">
                et ${tasks.length - 6} autre${tasks.length - 6 > 1 ? "s" : ""}…
              </li>
            ` : null}
          </ul>
        ` : null}
        <div className="notification-modal-actions">
          ${hasNavTarget ? html`
            <button type="button" className="notification-modal-primary" onClick=${handleNavigate}>
              ${getNavLabel()}
            </button>
          ` : null}
          <button type="button" className="notification-modal-close" onClick=${handleClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  `;
}

// ── Bienvenue dans le foyer (post-création) ───────────────────────────────

export function HouseholdWelcomeModal({ onClose, onAddMembers }) {
  return html`
    <div className="modal-backdrop task-create-backdrop" onClick=${onClose}>
      <div className="modal-card task-modal-redesign" style=${{ width: "min(460px, 100%)" }} onClick=${(event) => event.stopPropagation()}>
        <div className="mrd-mhd">
          <span className="mrd-mtitle">Bienvenue dans votre foyer</span>
          <button type="button" className="mrd-mclose" onClick=${onClose}>✕</button>
        </div>
        <div className="mrd-mbody">
          <div className="household-welcome-emoji" aria-hidden="true">🎉</div>
          <p className="onboarding-subtitle" style=${{ textAlign: "left" }}>
            Félicitations, votre foyer a été créé avec succès. Vous pouvez maintenant ajouter des membres pour rejoindre votre organisation.
          </p>
          <div className="task-modal-actions">
            <button type="button" className="clrbtn" onClick=${onClose}>Plus tard</button>
            <button type="button" className="aok" onClick=${onAddMembers}>Ajouter des membres</button>
          </div>
        </div>
      </div>
    </div>
  `;
}
