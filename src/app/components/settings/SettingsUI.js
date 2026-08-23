import { html } from "../../lib.js";

// ── Constantes ─────────────────────────────────────────────────────────────

/* Définie dans constants.js. Ré-exportée ici : les composants Settings
   l'importent historiquement depuis ce module. */
export { BADGE_PALETTE } from "../../config/constants.js";
import { BADGE_PALETTE } from "../../config/constants.js";

export const EMPTY_PERSON = {
  id: "",
  displayName: "",
  type: "adult",
  profileMode: "app_user",
  canCompleteTasks: true,
  active: true,
  dateOfBirth: "",
};

// ── Fonctions utilitaires ──────────────────────────────────────────────────

// Ré-export de l'adaptateur multi-plateforme (cache natif inclus) pour garder
// l'API historique des composants Settings.
export { getNotificationPermissionState } from "../../plugins/notifications.js";

export function notificationPermissionLabel(status) {
  if (status === "granted") return "Notifications : autorisées";
  if (status === "unsupported") return "Notifications : indisponibles";
  return "Notifications : non autorisées";
}

export function calcAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const d = new Date(dateOfBirth + "T00:00");
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
  return age >= 0 ? age : null;
}

// ── Composants UI partagés ─────────────────────────────────────────────────

export function SectionCard({ id, icon, title, subtitle, soon = false, open, onToggle, children }) {
  return html`
    <div className=${`mrd-set-section${open ? " is-open" : ""}`}>
      <button className="mrd-set-section-head" onClick=${() => onToggle(id)}>
        <span className="mrd-set-section-icon">${icon}</span>
        <div className="mrd-set-section-info">
          <span className="mrd-set-section-title">${title}</span>
          <span className="mrd-set-section-sub">${subtitle}</span>
        </div>
        <div className="mrd-set-section-right">
          ${soon ? html`<span className="mrd-set-soon">Bientôt</span>` : null}
          <svg className="mrd-set-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </button>
      ${open ? html`<div className="mrd-set-section-body">${children}</div>` : null}
    </div>
  `;
}

export function PlaceholderList({ items }) {
  return html`
    <div className="mrd-set-placeholder-list">
      ${items.map((item) => html`
        <div className="mrd-set-placeholder-row" key=${item}>
          <span>${item}</span>
          <span className="mrd-set-soon">Bientôt</span>
        </div>
      `)}
    </div>
  `;
}

export function SeeMoreLink({ children, onClick }) {
  return html`
    <button type="button" className="settings-see-more" onClick=${onClick}>
      <span>${children}</span>
      <span aria-hidden="true">›</span>
    </button>
  `;
}

export function SettingsGroup({ title, children }) {
  return html`
    <section className="settings-subpage-group">
      ${title ? html`<div className="settings-subpage-group-title">${title}</div>` : null}
      <div className="settings-subpage-group-card">${children}</div>
    </section>
  `;
}

export function SettingsRow({ icon = "", label, value = "", onClick = null, danger = false, last = false }) {
  const Tag = onClick ? "button" : "div";
  return html`
    <${Tag}
      type=${onClick ? "button" : undefined}
      className=${`settings-subpage-row${danger ? " is-danger" : ""}${last ? " is-last" : ""}${onClick ? " is-clickable" : ""}`}
      onClick=${onClick || undefined}
    >
      ${icon ? html`<span className="settings-subpage-row-icon">${icon}</span>` : null}
      <span className="settings-subpage-row-label">${label}</span>
      ${value ? html`<span className="settings-subpage-row-value">${value}</span>` : null}
      ${onClick && !danger ? html`<span className="settings-subpage-row-chevron">›</span>` : null}
    <//>
  `;
}

export function SettingsSwitch({ value, onChange }) {
  return html`
    <button
      type="button"
      className=${`settings-switch${value ? " on" : ""}`}
      aria-pressed=${value ? "true" : "false"}
      onClick=${() => onChange(!value)}
    >
      <span></span>
    </button>
  `;
}

export function SettingsToggleRow({ icon = "", label, sub = "", value, onChange, last = false }) {
  return html`
    <div className=${`settings-subpage-row settings-subpage-toggle-row${last ? " is-last" : ""}`}>
      ${icon ? html`<span className="settings-subpage-row-icon">${icon}</span>` : null}
      <span className="settings-subpage-row-copy">
        <span className="settings-subpage-row-label">${label}</span>
        ${sub ? html`<span className="settings-subpage-row-sub">${sub}</span>` : null}
      </span>
      <${SettingsSwitch} value=${value} onChange=${onChange} />
    </div>
  `;
}

export function SubPageHeader({ title }) {
  return html`
    <div className="settings-subpage-header">
      <span className="settings-subpage-spacer"></span>
      <h1>${title}</h1>
      <span className="settings-subpage-spacer"></span>
    </div>
  `;
}

export function ColorGrid({ value, onChange }) {
  return html`
    <div className="settings-color-grid">
      ${BADGE_PALETTE.flat().map((hex) => html`
        <button
          key=${hex}
          type="button"
          className=${`settings-color-swatch${value === hex ? " on" : ""}`}
          style=${{ background: hex }}
          onClick=${() => onChange(hex)}
          aria-label=${hex}
          title=${hex}
        ></button>
      `)}
    </div>
  `;
}

export function LegalTextPage({ title, intro, sections }) {
  return html`
    <div className="support-legal-text">
      <p className="support-legal-intro">${intro}</p>
      ${sections.map((section) => html`
        <section className="support-legal-section" key=${section.title}>
          <h2>${section.title}</h2>
          <p>${section.body}</p>
        </section>
      `)}
    </div>
  `;
}
