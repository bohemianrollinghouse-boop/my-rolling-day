// Enveloppe unique pour toutes les modales de l'app.
//
// Avant, 16 fichiers recodaient le même overlay à la main : un
// `<div class="modal-backdrop" onClick=fermer>` contenant un
// `<div class="modal-card" onClick=stopPropagation>`, plus des keyframes
// maison (`mrdSlideUp`, `mrdFadeIn`) et, dans un cas, un verrou de défilement
// posé sur `document.documentElement.style.overflow`.
//
// `ion-modal` fournit tout ça : fond, fermeture au tap dehors, touche Échap,
// verrou de défilement, piège de focus, animation d'entrée ET de sortie, safe
// areas. Et, en mode feuille, la poignée et le glissement.
//
// Passer par une enveloppe plutôt que d'appeler `IonModal` sur 16 sites : les
// overlays maison avaient divergé (trois variantes de fond, deux d'animation),
// et une seule enveloppe garantit qu'ils ne redivergent pas.

import { html } from "../lib.js";
import { IonModal } from "@ionic/react";

/**
 * @param {boolean} isOpen
 * @param {() => void} onClose   appelé après l'animation de sortie
 *   (`onDidDismiss`), quelle que soit la façon de fermer : bouton, tap dehors,
 *   Échap, glissement, ou bouton retour matériel.
 * @param {string} [className]   classes de contenu conservées (`.mrd-mhd`,
 *   `.note-modal-card`…) — c'est l'intérieur qui garde le style maison.
 * @param {boolean} [sheet]      feuille basse glissable au lieu d'une boîte
 *   centrée. Pour les écrans qui occupaient déjà toute la hauteur (fiche
 *   recette, panneau des repas).
 * @param {boolean} [backdropDismiss]  false pour un formulaire en cours de
 *   saisie, où un tap à côté ne doit pas jeter le travail.
 * @param {number} [sheetBreakpoint]  hauteur d'ouverture de la feuille, en
 *   fraction de l'écran. 0.92 (défaut) pour les écrans pleine hauteur ; une
 *   valeur plus basse pour une feuille dimensionnée par son contenu, comme le
 *   choix de départ d'une recette.
 */
export function MrdModal({
  isOpen,
  onClose,
  className = "",
  sheet = false,
  sheetBreakpoint = 0.92,
  backdropDismiss = true,
  children,
}) {
  const classes = `mrd-modal${sheet ? " mrd-modal-sheet" : ""}${className ? ` ${className}` : ""}`;

  /* ── Le crochet `.mrd-shell` ───────────────────────────────────────────
     826 règles de `styles.css` sont préfixées `.mrd-shell …` — un choix
     ancien, fait pour gagner en spécificité. Or `ion-modal` se portale hors
     de la coque (vers `ion-app`) : `.mrd-shell` cesse d'être un ancêtre du
     contenu, et **tout le style intérieur des modales tombe**. Constaté à la
     première capture : formulaire sans marges, libellés en texte brut, bouton
     de fermeture en carré nu.

     On réintroduit donc la classe sur un conteneur interne, purement comme
     crochet de descendance. `.mrd-modal-inner` annule à côté ce que
     `.mrd-shell` porte en propre (safe area, fond, `overflow: hidden`) —
     sinon la coque se rejouerait dans la modale. */
  const inner = html`<div className="mrd-shell mrd-modal-inner">${children}</div>`;

  if (sheet) {
    return html`
      <${IonModal}
        isOpen=${Boolean(isOpen)}
        onDidDismiss=${onClose}
        className=${classes}
        backdropDismiss=${backdropDismiss}
        initialBreakpoint=${sheetBreakpoint}
        breakpoints=${sheetBreakpoint >= 1 ? [0, 1] : [0, sheetBreakpoint, 1]}
        handle=${true}
      >
        ${inner}
      <//>
    `;
  }

  return html`
    <${IonModal}
      isOpen=${Boolean(isOpen)}
      onDidDismiss=${onClose}
      className=${classes}
      backdropDismiss=${backdropDismiss}
    >
      ${inner}
    <//>
  `;
}
