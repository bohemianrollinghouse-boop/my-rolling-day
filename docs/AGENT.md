# Agent Guide

## Projet

My Rolling Day est une application familiale de planification en francais.

Le vrai projet actif est ici :
- `C:\Users\Myenn\Documents\Codex\2026-04-17-files-mentioned-by-the-user-code\planning-react`

Le prototype design se trouve a part et ne doit pas remplacer cette base.

## Stack technique

- Frontend sans build complexe
- Modules ES natifs
- React 18 via CDN
- Syntaxe HTM dans les composants
- Firebase Auth + Firestore
- CSS global dans `src/styles.css`

Points importants :
- pas de JSX
- pas de `package.json` visible dans ce dossier
- beaucoup d imports utilisent un suffixe `?v=...` pour le cache busting
- si un module change, penser a verifier les imports versionnes relies

## Entrees principales

- `index.html`
- `src/main.js`
- `src/App.js`

`App.js` reste l orchestrateur principal.

## Organisation du code

### Hooks metier

- `src/hooks/useAuth.js`
- `src/hooks/useTasks.js`
- `src/hooks/useLists.js`
- `src/hooks/useMeals.js`
- `src/hooks/useAgenda.js`
- `src/hooks/usePlannerSync.js`

### Vues principales

- `src/components/home/HomeView.js`
- `src/components/nav/BottomNav.js`
- `src/components/tasks/TasksView.js`
- `src/components/agenda/AgendaView.js`
- `src/components/lists/ListsView.js`
- `src/components/inventory/InventoryView.js`
- `src/components/meals/MealsView.js`
- `src/components/recipes/RecipesView.js`
- `src/components/history/HistoryView.js`
- `src/components/settings/SettingsView.js`

### Etat / utilitaires

- `src/data/defaultState.js`
- `src/data/demoRecipes.js`
- `src/data/condiments.js`
- `src/utils/state.js`
- `src/utils/date.js`
- `src/utils/productUtils.js`
- `src/utils/storage.js`

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

## Structures importantes deja en place

### Memoire produit commune

Le projet a deja une logique de memoire produit qui sert a reutiliser des noms connus entre :
- inventaire
- listes
- ingredients des recettes

Le point central est `src/utils/productUtils.js`.

Eviter de reintroduire des comparaisons basees seulement sur le texte brut.

### Normalisation globale

Toute mutation importante passe idealement par la normalisation dans :
- `src/utils/state.js`

Ce fichier contient des migrations de compatibilite et des corrections structurelles.

### Simulation temporelle

Le projet contient un mode de date simulee.

Reference :
- `src/utils/date.js`

Eviter d ajouter de nouveaux `new Date()` directs dans les logiques critiques sans passer par les helpers deja en place.

## Zones sensibles

### `src/hooks/useLists.js`

Zone tres sensible.

Ce hook gere notamment :
- liste de courses
- liaison inventaire
- fusion des articles proches
- retour quantite a zero une fois achete
- prevention de doubles clics / doubles validations

Toute modification ici doit etre relue avec attention.

### `src/components/meals/MealsView.js`

Zone sensible pour :
- liaison repas / inventaire
- popup des ingredients manquants
- affichage detail recette
- etat `Prep` / `OK`

### `src/components/recipes/RecipesView.js`

Zone sensible pour :
- creation / modification de recette
- ingredients structures
- condiments
- disponibilites saisonnieres
- badges alimentaires

### `src/App.js`

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
