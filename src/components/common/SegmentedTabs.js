import { html } from "../../lib.js";

export function SegmentedTabs({
  options = [],
  activeId = "",
  onChange = () => {},
  ariaLabel = "",
  rowClassName = "",
  tabsClassName = "",
}) {
  return html`
    <div className=${`mrd-segmented-row${rowClassName ? ` ${rowClassName}` : ""}`}>
      <div className=${`mrd-subtabs${tabsClassName ? ` ${tabsClassName}` : ""}`} role="tablist" aria-label=${ariaLabel}>
        ${options.map(({ id, label, emoji }) => html`
          <button
            key=${id}
            type="button"
            role="tab"
            aria-selected=${activeId === id ? "true" : "false"}
            className=${`mrd-subtab-btn${emoji ? " stacked" : ""}${activeId === id ? " on" : ""}`}
            onClick=${() => onChange(id)}
          >
            ${emoji ? html`<span className="mrd-subtab-emoji">${emoji}</span>` : null}
            <span className="mrd-subtab-lbl">${label}</span>
          </button>
        `)}
      </div>
    </div>
  `;
}
