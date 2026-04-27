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
        ${options.map(({ id, label }) => html`
          <button
            key=${id}
            type="button"
            role="tab"
            aria-selected=${activeId === id ? "true" : "false"}
            className=${`mrd-subtab-btn${activeId === id ? " on" : ""}`}
            onClick=${() => onChange(id)}
          >
            ${label}
          </button>
        `)}
      </div>
    </div>
  `;
}
