// Modales de l'app — toutes passées à `MrdModal` (donc `ion-modal`).
//
// Chacune était un `<div class="modal-backdrop" onClick=fermer>` contenant un
// `<div class="modal-card" onClick=stopPropagation>` : le `stopPropagation`
// existait uniquement pour empêcher un clic dans la modale de la refermer. Avec
// `ion-modal`, la fermeture au tap dehors est gérée par le composant et ces
// deux niveaux de `<div>` disparaissent, `stopPropagation` compris.

import { DEFAULT_MEMBER_COLOR } from "../config/constants.js";
import { html, useState } from "../lib.js";
import { MrdModal } from "../components/MrdModal.js";
import { LineIcon } from "../components/LineIcons.js";

/* ── Les deux modales de rappel (handoff 8a / 8b) ─────────────────────────
   Elles partagent une carte (`.rmd`) : vignette et sur-titre en en-tête au
   lieu du gros emoji centré, texte aligné à gauche, contenu actionnable, un
   seul bouton plein. Seul leur corps diffère — 8a fait cocher, 8b fait
   choisir. */

const PERIOD_LABEL = {
  daily: "Aujourd'hui",
  weekly: "Semaine",
  monthly: "Mois",
  deadline: "Échéance",
};

function isTaskDone(task) {
  return (Array.isArray(task?.doneBy) ? task.doneBy.filter(Boolean).length > 0 : false)
    || Boolean(task?.completedByPersonId);
}

/* La ligne secondaire d'une tâche. La pastille de droite porte déjà la
   période : celle-ci dit donc l'état ou l'heure, jamais la même chose. */
function taskMetaLine(task) {
  if (isTaskDone(task)) return "Faite";
  if (task.dueTime) return `À faire avant ${task.dueTime}`;
  if (task.dueDate) return "Échéance aujourd'hui";
  if (task.taskKind === "recurring") return "Tâche récurrente";
  return "Pas encore faite";
}

// ── Fiche profil (éditable ou lecture seule) ──────────────────────────────

export function ProfileModal({ profile, canEdit, draft, onDraftChange, onClose, onSave }) {
  return html`
    <${MrdModal} isOpen=${true} onClose=${onClose} className="profile-card">
        <div className="task-modal-head">
          <div>
            <div className="miniTitle">${canEdit ? "Mon profil" : "Profil public"}</div>
            <div className="st">${profile.label}</div>
          </div>
          <button className="delbtn" onClick=${onClose}>X</button>
        </div>
        <div className="profile-hero">
          <div className="profile-avatar" style=${{ background: (canEdit ? draft.color : profile.color) || DEFAULT_MEMBER_COLOR }}>
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
                <input className="ainp profile-color-input" type="color" value=${draft.color || DEFAULT_MEMBER_COLOR} onInput=${(event) => onDraftChange({ ...draft, color: event.target.value })} />
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
    <//>
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
    <${MrdModal} isOpen=${true} onClose=${onLater} className="notif-prompt-card">
        <div className="notif-prompt-icon">🔔</div>
        <h2 className="notif-prompt-title">${title}</h2>
        <p className="notif-prompt-body">${body}</p>
        <button type="button" className="notif-prompt-btn-primary" onClick=${onActivate}>Activer</button>
        <button type="button" className="notif-prompt-btn-secondary" onClick=${onLater}>
          ${dismissCount >= 2 ? "Non merci" : "Plus tard"}
        </button>
    <//>
  `;
}

// ── Codes d'invitation (post-onboarding) ──────────────────────────────────

export function InviteCodesModal({ inviteCodes, onClose }) {
  return html`
    <${MrdModal} isOpen=${true} onClose=${onClose} className="task-modal-redesign mrd-modal-narrow">
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
    <//>
  `;
}

// ── 8a · Le rappel se coche ───────────────────────────────────────────────
//
// La popup était une carte centrée : gros 🔔, titre en 30px, les tâches en
// liste à puces grise — on ne pouvait rien en faire, « Fermer » menait à un
// cul-de-sac. Les tâches deviennent des lignes tapables (on coche sans
// quitter), et « Plus tard » ouvre une feuille d'action de trois créneaux au
// lieu de fermer sans rien faire — le report repart en push depuis le serveur,
// il survit donc à la fermeture de l'app.

