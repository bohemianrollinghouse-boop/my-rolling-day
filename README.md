# My Rolling Day

Application familiale de planification du quotidien.

Le projet regroupe dans une seule interface :
- taches
- calendrier
- repas de la semaine
- recettes
- listes
- inventaire
- notes
- historique
- gestion de foyer via Firebase

## Emplacement du projet

Projet principal :
- `C:\Users\Myenn\Documents\Codex\2026-04-17-files-mentioned-by-the-user-code\planning-react`

Code source :
- `C:\Users\Myenn\Documents\Codex\2026-04-17-files-mentioned-by-the-user-code\planning-react\src`

Documentation agent :
- [AGENT.md](C:\Users\Myenn\Documents\Codex\2026-04-17-files-mentioned-by-the-user-code\planning-react\AGENT.md)

## Stack technique

- HTML + CSS + JavaScript
- Vite + npm (`npm run dev`, `npm run build` vers `dist/`)
- React 18 depuis npm, syntaxe HTM dans les composants
- Ionic (`@ionic/react` 9) pour la coque, la navigation et les overlays
- Capacitor 6 pour iOS / Android (`capacitor.config.ts`)
- Firebase Auth + Firestore depuis npm

Particularites importantes :
- pas de JSX — les composants ecrivent des templates ``html`...` ``
- **plus de suffixe `?v=...`** : cette regle de cache busting datait de l epoque
  sans bundler, elle est obsolete et ne doit pas etre reintroduite
- structure du code inspiree du projet COBA, voir `docs/ARCHITECTURE.md`

## Lancer l application

L application est une app statique servie par un serveur HTTP.

Exemple de lancement :

```bash
npx serve -l 3000 .
```

Configuration `.claude/launch.json` actuelle :
- port `3000`

URL locale :
- [http://localhost:3000/](http://localhost:3000/)

Alternative simple avec Python :

```bash
python -m http.server 3000
```

## Tests

Une base de tests unitaires et E2E smoke est en place.

### Suites disponibles

- `tests/unit`
- `tests/e2e`

### Lancement rapide sous Windows

```powershell
.\scripts\run-tests.ps1
.\scripts\run-tests.ps1 unit
.\scripts\run-tests.ps1 e2e
```

### Lancement via Node

Si `node` est disponible dans le `PATH` :

```bash
node --test --test-isolation=none tests/unit.test.js tests/e2e.test.js
node --test --test-isolation=none tests/unit.test.js
node --test --test-isolation=none tests/e2e.test.js
```

### Portee actuelle

- les tests unitaires couvrent les utilitaires metier critiques
- les tests E2E sont des smoke tests navigateur pour verifier que l application demarre sans ecran fatal

## Firebase

La logique Firebase se trouve surtout ici :
- `src/app/providers/` (adaptateur Auth + Firestore)
- `src/environments/environment.js` (cles et identifiants du projet)

Fonctions principales :
- connexion email / mot de passe
- connexion Google
- gestion du foyer
- membres
- invitations
- synchronisation Firestore

Si Google Auth ne fonctionne pas, verifier les domaines autorises dans Firebase Authentication.

## Architecture

### Entrees principales

- `index.html`
- `src/main.js`
- `src/app/App.js`

### Hooks metier

- `src/app/hooks/useAuth.js`
- `src/app/hooks/useTasks.js`
- `src/app/hooks/useLists.js`
- `src/app/hooks/useMeals.js`
- `src/app/hooks/useAgenda.js`
- `src/app/hooks/usePlannerSync.js`

### Composants principaux

- `src/app/pages/home/HomeView.js`
- `src/app/components/nav/BottomNav.js`
- `src/app/pages/tasks/TasksView.js`
- `src/app/pages/agenda/AgendaView.js`
- `src/app/pages/lists/ListsView.js`
- `src/app/pages/inventory/InventoryView.js`
- `src/app/pages/meals/MealsView.js`
- `src/app/pages/recipes/RecipesView.js`
- `src/app/pages/history/HistoryView.js`
- `src/app/pages/settings/SettingsView.js`

### Donnees / utilitaires

- `src/app/config/defaultState.js`
- `src/app/config/demoRecipes.js`
- `src/app/config/condiments.js`
- `src/app/utils/state.js`
- `src/app/utils/date.js`
- `src/app/utils/productUtils.js`
- `src/app/utils/storage.js`

## Fonctionnalites clefs

### Taches et calendrier

- taches `Aujourd hui / Semaine / Mois`
- planification calendrier
- liaison taches / calendrier
- simulation temporelle pour tester les echeances

### Repas et recettes

- recettes avec ingredients structures
- condiments separes
- badges alimentaires
- disponibilite par saison / mois
- nombre de personnes
- planification des repas
- liaison optionnelle repas / liste / inventaire

### Listes et inventaire

- liste de courses
- listes personnalisees
- liaison optionnelle avec l inventaire
- quantites et unites
- suggestions intelligentes de produits
- normalisation des noms pour limiter les doublons

### Memoire produit

Le projet contient une logique commune de reconnaissance produit entre :
- inventaire
- listes
- recettes

Le point central est :
- `src/app/utils/productUtils.js`

Objectif :
- detecter les produits deja connus
- proposer des suggestions
- limiter les doublons du type singulier / pluriel / accents / variations proches

## Etat global

L etat par defaut est cree ici :
- `src/app/config/defaultState.js`

On y trouve notamment :
- `tasks`
- `meals`
- `linkMealsToInventory`
- `recipes`
- `lists`
- `inventory`
- `notes`
- `history`
- `agenda`

## Conventions importantes

### Cache busting

Quand un module importe un autre fichier avec `?v=...`, penser a mettre a jour l import parent si besoin.

Sinon le navigateur peut continuer a charger une ancienne version.

### Date et temps

Le projet contient une logique de date simulee.

Eviter d ajouter des `new Date()` directement dans toutes les logiques metier sans verifier d abord :
- `src/app/utils/date.js`

### Normalisation

La normalisation centrale passe par :
- `src/app/utils/state.js`

Eviter de contourner cette couche pour les objets metier persistants.

## Prototype design

Le prototype design peut exister a part, par exemple sous forme d export HTML.

Il sert de reference visuelle seulement.

Il ne doit pas remplacer la structure actuelle du projet.

## Notes pour developpement

- `src/app/App.js` reste un gros point d orchestration
- `src/app/hooks/useLists.js` est une zone sensible
- `src/app/pages/meals/MealsView.js` et `src/app/pages/recipes/RecipesView.js` sont sensibles pour les flux repas / recettes / inventaire
- certaines versions de fichiers peuvent contenir des suffixes `?v=...` heterogenes

## Conseil pratique

Avant une grosse modification :
1. lire `AGENT.md`
2. identifier le hook ou composant reellement responsable du flux
3. modifier localement
4. verifier les imports versionnes relies
