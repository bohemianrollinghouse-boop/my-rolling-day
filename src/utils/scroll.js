// Remonter le contenu de la page courante en haut.
//
// Le code visait `document.querySelector(".mrd-screen .cnt")` : deux sélecteurs
// qui ont disparu avec le passage à `ion-content` (phase 3 pour les écrans,
// phase 5 pour les réglages). Le retour en haut ne faisait donc plus rien —
// silencieusement, puisqu'un `querySelector` qui ne trouve rien ne lève pas.
//
// `ion-content` défile dans son shadow DOM : on passe par son API
// (`scrollToTop`) plutôt que par son élément de défilement.

/**
 * Remonte en haut le contenu de la page visible.
 *
 * @param {number} [durationMs] 0 = instantané. Ionic anime au-delà.
 */
export function scrollActivePageToTop(durationMs = 0) {
  // La page quittée reste montée le temps de la transition, marquée
  // `.ion-page-hidden` : viser le premier `ion-content` du document ramènerait
  // parfois l'ancienne page en haut au lieu de la nouvelle.
  const pages = [...document.querySelectorAll(".ion-page")]
    .filter((page) => !page.classList.contains("ion-page-hidden"));
  const scope = pages[pages.length - 1] || document;
  const content = scope.querySelector("ion-content");
  if (content?.scrollToTop) {
    content.scrollToTop(durationMs);
    return true;
  }
  // Repli : volet encore en `<div class="cnt">` (aucun aujourd'hui, mais le
  // repli évite de casser en silence si un écran reste en arrière).
  const legacy = scope.querySelector(".cnt");
  if (legacy?.scrollTo) {
    legacy.scrollTo({ top: 0, behavior: "auto" });
    return true;
  }
  return false;
}
