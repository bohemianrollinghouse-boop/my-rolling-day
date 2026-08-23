// Navigation — barre d'onglets Ionic (mobile) et barre latérale (bureau).
//
// La barre du bas était entièrement recodée à la main : positionnement absolu,
// safe area, flou d'arrière-plan, badge, et un menu « Plus » avec son propre
// écouteur `document mousedown` pour se refermer. Tout ça est passé à Ionic :
// `ion-tab-bar` gère le placement et la safe area, `ion-badge` le compteur, et
// `ion-action-sheet` le menu (fermeture au tap dehors incluse).
//
// La barre latérale bureau (`SidebarNav`) a été supprimée en phase 6 : l'app
// cible iOS et Android, il n'y a pas de version ordinateur au programme. Si
// elle revient, la voie est `ion-split-pane` + `ion-menu`, pas un `<nav>`
// maison.

import { html } from "../../lib.js";
import { IonBadge, IonLabel, IonTabBar, IonTabButton } from "@ionic/react";
import { isPremiumTab } from "../../utils/premium.js";
import { QUICK_SCREENS, TAB_ROOTS, bottomIdForTab } from "../../routes.js";
import { IcoCal, IcoCheck, IcoFork, IcoHome, IcoPlus } from "./NavIcons.js";

/** Libellé et emoji des écrans du menu « Plus », dans l'ordre d'affichage. */
export const QUICK_MENU_ITEMS = [
  { id: "lists", label: "Listes", emoji: "🛒" },
  { id: "notes", label: "Notes", emoji: "📝" },
  { id: "inventory", label: "Inventaire", emoji: "🧺" },
  { id: "recipes", label: "Recettes", emoji: "📚" },
  { id: "history", label: "Historique", emoji: "📊" },
];

const NAV_TABS = [
  { id: "home", label: "Accueil", Icon: IcoHome },
  { id: "tasks", label: "Tâches", Icon: IcoCheck },
  { id: "agenda", label: "Agenda", Icon: IcoCal },
  { id: "meals", label: "Repas", Icon: IcoFork },
  { id: "quick", label: "Plus", Icon: IcoPlus },
];

/* Garde : le menu « Plus » doit lister exactement les écrans que
   `bottomIdForTab` renvoie sur « quick ». Les deux listes vivaient dans deux
   fichiers et avaient déjà divergé une fois. */
if (QUICK_MENU_ITEMS.length !== QUICK_SCREENS.length
  || QUICK_MENU_ITEMS.some((item) => !QUICK_SCREENS.includes(item.id))) {
  console.warn("[nav] QUICK_MENU_ITEMS et QUICK_SCREENS ont divergé", QUICK_MENU_ITEMS, QUICK_SCREENS);
}

/**
 * Barre d'onglets du bas.
 *
 * **Les boutons portent un `href`, et c'est essentiel.** Ils naviguaient par
 * `onClick` jusqu'ici, sur la foi d'un raisonnement faux : on croyait qu'un
 * `href` ramènerait toujours l'onglet Tâches à sa racine et ferait perdre la
 * période en cours. En réalité `IonTabBar.getDerivedStateFromProps` réécrit le
 * `currentHref` de l'onglet actif avec le chemin courant, et `changeTab()`
 * restaure ensuite la dernière route de l'onglet via
 * `locationHistory.getCurrentRouteInfoForTab()` — Ionic mémorise donc la
 * période tout seul.
 *
 * Le prix de l'erreur était lourd : sans `href`, `IonTabBar` ne peut rattacher
 * aucune route à un onglet, `changeTab()` n'est jamais appelé, et les dix
 * routes s'empilent dans **une seule** pile. Chaque passage d'un onglet à
 * l'autre ajoutait une entrée, au lieu de basculer entre quatre piles
 * indépendantes comme le fait Ionic (et comme le fait COBA).
 *
 * `selectedTab` reste passé explicitement : la route des tâches est paramétrée
 * (`/tasks/:period`) et le libellé de l'onglet actif suit `activeTab`, que
 * `App.js` dérive du chemin.
 *
 * Les icônes sont posées directement, sans `IonIcon` : ce composant attend une
 * prop `icon` / `src` pointant sur un jeu d'icônes, pas un SVG en enfant.
 *
 * @param {string} activeTab       écran courant, vocabulaire `activeTab`
 * @param {() => void} onOpenQuickMenu  ouvre la feuille d'actions « Plus »
 */
export function BottomNav({ activeTab, onOpenQuickMenu, overdueTaskCount = 0, isPremium = false }) {
  const selected = bottomIdForTab(activeTab);

  return html`
    <${IonTabBar} slot="bottom" selectedTab=${selected} className="mrd-ion-tabbar">
      ${/* « Plus » est le seul bouton sans `href` : Ionic appelle bien
             `changeTab("quick", undefined)`, mais `handleChangeTab` sort
             immédiatement sur `if (!path) return`. Aucune navigation, et
             `onClick` ouvre la feuille d'actions.
             (Ce commentaire vit hors du template : une interpolation en
             position d'attribut est lue par htm comme un objet de props.) */""}
      ${NAV_TABS.map(({ id, label, Icon }) => {
        const isOn = selected === id;
        const badge = id === "tasks" && overdueTaskCount > 0 ? overdueTaskCount : 0;
        const premiumLocked = isPremiumTab(id) && !isPremium;
        const isQuick = id === "quick";

        return html`
          <${IonTabButton}
            key=${id}
            tab=${id}
            href=${TAB_ROOTS[id]}
            selected=${isOn}
            aria-label=${badge ? `${label} — ${badge} en retard` : label}
            onClick=${isQuick ? () => onOpenQuickMenu() : undefined}
          >
            <span className="mrd-tab-icon" aria-hidden="true"><${Icon} active=${isOn} /></span>
            <${IonLabel}>${label}<//>
            ${badge ? html`<${IonBadge} color="danger">${badge > 9 ? "9+" : badge}<//>` : null}
            ${premiumLocked ? html`<span className="mrd-bnav-premium-star mrd-bnav-premium-star-tab" aria-hidden="true">⭐</span>` : null}
          <//>
        `;
      })}
    <//>
  `;
}
