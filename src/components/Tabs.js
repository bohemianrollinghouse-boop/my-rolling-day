import { html } from "../lib.js";

export function Tabs({ tabs, activeTab, onChange }) {
  return html`
    <div className="tabs-w">
      <div className="tabs-scroll" role="tablist" aria-label="Rubriques principales">
        <div className="tabs-row">
          ${tabs.map(
            (tab) => html`
              <button
                key=${tab.id}
                className=${`tab ${activeTab === tab.id ? "on" : ""}`}
                onClick=${() => onChange(tab.id)}
              >
                ${tab.icon} ${tab.label}
              </button>
            `,
          )}
        </div>
      </div>
    </div>
  `;
}
