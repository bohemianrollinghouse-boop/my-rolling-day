import { html, useEffect, useRef, useState } from "../../lib.js";
import { isPremiumTab } from "../../utils/premium.js";

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

function IcoPlus({ active }) {
  const c = active ? "var(--mrd-a)" : "var(--mrd-fg3)";
  const sw = active ? "2.2" : "1.8";
  return html`
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke=${c} stroke-width=${sw} stroke-linecap="round"/>
    </svg>`;
}

const NAV_TABS = [
  { id: "home", label: "Accueil", Icon: IcoHome },
  { id: "tasks", label: "Tâches", Icon: IcoCheck },
  { id: "agenda", label: "Agenda", Icon: IcoCal },
  { id: "meals", label: "Repas", Icon: IcoFork },
  { id: "quick", label: "Plus", Icon: IcoPlus },
];

const QUICK_MENU_ITEMS = [
  { id: "lists", label: "Listes", emoji: "🛒" },
  { id: "notes", label: "Notes", emoji: "📝" },
  { id: "inventory", label: "Inventaire", emoji: "🧺" },
  { id: "recipes", label: "Recettes", emoji: "📚" },
  { id: "history", label: "Historique", emoji: "📊" },
];

function getBottomId(tab) {
  if (["mine", "daily", "weekly", "monthly"].includes(tab)) return "tasks";
  if (tab === "agenda") return "agenda";
  if (tab === "meals") return "meals";
  if (QUICK_MENU_ITEMS.some((item) => item.id === tab)) return "quick";
  if (tab === "home") return "home";
  return "home";
}

function toTabId(id) {
  if (id === "tasks") return "tasks";
  return id;
}

export function BottomNav({ activeTab, onChange, overdueTaskCount = 0, isPremium = false }) {
  const active = getBottomId(activeTab);
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const quickWrapRef = useRef(null);

  useEffect(() => {
    if (!showQuickMenu) return;
    function onDocClick(e) {
      if (quickWrapRef.current && !quickWrapRef.current.contains(e.target)) {
        setShowQuickMenu(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [showQuickMenu]);

  return html`
    <nav className="mrd-bnav">
      ${NAV_TABS.map(({ id, label, Icon }) => {
        const isOn = active === id;
        const badge = id === "tasks" && overdueTaskCount > 0 ? overdueTaskCount : 0;
        const premiumLocked = isPremiumTab(id) && !isPremium;
        if (id === "quick") {
          return html`
            <div key=${id} className="mrd-bnav-quick-wrap" ref=${quickWrapRef}>
              ${showQuickMenu ? html`
                <div className="mrd-bnav-quick-menu">
                  ${QUICK_MENU_ITEMS.map((item) => {
                    const premiumLocked = isPremiumTab(item.id) && !isPremium;
                    return html`
                    <button
                      key=${item.id}
                      type="button"
                      className="mrd-bnav-quick-item"
                      onClick=${() => { setShowQuickMenu(false); onChange(item.id); }}
                    >
                      <span className="mrd-bnav-quick-item-emoji" aria-hidden="true">${item.emoji}</span>
                      <span>${item.label}</span>
                      ${premiumLocked ? html`<span className="mrd-bnav-premium-star" aria-hidden="true">⭐</span>` : null}
                    </button>
                  `;
                  })}
                </div>
              ` : null}
              <button
                type="button"
                className=${`mrd-bnav-btn ${isOn ? "on" : ""}`}
                aria-label=${label}
                aria-expanded=${showQuickMenu ? "true" : "false"}
                onClick=${() => setShowQuickMenu((v) => !v)}
              >
                <div className="mrd-bnav-icon-wrap">
                  <${Icon} active=${isOn || showQuickMenu} />
                </div>
                <span className="mrd-bnav-label" aria-hidden="true">${label}</span>
                ${isOn ? html`<div className="mrd-bnav-dot"></div>` : null}
              </button>
            </div>
          `;
        }
        return html`
          <button
            key=${id}
            type="button"
            className=${`mrd-bnav-btn ${isOn ? "on" : ""}`}
            aria-label=${badge ? `${label} — ${badge} en retard` : label}
            aria-current=${isOn ? "page" : null}
            onClick=${() => { setShowQuickMenu(false); onChange(toTabId(id)); }}
          >
            <div className="mrd-bnav-icon-wrap">
              <${Icon} active=${isOn} />
              ${badge ? html`<span className="mrd-bnav-badge" aria-hidden="true">${badge > 9 ? "9+" : badge}</span>` : null}
              ${premiumLocked ? html`<span className="mrd-bnav-premium-star mrd-bnav-premium-star-tab" aria-hidden="true">⭐</span>` : null}
            </div>
            <span className="mrd-bnav-label" aria-hidden="true">${label}</span>
            ${isOn ? html`<div className="mrd-bnav-dot"></div>` : null}
          </button>
        `;
      })}
    </nav>
  `;
}

// ── Nav bureau (barre latérale, écrans larges) ──────────────────────────────

const SIDEBAR_TABS = [
  { id: "home", label: "Accueil", Icon: IcoHome },
  { id: "tasks", label: "Tâches", Icon: IcoCheck },
  { id: "agenda", label: "Agenda", Icon: IcoCal },
  { id: "meals", label: "Repas", Icon: IcoFork },
];

export function SidebarNav({ activeTab, onChange, overdueTaskCount = 0, isPremium = false }) {
  const active = getBottomId(activeTab);

  function renderItem({ id, label, Icon, emoji }) {
    const isOn = active === id || activeTab === id;
    const badge = id === "tasks" && overdueTaskCount > 0 ? overdueTaskCount : 0;
    const premiumLocked = isPremiumTab(id) && !isPremium;
    return html`
      <button
        key=${id}
        type="button"
        className=${`mrd-sidebar-btn ${isOn ? "on" : ""}`}
        aria-current=${isOn ? "page" : null}
        onClick=${() => onChange(toTabId(id))}
      >
        <span className="mrd-sidebar-btn-icon" aria-hidden="true">
          ${Icon ? html`<${Icon} active=${isOn} />` : emoji}
        </span>
        <span className="mrd-sidebar-btn-label">${label}</span>
        ${badge ? html`<span className="mrd-sidebar-badge" aria-hidden="true">${badge > 9 ? "9+" : badge}</span>` : null}
        ${premiumLocked ? html`<span className="mrd-bnav-premium-star" aria-hidden="true">⭐</span>` : null}
      </button>
    `;
  }

  return html`
    <nav className="mrd-sidebar">
      <div className="mrd-sidebar-brand">
        <img src="./src/assets/brand/mark.svg" width="26" height="26" alt="" />
        <span className="mrd-sidebar-brand-name">My Rolling Day</span>
      </div>
      <div className="mrd-sidebar-list">
        ${SIDEBAR_TABS.map(renderItem)}
        <div className="mrd-sidebar-sep"></div>
        ${QUICK_MENU_ITEMS.map(renderItem)}
      </div>
    </nav>
  `;
}
