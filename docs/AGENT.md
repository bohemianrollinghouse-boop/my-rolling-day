# Agent Guide

## Projet

My Rolling Day est une application familiale de planification en francais.

Le prototype design se trouve a part et ne doit pas remplacer cette base.

## Stack technique

- Vite + npm (bundler ; `npm run dev`, `npm run build`)
- React 18 via npm, syntaxe HTM dans les composants
- Firebase Auth + Firestore via npm
- Capacitor 6 (iOS / Android), config dans `capacitor.config.ts`
- CSS global dans `src/theme/styles.css`, tokens `--mrd-*`
- config Firebase dans `src/environments/environment.js`

Points importants :
- pas de JSX — les composants ecrivent des templates ``html`...` ``
- les imports sont des imports npm nus, resolus par Vite
- **plus de suffixe `?v=...`** : la regle de cache busting datait de l epoque
  sans bundler, elle est obsolete et ne doit pas etre reintroduite
- migration Ionic en cours : voir `docs/MIGRATION_IONIC.md` avant de toucher
  a la navigation, a la coque d ecran ou aux overlays

## Entrees principales

- `index.html`
- `src/main.js`
- `src/app/App.js`

`App.js` reste l orchestrateur principal.

## Organisation du code

Structure inspiree du projet COBA (voir `docs/ARCHITECTURE.md`) : tout
l applicatif est sous `src/app/`.

- `src/app/pages/<ecran>/` — une destination de route
- `src/app/components/` — briques reutilisables non-ecrans
- `src/app/modals/` — modales
- `src/app/providers/` — acces aux donnees (Firebase)
- `src/app/plugins/` — enveloppes de plugins natifs
- `src/app/config/` — constantes et donnees statiques
- `src/app/hooks/` — actions metier
- `src/app/utils/` — utilitaires purs

### Hooks metier

- `src/app/hooks/useAuth.js`
- `src/app/hooks/useTasks.js`
- `src/app/hooks/useLists.js`
- `src/app/hooks/useMeals.js`
- `src/app/hooks/useAgenda.js`
- `src/app/hooks/usePlannerSync.js`

### Vues principales

- `src/app/pages/home/HomeView.js`
- `src/app/components/nav/BottomNav.js`
- `src/app/pages/tasks/TasksView.js`
- `src/app/pages/agenda/AgendaView.js`
- `src/app/pages/lists/ListsView.js`
- `src/app/pages/inventory/InventoryView.js`
- `src/app/pages/meals/MealsView.js` (grille semaine)
- `src/app/pages/meals/RecipePicker.js` (selecteur de recette d un creneau)
- `src/app/pages/recipes/RecipesView.js` (fiche + formulaire de recette)
- `src/app/pages/recipes/RecipeLibrary.js` (bibliotheque : recherche, filtres, cartes)
- `src/app/pages/history/HistoryView.js`
- `src/app/pages/settings/SettingsView.js`

### Etat / utilitaires

- `src/app/config/defaultState.js`
- `src/app/config/demoRecipes.js`
- `src/app/config/condiments.js`
- `src/app/utils/state.js`
- `src/app/utils/date.js`
- `src/app/utils/productUtils.js`
- `src/app/utils/storage.js`
- `src/app/utils/recipeStock.js` (comparaison recettes / inventaire, faisabilite semaine)
- `src/app/utils/units.js` (conversion des unites, cle produit, somme de quantites)
- `src/app/utils/recipeFilters.js` (saison, duree, regime, contraintes)
- `src/app/utils/mealFill.js` (tirage automatique de la semaine)

## Regles produit a respecter

### Taches / calendrier

- une tache a une rubrique d origine
- le calendrier peut afficher une tache planifiee sans devenir la source de verite
- depuis le calendrier, retirer un bloc ne doit pas supprimer automatiquement la tache complete
- la suppression totale d une tache doit nettoyer ses liens calendrier

### Listes / inventaire

- la liaison inventaire doit rester optionnelle
- la liste de courses peut etre utilisee seule
- quand la liaison est activee, un achat peut mettre a jour l inventaire
- les produits proches doivent etre normalises pour eviter les doublons
- les memes produits doivent etre fusionnes avec prudence, sans fusion agressive
- une fusion doit convertir les unites avant d additionner, et refuser la fusion
  quand les unites ne mesurent pas la meme chose : deux lignes valent mieux
  qu un total faux (`addStockQuantities` dans `utils/units.js`)

### Recettes / repas / inventaire

