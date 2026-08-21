// Icônes de navigation — partagées par la barre d'onglets Ionic et la barre
// latérale bureau.
//
// Volontairement gardées en SVG maison plutôt que remplacées par `ionicons` :
// elles portent l'identité de l'app, et elles gèrent déjà leur état actif
// (épaisseur de trait et couleur). Ionic fournit la mécanique de la barre
// d'onglets, pas ses pictogrammes.

import { html } from "../../lib.js";

export function IcoHome({ active }) {
  const c = active ? "var(--mrd-a)" : "var(--mrd-fg3)";
  const sw = active ? "2.2" : "1.8";
  return html`
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M3 12L12 3l9 9" stroke=${c} stroke-width=${sw} stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9" stroke=${c} stroke-width=${sw} stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

export function IcoCheck({ active }) {
  const c = active ? "var(--mrd-a)" : "var(--mrd-fg3)";
  const sw = active ? "2.2" : "1.8";
  return html`
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke=${c} stroke-width=${sw}/>
      <path d="M8 12l3 3 5-5" stroke=${c} stroke-width=${sw} stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

export function IcoCal({ active }) {
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

export function IcoFork({ active }) {
  const c = active ? "var(--mrd-a)" : "var(--mrd-fg3)";
  const sw = active ? "2.2" : "1.8";
  return html`
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M3 2v7c0 1.1.9 2 2 2h2v11" stroke=${c} stroke-width=${sw} stroke-linecap="round"/>
      <path d="M3 2v4M7 2v4" stroke=${c} stroke-width=${sw} stroke-linecap="round"/>
      <path d="M17 2c0 0-2 2-2 5s2 5 2 5v8" stroke=${c} stroke-width=${sw} stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

export function IcoPlus({ active }) {
  const c = active ? "var(--mrd-a)" : "var(--mrd-fg3)";
  const sw = active ? "2.2" : "1.8";
  return html`
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke=${c} stroke-width=${sw} stroke-linecap="round"/>
    </svg>`;
}