/* Le type de notification fixe la teinte, la vignette et le sur-titre. Le
   scénario se lit donc avant même le titre. */
const NOTIF_KINDS = {
  "end-of-day": { tone: "amber",  glyph: "bell",     overline: "fin de journée" },
  urgent:       { tone: "danger", glyph: "clock",    overline: "urgent" },
  due:          { tone: "accent", glyph: "clock",    overline: "échéance" },
  event:        { tone: "sage",   glyph: "calendar", overline: "agenda" },
  general:      { tone: "accent", glyph: "bell",     overline: "rappel" },
};

const NOTIF_FALLBACK_TEXT = {
  "end-of-day": "Coche ce qui est déjà fait — le reste se reporte d'un tap.",
  urgent: "Elle attend toujours. Coche-la, ou repousse le rappel.",
  due: "L'échéance approche. Coche-la, ou repousse le rappel.",
  event: "L'événement arrive. Ouvre l'agenda, ou repousse le rappel.",
  general: "",
};

export function NotificationModal({
  notification,
  tasks = [],
  activePersonId = "",
  onClose,
  onNavigate,
  onToggleTask,
  onSnooze,
}) {
  const [closing, setClosing] = useState(false);

  const {
    title = "",
    body = "",
    notifType = "general",
    taskId = "",
    eventId = "",
  } = notification || {};

  const kind = NOTIF_KINDS[notifType] || NOTIF_KINDS.general;
  const rows = Array.isArray(tasks) ? tasks.slice(0, 6) : [];
  const hiddenCount = Math.max(0, (Array.isArray(tasks) ? tasks.length : 0) - rows.length);
  const canToggle = Boolean(onToggleTask && activePersonId);

  const hasNavTarget = Boolean(
    eventId ||
    taskId ||
    notifType === "end-of-day" ||
    notifType === "urgent" ||
    notifType === "due"
  );
  const navLabel = (eventId || notifType === "event")
    ? "Voir l'événement"
    : rows.length > 1 ? "Voir les tâches" : "Voir la tâche";

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
    <${MrdModal} isOpen=${!closing} onClose=${onClose} className="rmd-card">
      <div className=${`rmd rmd--${kind.tone}`}>
        <div className="rmd-head">
          <span className="rmd-tile"><${LineIcon} name=${kind.glyph} size=${19} /></span>
          <span className="rmd-head-copy">
            <span className="rmd-overline">${kind.overline}</span>
            <span className="rmd-title">${title || "Rappel"}</span>
          </span>
          <button type="button" className="rmd-close" onClick=${handleClose} aria-label="Fermer">✕</button>
        </div>

        ${(body || NOTIF_FALLBACK_TEXT[notifType]) ? html`
          <p className="rmd-text">${body || NOTIF_FALLBACK_TEXT[notifType]}</p>
        ` : null}

        ${rows.length ? html`
          <div className="rmd-rows">
            ${rows.map((task) => {
              const done = isTaskDone(task);
              return html`
                <button type="button" key=${task.id}
                  className=${`rmd-row ${done ? "is-done" : ""}`}
                  disabled=${!canToggle}
                  onClick=${canToggle ? () => onToggleTask(task.id, activePersonId) : null}>
                  <span className="rmd-row-check">${done ? "✓" : ""}</span>
                  <span className="rmd-row-copy">
                    <span className="rmd-row-name">${task.icon ? `${task.icon} ` : ""}${task.text}</span>
                    <span className="rmd-row-meta">${taskMetaLine(task)}</span>
                  </span>
                  <span className="rmd-row-tag">${PERIOD_LABEL[task.type] || "Tâche"}</span>
                </button>
              `;
            })}
            ${hiddenCount ? html`
              <span className="rmd-rows-more">et ${hiddenCount} autre${hiddenCount > 1 ? "s" : ""}…</span>
            ` : null}
          </div>
        ` : null}

        ${/* Pas de « Plus tard » sans droit de reporter : un rappel de foyer ne
             se repousse que par un admin, et le report vaut alors pour tout le
             monde. Afficher un bouton qui se contenterait de fermer ferait
             croire à un report — la carte se ferme par le ✕, comme avant. */null}
        <div className="rmd-actions">
          ${onSnooze ? html`
            <button type="button" className="rmd-ghost" onClick=${onSnooze}>Plus tard</button>
          ` : null}
          <button type="button" className="rmd-primary"
            onClick=${hasNavTarget ? handleNavigate : handleClose}>${hasNavTarget ? navLabel : "C'est noté"}</button>
        </div>
      </div>
    <//>
  `;
}

// ── 8b · La relance propose ───────────────────────────────────────────────
//
// « Passer à la semaine / Passer au jour / Ignorer » était une rangée de trois
// boutons qui débordait. Elle devient une liste à cocher : un choix par ligne,
// avec sa conséquence en clair, et le libellé du bouton plein qui suit la
// ligne choisie. Le déplacement fait, un second temps montre ce qui a bougé et
// laisse annuler.

const STALE_KINDS = {
  weekly:    { tone: "amber",  glyph: "hourglass", overline: "relance · semaine", tag: "Semaine" },
  monthly:   { tone: "danger", glyph: "calendar",  overline: "relance · mois",    tag: "Mois" },
  recurring: { tone: "accent", glyph: "repeat",    overline: "relance · récurrent", tag: "Récurrent" },
};

/* Les choix dépendent de la période : on ne propose jamais « passer à la
   semaine » à une tâche qui y est déjà. */
function staleChoices(alert) {
  if (alert.kind === "recurring") {
    return [
      { id: "restart", label: "Repartir au prochain cycle", hint: "Le compteur de cycles ratés repart de zéro", cta: "Repartir au prochain cycle" },
      { id: "open", label: "Voir la tâche", hint: `Ouvrir l'onglet ${alert.period === "weekly" ? "Semaine" : "Mois"}`, cta: "Voir la tâche" },
    ];
  }
  if (alert.period === "weekly") {
    return [
      { id: "daily", label: "Passer à aujourd'hui", hint: "Elle rejoint les tâches du jour", cta: "Passer à aujourd'hui" },
      { id: "weekly", label: "Garder pour la semaine", hint: "Le compteur repart pour sept jours", cta: "Garder pour la semaine" },
      { id: "stop", label: "Ne plus me relancer", hint: "La tâche reste, le rappel s'arrête", cta: "Ne plus me relancer" },
    ];
  }
  return [
    { id: "weekly", label: "Passer à la semaine", hint: "Sept jours pour la boucler", cta: "Passer à la semaine" },
    { id: "daily", label: "Passer à aujourd'hui", hint: "Elle rejoint les tâches du jour", cta: "Passer à aujourd'hui" },
    { id: "stop", label: "Ne plus me relancer", hint: "La tâche reste, le rappel s'arrête", cta: "Ne plus me relancer" },
  ];
}

