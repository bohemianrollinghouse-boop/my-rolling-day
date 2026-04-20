import { html } from "../lib.js";

export function Header({ title, users, percentDone, remaining, syncLabel, onOpenSettings, settingsOpen, onOpenOwnProfile, onOpenUserProfile }) {
  const safeUsers = Array.isArray(users) ? users : [];
  return html`
    <header className="hdr">
      <div className="hdr-top">
        <div className="hdr-sub">Planning</div>
        <div className="hdr-actions">
          ${onOpenOwnProfile ? html`<button className="hdr-settings" onClick=${onOpenOwnProfile}>Mon profil</button>` : null}
          ${onOpenSettings ? html`<button className="hdr-settings" onClick=${onOpenSettings}>${settingsOpen ? "Retour" : "Réglages"}</button>` : null}
        </div>
      </div>
      <div className="hdr-title">${title}</div>
      <div className="users">
        ${safeUsers.map(
          (user) => html`
            <button className="ubdg ubdg-btn" key=${user.id} onClick=${() => onOpenUserProfile && onOpenUserProfile(user.id)}>
              <div className="ucirc" style=${{ background: user.color }}>${user.shortId || user.id}</div>
              ${user.label}
            </button>
          `,
        )}
        <span className="header-score">${percentDone}% fait</span>
      </div>
      <div className="daystats">
        <div className="dst"><strong>Quotidien restant</strong> : ${remaining.daily}</div>
        <div className="dst"><strong>Hebdo restant</strong> : ${remaining.weekly}</div>
        <div className="dst"><strong>Mensuel restant</strong> : ${remaining.monthly}</div>
      </div>
      <div className="pbar"><div className="pfill" style=${{ width: `${percentDone}%` }}></div></div>
      <div className="sline">
        <div className="sdot"></div>
        <span>${syncLabel}</span>
      </div>
    </header>
  `;
}
