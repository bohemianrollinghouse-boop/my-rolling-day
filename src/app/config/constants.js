// Constantes de l'application : jours, palettes, onglets, version.
//
// La configuration Firebase vit dans `src/environments/environment.js` :
// c'est de l'environnement, pas une constante de domaine.

export const DAYS = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];

export const MEMBER_COLORS = [
  "#D4607A",
  "#8B6040",
  "#5E7A6B",
  "#7A6B8B",
  "#C4734A",
  "#547AA5",
];

/* Repli quand un membre n'a pas encore de couleur assignée.
   Volontairement hors de MEMBER_COLORS : c'est un neutre, pas une
   identité — un membre sans couleur ne doit pas ressembler à un
   membre qui en a une. */
export const DEFAULT_MEMBER_COLOR = "#8B7355";

/* Palette arc-en-ciel des badges de membre : 8 teintes × 5 nuances
   (foncé → pâle). Délibérément hors du système de tokens --mrd-* :
   ce sont des couleurs d'identification choisies par l'utilisateur,
   pas des couleurs d'interface. Elles doivent rester distinctes les
   unes des autres, pas s'harmoniser avec l'accent. */
export const BADGE_PALETTE = [
  /* Rouge   */ ["#7F1D1D","#B91C1C","#DC2626","#F87171","#FECACA"],
  /* Orange  */ ["#7C2D12","#C2410C","#EA580C","#FB923C","#FED7AA"],
  /* Jaune   */ ["#713F12","#B45309","#D97706","#FCD34D","#FEF3C7"],
  /* Vert    */ ["#14532D","#166534","#16A34A","#4ADE80","#BBF7D0"],
  /* Cyan    */ ["#164E63","#0E7490","#06B6D4","#67E8F9","#CFFAFE"],
  /* Bleu    */ ["#1E3A5F","#1D4ED8","#3B82F6","#93C5FD","#DBEAFE"],
  /* Violet  */ ["#3B0764","#6D28D9","#7C3AED","#A78BFA","#EDE9FE"],
  /* Rose    */ ["#881337","#BE123C","#E11D48","#FB7185","#FECDD3"],
];

/* Pastille pré-sélectionnée quand on choisit sa couleur de badge.
   Doit appartenir à BADGE_PALETTE, sinon aucune pastille n'apparaît
   active dans la grille. Orange brûlé : proche du terracotta de la
   marque, et surtout PAS le rouge — le rouge est réservé à l'urgence
   et aux erreurs, l'utiliser en décoration brouille ce signal. */
export const DEFAULT_BADGE_COLOR = BADGE_PALETTE[1][1];

/* Couleur du chrome navigateur (<meta name="theme-color">) et de la
   barre de statut Android. Doivent être des hex littéraux : les API
   natives ne lisent pas les variables CSS. Ce sont les rendus exacts
   de --mrd-bg dans chaque thème — les changer ici sans changer le
   token (ou l'inverse) crée une bande de couleur en haut de l'écran. */
export const THEME_COLOR_LIGHT = "#FAF4ED";
export const THEME_COLOR_DARK = "#211A15";

export const APP_VERSION = "0.1.0 beta";

export const TABS = [
  { id: "mine", label: "Mes tâches", icon: "👤" },
  { id: "daily", label: "Aujourd’hui", icon: "☀️" },
  { id: "weekly", label: "Semaine", icon: "🗓️" },
  { id: "monthly", label: "Mois", icon: "📆" },
  { id: "agenda", label: "Calendrier", icon: "🗓️" },
  { id: "meals", label: "Repas", icon: "🍽️" },
  { id: "lists", label: "Listes", icon: "📋" },
  { id: "inventory", label: "Inventaire", icon: "🧺" },
  { id: "recipes", label: "Recettes", icon: "📚" },
  { id: "notes", label: "Notes", icon: "📝" },
  { id: "history", label: "Historique", icon: "📊" },
  { id: "inbox", label: "Pense-bête", icon: "📥" },
];
