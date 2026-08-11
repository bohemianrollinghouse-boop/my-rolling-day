import { html } from "../../lib.js";
import entreeIcon from "../../assets/icons/entree.svg";
import platIcon from "../../assets/icons/plat.svg";
import dessertIcon from "../../assets/icons/dessert.svg";
import petitDejeunerIcon from "../../assets/icons/petit-dejeuner.svg";
import boissonIcon from "../../assets/icons/boisson.svg";
import faitMaisonIcon from "../../assets/icons/fait-maison.svg";

const CATEGORY_CONFIG = {
  starter:   { color: "var(--recipe-cat-starter)", bg: "var(--recipe-cat-starter-bg)", src: entreeIcon },
  main:      { color: "var(--recipe-cat-main)", bg: "var(--recipe-cat-main-bg)", src: platIcon },
  dessert:   { color: "var(--recipe-cat-dessert)", bg: "var(--recipe-cat-dessert-bg)", src: dessertIcon },
  breakfast: { color: "var(--recipe-cat-breakfast)", bg: "var(--recipe-cat-breakfast-bg)", src: petitDejeunerIcon },
  drink:     { color: "var(--recipe-cat-drink)", bg: "var(--recipe-cat-drink-bg)", src: boissonIcon },
  base:      { color: "var(--recipe-cat-base)", bg: "var(--recipe-cat-base-bg)", src: faitMaisonIcon },
};

function maskedIconStyle(src, size, color) {
  return {
    width: `${size}px`,
    height: `${size}px`,
    minWidth: `${size}px`,
    display: "block",
    flexShrink: 0,
    background: color,
    // Guillemets OBLIGATOIRES : Vite inline ces SVG en data URI contenant des
    // apostrophes — sans guillemets la propriété est invalide et le masque
    // saute (symptôme : carré de couleur pleine à la place de l'icône).
    WebkitMaskImage: `url("${src}")`,
    WebkitMaskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    WebkitMaskSize: "contain",
    maskImage: `url("${src}")`,
    maskRepeat: "no-repeat",
    maskPosition: "center",
    maskSize: "contain",
  };
}

export function categoryToneClass(categoryId) {
  return categoryId ? `recipe-category--${categoryId}` : "";
}

export function CategoryIcon({ categoryId, size, framed = true }) {
  const sz = size || 56;
  const cfg = CATEGORY_CONFIG[categoryId];

  if (!cfg) {
    return html`<span style=${{
      width: `${sz}px`,
      height: `${sz}px`,
      minWidth: `${sz}px`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "var(--mrd-fg3)",
      fontSize: `${Math.round(sz * 0.46)}px`,
      lineHeight: 1,
      flexShrink: 0,
    }}>?</span>`;
  }

  if (!framed) {
    return html`
      <span
        aria-hidden="true"
        style=${maskedIconStyle(cfg.src, sz, cfg.color)}
      ></span>
    `;
  }

  const pad = Math.round(sz * 0.16);
  const inner = sz - pad * 2;

  return html`
    <div style=${{
      width: `${sz}px`,
      height: `${sz}px`,
      minWidth: `${sz}px`,
      borderRadius: `${Math.round(sz * 0.32)}px`,
      background: cfg.bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    }}>
      <span
        aria-hidden="true"
        style=${maskedIconStyle(cfg.src, inner, cfg.color)}
      ></span>
    </div>
  `;
}
