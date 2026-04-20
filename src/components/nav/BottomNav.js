import { html } from "../../lib.js";

function IcoHome({ active }) {
  const c = active ? "var(--mrd-a)" : "var(--mrd-fg3)";
  const sw = active ? "2.2" : "1.8";
  return html`
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M3 12L12 3l9 9" stroke=${c} stroke-width=${sw} stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9" stroke=${c} stroke-width=${sw} stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

function IcoCheck({ active }) {
  const c = active ? "var(--mrd-a)" : "var(--mrd-fg3)";
  const sw = active ? "2.2" : "1.8";
  return html`
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke=${c} stroke-width=${sw}/>
      <path d="M8 12l3 3 5-5" stroke=${c} stroke-width=${sw} stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

function IcoCal({ active }) {
  const c = active ? "var(--mrd-a)" : "var(--mrd-fg3)";
  const sw = active ? "2.2" : "1.8";
  return html`
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="17" rx="3" stroke=${c} stroke-width=${sw}/>
      <path d="M3 9h18M8 2v4M16 2v4" stroke=${c} stroke-width=${sw} stroke-linecap="round"/>
      <circle cx="8" cy="13" r="1" fill=${c}/>
      <circle cx="12" cy="13" r="1" fill=${c}/>
      <circle cx="16" cy="13" r="1" fill=${c}/>
      <circle cx="8" cy="17" r="1" fill=${c}/>
      <circle cx="12" cy="17" r="1" fill=${c}/>
    </svg>`;
}

function IcoFork({ active }) {
  const c = active ? "var(--mrd-a)" : "var(--mrd-fg3)";
  const sw = active ? "2.2" : "1.8";
  return html`
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M3 2v7c0 1.1.9 2 2 2h2v11" stroke=${c} stroke-width=${sw} stroke-linecap="round"/>
      <path d="M3 2v4M7 2v4" stroke=${c} stroke-width=${sw} stroke-linecap="round"/>
      <path d="M17 2c0 0-2 2-2 5s2 5 2 5v8" stroke=${c} stroke-width=${sw} stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

function IcoList({ active }) {
  const c = active ? "var(--mrd-a)" : "var(--mrd-fg3)";
  const sw = active ? "2.2" : "1.8";
  return html`
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M9 6h11M9 12h11M9 18h11" stroke=${c} stroke-width=${sw} stroke-linecap="round"/>
      <circle cx="4" cy="6" r="1.5" fill=${c}/>
      <circle cx="4" cy="12" r="1.5" fill=${c}/>
      <circle cx="4" cy="18" r="1.5" fill=${c}/>
    </svg>`;
}

const NAV_TABS = [
  { id: "home", label: "Accueil", Icon: IcoHome },
  { id: "tasks", label: "Tâches", Icon: IcoCheck },
  { id: "agenda", label: "Agenda", Icon: IcoCal },
  { id: "meals", label: "Repas", Icon: IcoFork },
  { id: "lists", label: "Listes", Icon: IcoList },
];

function getBottomId(tab) {
  if (["mine", "daily", "weekly", "monthly"].includes(tab)) return "tasks";
  if (tab === "agenda") return "agenda";
  if (tab === "meals") return "meals";
  if (tab === "lists") return "lists";
  if (tab === "home") return "home";
  return "home";
}

function toTabId(id) {
  if (id === "tasks") return "daily";
  return id;
}

export function BottomNav({ activeTab, onChange }) {
  const active = getBottomId(activeTab);

  return html`
    <nav className="mrd-bnav">
      ${NAV_TABS.map(({ id, label, Icon }) => {
        const isOn = active === id;
        return html`
          <button
            key=${id}
            className=${`mrd-bnav-btn ${isOn ? "on" : ""}`}
            onClick=${() => onChange(toTabId(id))}
          >
            <${Icon} active=${isOn} />
            <span className="mrd-bnav-label">${label}</span>
            ${isOn ? html`<div className="mrd-bnav-dot"></div>` : null}
          </button>
        `;
      })}
    </nav>
  `;
}