export function StaleTaskModal({
  task,
  alert,
  onClose,
  onLater,
  onDismiss,
  onMovePeriod,
  onSetStaleNotice,
  onOpenTask,
}) {
  /* La période et la date d'entrée d'origine, figées à l'ouverture : le second
     temps s'en sert pour dire d'où vient la tâche, et pour annuler. */
  const [origin] = useState(() => ({
    period: task?.type || "weekly",
    createdAt: task?.createdAt || "",
  }));
  const [choiceId, setChoiceId] = useState(null);
  const [moved, setMoved] = useState(null);
  const [keepNotice, setKeepNotice] = useState(true);

  if (!task || !alert) return null;

  const kindKey = alert.kind === "recurring" ? "recurring" : alert.period === "weekly" ? "weekly" : "monthly";
  const kind = STALE_KINDS[kindKey];
  const choices = staleChoices(alert);
  const selected = choices.find((choice) => choice.id === choiceId) || choices[0];

  const missedCount = Number(alert.missedCount) || 0;
  const title = alert.kind === "recurring" ? "Tâche récurrente non faite" : "Tâche non terminée";
  const periodLabel = alert.period === "weekly" ? "cette semaine" : "ce mois-ci";
  const text = alert.kind === "recurring" && missedCount > 1
    ? `Elle a manqué ${missedCount} cycles d'affilée. Que veut-on en faire ?`
    : `Elle n'a pas été faite ${periodLabel}. Que veut-on en faire ?`;

  function handleConfirm() {
    if (selected.id === "open") { onOpenTask(); return; }
    if (selected.id === "restart" || selected.id === "stop") { onDismiss(); return; }
    onMovePeriod(selected.id);
    /* « Garder pour la semaine » ne change pas de période : le second temps
       annonce alors un compteur relancé, pas un déplacement. */
    setMoved(selected.id === origin.period
      ? {
          title: "Le compteur repart",
          text: "L'ancienneté de la tâche repart de zéro. Tu peux revenir en arrière tant que cette carte est ouverte.",
          line: `${PERIOD_LABEL[origin.period]} · sept jours de plus`,
        }
      : {
          title: "C'est déplacé",
          text: "La tâche a changé de période. Tu peux revenir en arrière tant que cette carte est ouverte.",
          line: `${PERIOD_LABEL[origin.period] || "Semaine"} → ${PERIOD_LABEL[selected.id]}`,
        });
  }

  function handleToggleKeep() {
    const next = !keepNotice;
    setKeepNotice(next);
    onSetStaleNotice(next);
  }

  function handleUndo() {
    onMovePeriod(origin.period, { createdAt: origin.createdAt });
    onLater();
  }

  return html`
    <${MrdModal} isOpen=${true} onClose=${onClose} className="rmd-card">
      <div className=${`rmd rmd--${kind.tone}`}>
        <div className="rmd-head">
          <span className="rmd-tile"><${LineIcon} name=${kind.glyph} size=${19} /></span>
          <span className="rmd-head-copy">
            <span className="rmd-overline">${kind.overline}</span>
            <span className="rmd-title">${moved ? moved.title : title}</span>
          </span>
          <button type="button" className="rmd-close" onClick=${onLater} aria-label="Fermer">✕</button>
        </div>

        ${moved ? html`
          <p className="rmd-text">${moved.text}</p>

          <div className="rmd-task is-done">
            <span className="rmd-task-icon">
              ${task.icon ? task.icon : html`<${LineIcon} name="checklist" size=${16} />`}
            </span>
            <span className="rmd-task-copy">
              <span className="rmd-task-name">${task.text}</span>
              <span className="rmd-task-move">${moved.line}</span>
            </span>
            <span className="rmd-task-check">✓</span>
          </div>

          <button type="button" className="rmd-keep" onClick=${handleToggleKeep}>
            <span className="rmd-keep-copy">
              <span className="rmd-keep-label">Garder la relance</span>
              <span className="rmd-keep-hint">Si elle traîne encore, je te repropose ce choix.</span>
            </span>
            <span className=${`rmd-switch ${keepNotice ? "on" : ""}`}><span className="rmd-switch-dot"></span></span>
          </button>

          <div className="rmd-actions">
            <button type="button" className="rmd-ghost" onClick=${handleUndo}>Annuler</button>
            <button type="button" className="rmd-primary" onClick=${onLater}>Terminé</button>
          </div>
        ` : html`
          <p className="rmd-text">${text}</p>

          <div className="rmd-task">
            <span className="rmd-task-icon">
              ${task.icon ? task.icon : html`<${LineIcon} name="checklist" size=${16} />`}
            </span>
            <span className="rmd-task-copy">
              <span className="rmd-task-name">${task.text}</span>
              <span className="rmd-task-meta">${taskMetaLine(task)}</span>
            </span>
            <span className="rmd-task-tag">${kind.tag}</span>
          </div>

          <div className="rmd-choices">
            <span className="rmd-label">que faire ?</span>
            ${choices.map((choice) => html`
              <button type="button" key=${choice.id}
                className=${`rmd-choice ${selected.id === choice.id ? "on" : ""}`}
                onClick=${() => setChoiceId(choice.id)}>
                <span className="rmd-choice-dot"></span>
                <span className="rmd-choice-copy">
                  <span className="rmd-choice-label">${choice.label}</span>
                  <span className="rmd-choice-hint">${choice.hint}</span>
                </span>
              </button>
            `)}
          </div>

          <div className="rmd-actions">
            <button type="button" className="rmd-ghost" onClick=${onLater}>Plus tard</button>
            <button type="button" className="rmd-primary" onClick=${handleConfirm}>${selected.cta}</button>
          </div>
        `}
      </div>
    <//>
  `;
}

// ── Bienvenue dans le foyer (post-création) ───────────────────────────────

export function HouseholdWelcomeModal({ onClose, onAddMembers }) {
  return html`
    <${MrdModal} isOpen=${true} onClose=${onClose} className="task-modal-redesign">
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
    <//>
  `;
}