- une recette contient :
  - `ingredients` structures
  - `condiments` separes
  - disponibilite saison / mois
  - badges alimentaires
  - nombre de personnes
- les condiments ne doivent jamais etre deduits automatiquement du stock
- si la liaison repas est desactivee :
  - pas de comparaison inventaire
  - pas de popup ingredients manquants
  - pas de suggestion liste de courses
- si la liaison repas est activee :
  - comparaison inventaire
  - popup ingredients manquants
  - ajout possible a la liste de courses
  - deduction inventaire lors du passage a `OK` pour les ingredients principaux seulement
  - dans le choix d une recette : badge faisable / nombre de manquants, filtre
    "faisable avec mon stock", tri des faisables en tete, et suggestions
    anti-gaspi pour les DLC proches
- la comparaison et la deduction doivent rapprocher les produits de la meme
  facon : meme cle produit, memes conversions d unites (`utils/units.js`)
- la faisabilite affichee dans la grille Repas se lit a l echelle de la semaine
  et non recette par recette : le stock est un budget que les creneaux
  consomment dans l ordre chronologique (`computeWeekStock`). Deux repas qui
  veulent le meme produit ne peuvent pas se declarer faisables tous les deux.
  Les creneaux deja cuisines sont exclus du calcul, leurs ingredients ayant
  deja quitte le stock
- une deduction partielle ne doit jamais passer pour complete : si le stock ne
  couvre pas tout, le message le nomme
- une recette sans ingredients structures n est ni faisable ni manquante : elle
  n est pas comparable au stock

## Structures importantes deja en place

### Memoire produit commune

Le projet a deja une logique de memoire produit qui sert a reutiliser des noms connus entre :
- inventaire
- listes
- ingredients des recettes

Le point central est `src/app/utils/productUtils.js`.

Eviter de reintroduire des comparaisons basees seulement sur le texte brut.

### Normalisation globale

Toute mutation importante passe idealement par la normalisation dans :
- `src/app/utils/state.js`

Ce fichier contient des migrations de compatibilite et des corrections structurelles.

### Simulation temporelle

Le projet contient un mode de date simulee.

Reference :
- `src/app/utils/date.js`

Eviter d ajouter de nouveaux `new Date()` directs dans les logiques critiques sans passer par les helpers deja en place.

## Zones sensibles

### `src/app/hooks/useLists.js`

Zone tres sensible.

Ce hook gere notamment :
- liste de courses
- liaison inventaire
- fusion des articles proches
- retour quantite a zero une fois achete
- prevention de doubles clics / doubles validations

Toute modification ici doit etre relue avec attention.

### `src/app/pages/meals/MealsView.js`

Zone sensible pour :
- liaison repas / inventaire
- popup des ingredients manquants
- affichage detail recette
- etat `Prep` / `OK`

### `src/app/pages/recipes/RecipesView.js`

Zone sensible pour :
- creation / modification de recette
- ingredients structures
- condiments
- disponibilites saisonnieres
- badges alimentaires

### `src/app/App.js`

Tres gros fichier.

Il contient encore :
- orchestration des vues
- une partie de la logique de deduction de stock
- la navigation generale
- des imports versionnes nombreux

Ne pas faire de gros changements ici sans verifier les dependances reliees.

## Etat actuel notable

- un redesign de shell mobile a commence avec `HomeView` et `BottomNav`
- le reste de l application garde encore une structure historique
- il existe des suffixes de version melanges dans les imports
- certains fichiers contiennent encore des artefacts d encodage

## Conseils de travail

- privilegier des corrections ciblees
- ne pas remplacer la structure actuelle par le prototype design
- reutiliser les composants et hooks existants avant d en creer de nouveaux
- garder les libelles utilisateur en francais
- tester mentalement les flux :
  - recette -> repas -> liste
  - liste -> inventaire
  - inventaire -> a racheter
  - tache -> calendrier

## Si tu touches au cache busting

Quand une correction concerne un module importe avec `?v=...` :
- mettre a jour l import du parent pertinent
- verifier `src/main.js` et `index.html` si necessaire

Sinon le navigateur peut charger une ancienne version et produire un faux bug.

## Ce qu il ne faut pas casser

- Auth Firebase
- synchronisation Firestore
- logique de famille / profils
- mode simple vs mode avance pour repas et listes
- historique
- simulation temporelle
- prevention des doublons produits

## Priorite pour les futurs agents

1. Comprendre le flux concerne avant de modifier.
2. Corriger petit et local.
3. Respecter les structures deja en place.
4. Eviter les regressions sur les liaisons entre modules.
