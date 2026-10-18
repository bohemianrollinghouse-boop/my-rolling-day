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

import { html, useEffect, useMemo, useRef, useState } from "../lib.js";
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
 *   choix de départ d'une recette. Peut changer feuille ouverte : la feuille
 *   se recale alors sur la nouvelle hauteur (voir plus bas).
 * @param {number[]} [sheetBreakpoints]  toutes les hauteurs que
 *   `sheetBreakpoint` est susceptible de prendre pendant la vie de la
 *   feuille. `ion-modal` fige sa liste de paliers à la présentation : une
 *   hauteur absente de cette liste ne peut plus être atteinte ensuite. À
 *   passer donc dès qu'une feuille change de taille en route.
 */
export function MrdModal({
  isOpen,
  onClose,
  className = "",
  sheet = false,
  sheetBreakpoint = 0.92,
  sheetBreakpoints = null,
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
  /* ── La hauteur du contenu d'une feuille ──────────────────────
     En mode feuille, `ion-modal` reste haut comme l'écran et se translate
     vers le bas jusqu'au point d'ouverture. Le contenu, lui, héritait du
     `height: 100%` de `.mrd-modal-inner` : il débordait donc sous l'écran
     d'exactement la part masquée. À 0.88, les 12 % perdus emportaient le
     pied collé en bas de 7c — le bouton « Importer » était invisible et
     intouchable tant qu'on n'avait pas deviné qu'il fallait tirer la
     feuille vers le haut.

     On borne donc le contenu au point d'ouverture courant — glissement
     compris, sinon tirer la feuille vers le haut laisserait une bande vide
     sous le pied. */
  const [openBreakpoint, setOpenBreakpoint] = useState(sheetBreakpoint);
  useEffect(() => {
    if (isOpen) setOpenBreakpoint(sheetBreakpoint);
  }, [isOpen, sheetBreakpoint]);

  /* ── Une feuille qui change de taille en route ────────────────
     `initialBreakpoint` et `breakpoints` ne sont lus qu'à la présentation :
     rendre à nouveau avec une autre valeur ne bouge pas une feuille déjà
     ouverte — le contenu rétrécissait sans que la feuille descende. Le
     recalage passe donc par la méthode impérative, et la liste des paliers
     doit contenir d'avance toutes les hauteurs visées. */
  const modalRef = useRef(null);
  const appliedRef = useRef(sheetBreakpoint);
  const stops = useMemo(() => {
    const wanted = sheetBreakpoints && sheetBreakpoints.length ? sheetBreakpoints : [sheetBreakpoint];
    const list = [0, ...wanted, 1].filter((v) => Number.isFinite(v) && v >= 0 && v <= 1);
    return [...new Set(list)].sort((a, b) => a - b);
    // Dépendance volontairement réduite à `isOpen` : la liste n'a de sens
    // qu'au moment de la présentation, et la recalculer ensuite ne changerait
    // rien côté Ionic tout en faisant croire le contraire à la lecture.
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sheet || !isOpen) { appliedRef.current = sheetBreakpoint; return; }
    if (appliedRef.current === sheetBreakpoint) return;
    const modal = modalRef.current;
    if (!modal || typeof modal.setCurrentBreakpoint !== "function") return;
    appliedRef.current = sheetBreakpoint;
    modal.setCurrentBreakpoint(sheetBreakpoint);
  }, [sheet, isOpen, sheetBreakpoint]);

  const inner = html`<div className="mrd-shell mrd-modal-inner">${children}</div>`;

  if (sheet) {
    const sheetInner = html`
      <div className="mrd-shell mrd-modal-inner"
        style=${{ "--sheet-fill": `${Math.min(100, openBreakpoint * 100)}%` }}>
        ${children}
      </div>
    `;
    return html`
      <${IonModal}
        ref=${modalRef}
        isOpen=${Boolean(isOpen)}
        onDidDismiss=${onClose}
        onIonBreakpointDidChange=${(event) => {
          const next = Number(event?.detail?.breakpoint);
          if (next > 0) { appliedRef.current = next; setOpenBreakpoint(next); }
        }}
        className=${classes}
        backdropDismiss=${backdropDismiss}
        initialBreakpoint=${sheetBreakpoint}
        breakpoints=${stops}
        handle=${true}
      >
        ${sheetInner}
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
