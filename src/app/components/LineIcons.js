// Pictogrammes de contenu — le pendant de `nav/NavIcons.js` pour l'intérieur
// des écrans.
//
// Les modales et les feuilles portaient jusqu'ici des emoji (🔗, ✏️, 🔔, 🔁,
// ⏳…). Un emoji est rendu par la police système : sa couleur, sa graisse et
// son cadrage échappent au thème, et deux plateformes ne dessinent pas le même
// dessin. Les maquettes de la refonte (7b, 7c, 8a, 8b) les remplacent par des
// traits — même grammaire que la barre d'onglets : grille 24, `fill: none`,
// trait 1.8, extrémités rondes, et `currentColor` pour que la teinte vienne du
// conteneur (tuile ambre, ligne grise, bouton plein).

import { html } from "../lib.js";

/* Chaque entrée ne décrit que l'intérieur du `<svg>` : la taille et la couleur
   sont posées au moment du rendu. */
const GLYPHS = {
  /* Un maillon de chaîne — « importer un lien » (7b) et le champ URL (7c). */
  link: html`
    <path d="M9.6 14.4 14.4 9.6" />
    <path d="M7.9 12.1 6.2 13.8a4 4 0 105.6 5.6l1.7-1.7" />
    <path d="M16.1 11.9l1.7-1.7a4 4 0 10-5.6-5.6l-1.7 1.7" />
  `,
  /* Un crayon sur sa ligne — « créer à la main » (7b). */
  pencil: html`
    <path d="M14.6 5.2l4.2 4.2" />
    <path d="M16.7 3.1a2.3 2.3 0 013.2 3.2L8.4 17.8l-4.2 1 1-4.2z" />
    <path d="M4.5 21h15" />
  `,
  /* Une cloche — le rappel de fin de journée (8a). */
  bell: html`
    <path d="M7 10.5a5 5 0 0110 0c0 4 1.6 5.6 1.6 5.6H5.4S7 14.5 7 10.5z" />
    <path d="M10.2 18.6a2 2 0 003.6 0" />
  `,
  /* Un cadran — l'échéance (8a). */
  clock: html`
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.6V12l3 1.8" />
  `,
  /* Une grille de mois — l'agenda (8a) et la relance mensuelle (8b). */
  calendar: html`
    <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
    <path d="M3.5 9.8h17M8.5 3v4M15.5 3v4" />
    <circle cx="8.6" cy="14" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="14" r="1" fill="currentColor" stroke="none" />
    <circle cx="15.4" cy="14" r="1" fill="currentColor" stroke="none" />
  `,
  /* Un sablier — la relance hebdomadaire (8b). */
  hourglass: html`
    <path d="M6.5 3.5h11M6.5 20.5h11" />
    <path d="M8 3.5v3.2c0 2 4 3.6 4 5.3s-4 3.3-4 5.3v3.2" />
    <path d="M16 3.5v3.2c0 2-4 3.6-4 5.3s4 3.3 4 5.3v3.2" />
  `,
  /* Deux flèches qui bouclent — la tâche récurrente (8b). */
  repeat: html`
    <path d="M4.5 12a7.5 7.5 0 0112.6-5.5" />
    <path d="M19.5 12a7.5 7.5 0 01-12.6 5.5" />
    <path d="M17.4 3.2v3.5h-3.5" />
    <path d="M6.6 20.8v-3.5h3.5" />
  `,
  /* Une liste cochée — la vignette de tâche dans la relance (8b). */
  checklist: html`
    <path d="M4 7.2l1.8 1.8L9 5.8" />
    <path d="M4 16.2L5.8 18 9 14.8" />
    <path d="M12 7.5h8M12 16.5h8" />
  `,
};

/**
 * @param {string} name   clé de `GLYPHS`
 * @param {number} [size] côté du carré, en px (le trait ne change pas)
 */
export function LineIcon({ name, size = 18 }) {
  const glyph = GLYPHS[name];
  if (!glyph) return null;
  return html`
    <svg
      width=${size}
      height=${size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      ${glyph}
    </svg>
  `;
}
