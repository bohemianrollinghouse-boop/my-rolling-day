// Onglets segmentés — enveloppe autour d'`ion-segment`.
//
// L'API de props est **volontairement inchangée** (`options`, `activeId`,
// `onChange`, `ariaLabel`, `rowClassName`, `tabsClassName`) : les 6 vues qui
// l'utilisent n'ont pas été touchées. Seul l'intérieur passe à Ionic, qui
// apporte le défilement horizontal, la sémantique de groupe d'onglets et
// l'indicateur animé — là où `.mrd-subtabs` gérait tout à la main.
//
// Le variant `stacked` (emoji au-dessus du libellé sur petit écran) est
// conservé : il ne vient pas d'Ionic, c'est une décision de design de l'app.

import { html } from "../lib.js";
import { IonSegment, IonSegmentButton, IonLabel } from "@ionic/react";

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
      <${IonSegment}
        className=${`mrd-subtabs${tabsClassName ? ` ${tabsClassName}` : ""}`}
        value=${activeId}
        aria-label=${ariaLabel}
        scrollable=${options.length > 3}
        onIonChange=${(event) => {
          const next = event.detail?.value;
          // Ionic émet aussi au montage : ne rien faire si rien ne change,
          // sinon on navigue au premier rendu de l'écran des tâches.
          if (next && next !== activeId) onChange(next);
        }}
      >
        ${options.map(({ id, label, emoji }) => html`
          <${IonSegmentButton}
            key=${id}
            value=${id}
            className=${`mrd-subtab-btn${emoji ? " stacked" : ""}`}
          >
            ${emoji ? html`<span className="mrd-subtab-emoji">${emoji}</span>` : null}
            <${IonLabel} className="mrd-subtab-lbl">${label}<//>
          <//>
        `)}
      <//>
    </div>
  `;
}
