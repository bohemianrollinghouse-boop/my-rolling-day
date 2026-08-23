# PROJECT_MAP

Read this file first in future sessions.

## Root

- `index.html`
  Static entry HTML. Loads `src/theme/styles.css` and `src/main.js` with cache-busting query params.
  Contient le spinner `.ldr` statique, le boot log (`window.__APP_BOOT_LOGS__`), et un timeout 8s
  qui affiche un écran d'erreur si React ne monte pas.
- `src/main.js`
  Boots the app, mounts `App`, exposes fatal boot errors via `window.__APP_BOOT_STATE__`.
- `src/app/App.js` (~1500 lignes)
  Main orchestrator. Navigation, top-level state wiring, cross-feature glue, toast handling, view
  selection. Contient aussi des helpers locaux de conversion quantité/unité et gestion localStorage
  qui n'ont pas encore été extraits vers utils/.
- `src/theme/styles.css`
  Global styles for the entire app.
- `src/app/lib.js`
  React 18 + HTM bridge. Exporte : `React`, `createRoot`, `useEffect`, `useMemo`, `useRef`,
  `useState`, `html`. Source : esm.sh CDN.
- `src/app/config/constants.js`
  Shared constants : `FIREBASE_CONFIG`, `FIREBASE_WEB_VAPID_KEY`, `DAYS`, `MEMBER_COLORS`
  (6 couleurs), `APP_VERSION`, `TABS` (11 onglets).

## Firebase / Config

- `src/app/providers/client.js` (~1220 lignes)
  Toute la logique Firebase Auth + Firestore. Voir ARCHITECTURE.md pour les collections.
- `src/app/providers/messaging.js`
  Firebase Cloud Messaging (FCM). Gère SW, token, permission, messages foreground.
  Exporte : `isPushMessagingSupported`, `getNotificationPermissionState`, `ensureMessagingServiceWorker`,
  `syncPushToken`, `clearPushToken`, `bindForegroundPushMessages`.
- `firebase-messaging-sw.js`
  Service Worker PWA pour les notifications push en arrière-plan. Doit rester à la racine.
- `firebase.json`
  Config Firebase CLI (hosting, functions).
- `.firebaserc`
  Projet Firebase : `my-rolling-day`.
- `firestore.rules`
  Règles de sécurité Firestore. Voir ARCHITECTURE.md section Rules.
- `manifest.json`
  PWA manifest (name, icons, theme_color, display: standalone).
- `functions/`
  Cloud Functions Node.js (~508 lignes). Gère notifications planifiées (toutes les 5 min),
  envoi FCM tokens, anti-spam. Fonctions : `onSchedule`, `onDocumentCreated`, `onDocumentUpdated`.

## Main folders

Structure inspirée du projet COBA (Ionic/Angular), adaptée à React + htm : tout
l'applicatif vit sous `src/app/`, la configuration d'environnement et le thème
restent à côté.

- `src/app/pages/<ecran>/`
  Un dossier par destination de route. Contient la vue et ses sous-composants
  propres (`recipes/` a `RecipesView`, `RecipeLibrary`, `RecipeSheet`,
  `CategoryIcons`, `VoiceCookingMode`).
- `src/app/components`
  Briques réutilisables qui ne sont pas des écrans : `Header`, `SegmentedTabs`,
  `FamilyPanel`, `FeedbackWidget`, `MrdModal` (enveloppe `ion-modal`), `nav/`,
  `settings/SettingsUI` (lignes, sections, interrupteurs des réglages, partagés
  entre les pages réglages et `SettingsModals`).
- `src/app/modals`
  Modales : `AppModals`, `SettingsModals`. L'enveloppe `ion-modal` elle-meme
  (`MrdModal`) vit dans `components/` : c'est une primitive reutilisee par les
  16 fichiers qui ouvrent une modale, pas une modale.
- `src/app/providers`
  Accès aux données — adaptateur Firebase Auth + Firestore (ex-`src/firebase`).
  Équivalent des `providers/*.service.ts` de COBA.
- `src/app/plugins`
  Enveloppes de plugins natifs Capacitor : `statusBar`, `notifications`.
- `src/app/config`
  Constantes de domaine et données statiques : jours, palettes, onglets,
  version, état par défaut, recettes de démo, catalogue de condiments.
- `src/app/hooks`
  Actions métier et mutations d'état. Spécifique React : pas d'équivalent COBA,
  Angular passe par l'injection de dépendances.
- `src/app/utils`
  Normalisation, dates, stockage, unités, dialogues, défilement.
- `src/app/{App,routes,lib}.js`
  Coquille applicative, table des routes, liaison React + htm.
- `src/environments/environment.js`
  Configuration Firebase et drapeaux de build. Voir le commentaire du fichier
  sur l'absence de jumeau `.prod.js`.
- `src/theme/`
  `styles.css` (CSS global, tokens `--mrd-*`) et `ionic-bridge.css`
  (branchement des variables `--ion-*` sur les tokens).
- `src/assets/`
  Marque (favicon, apple-touch-icon), polices, icônes SVG.
- `src/main.js`
  Point d'entrée : `setupIonicReact`, overlay d'erreur fatale, montage React.
- `tests`
  Tests unitaires, E2E (CDP) et captures d'écran de non-régression visuelle.
- `scripts`
  Génération de build-info, bump de version, préparation et envoi des releases.

## Racine : configuration

- `capacitor.config.ts`
  Config Capacitor en TypeScript (comme COBA). Lue par la CLI via la
  devDependency `typescript`, jamais embarquée dans le bundle.
- `ionic.config.json`
  Marqueur de projet Ionic (`type: react-vite`, intégration Capacitor).
- `tsconfig.json`
  Ne couvre que `capacitor.config.ts`. `allowJs` volontairement absent.
- `vite.config.js`
  Build web. `build.target` documente le plancher navigateur.
- `.editorconfig`
  Indentation et fins de ligne, y compris les exceptions Xcode et Gradle.

## Feature map

### Tasks

- View: `src/app/pages/tasks/TasksView.js`
- Shared task card: `src/app/pages/tasks/TaskCard.js`
- Emoji picker: `src/app/pages/tasks/EmojiPicker.js`
- Mutations: `src/app/hooks/useTasks.js`
- Notifications tâches : `src/app/hooks/useTaskNotifications.js`
- Normalization / reset / recurrence: `src/app/utils/state.js`
- Top tab navigation lives in: `src/app/App.js`

### Agenda

- View: `src/app/pages/agenda/AgendaView.js`
- Mutations: `src/app/hooks/useAgenda.js`
- Task-to-agenda derived planning map built in: `src/app/App.js`
- Agenda and recurring entries normalized in: `src/app/utils/state.js`

### Lists

- View: `src/app/pages/lists/ListsView.js`
- Mutations: `src/app/hooks/useLists.js`
- Shopping list default / dedupe / merge rules: `src/app/hooks/useLists.js`, `src/app/utils/state.js`

### Inventory

- View: `src/app/pages/inventory/InventoryView.js`
- Mutations: `src/app/hooks/useLists.js`
- Storage locations + product location memory:
  - `src/app/config/defaultState.js`
  - `src/app/hooks/useLists.js`

### Meals

- View: `src/app/pages/meals/MealsView.js`
- Mutations: `src/app/hooks/useMeals.js`
- Meal shells and recipe normalization helpers: `src/app/utils/state.js`
- Extra stock deduction / shopping sync glue still lives partly in: `src/app/App.js`

### Recipes

- View: `src/app/pages/recipes/RecipesView.js`
- Category icons: `src/app/pages/recipes/CategoryIcons.js`
- Mutations: `src/app/hooks/useMeals.js`
- Demo data: `src/app/config/demoRecipes.js`
- Condiment catalog: `src/app/config/condiments.js`
- Recipe normalization / migration: `src/app/utils/state.js`

### Settings

- View: `src/app/pages/settings/SettingsView.js` (~1826 lignes)
- Sous-pages : main, profile, household, notifications, appearance, account, privacy, help, about
- Sous-pages support (SupportView) : bug, feature, contact, privacy, terms
- Auth/family actions passed from: `src/app/App.js`
- Time simulation controls wired through: `src/app/utils/date.js`

### Auth & Onboarding

- Auth screen (connexion): `src/app/pages/auth/AuthScreen.js`
  Flux : welcome → login (email+password), signup, forgot-password. Google OAuth.
- Onboarding (création/rejoindre foyer): `src/app/pages/auth/OnboardingFlow.js` (~935 lignes)
  Flux CREATE : choose-household-mode → create-first-name → create-badge-color →
    create-household-name → create-add-members → [create-invite-members]
  Flux JOIN : join-invitation-code → join-confirm-household → join-profile-name →
    join-badge-color → join-done
  Flux EXISTING-PROFILE : existing-profile-name → existing-badge-color → existing-done
- Hook auth: `src/app/hooks/useAuth.js` (~828 lignes)

### Push Notifications

- Hook: `src/app/hooks/usePushMessaging.js` (~131 lignes)
- Firebase Messaging adapter: `src/app/providers/messaging.js`
- Task notifications (local Notification API): `src/app/hooks/useTaskNotifications.js` (~191 lignes)
- Cloud Functions (backend): `functions/index.js`

## Other views

- Home / shell dashboard: `src/app/pages/home/HomeView.js` (~534 lignes)
- Bottom nav: `src/app/components/nav/BottomNav.js`
  Onglets : home, tasks, agenda, meals, lists
- Notes: `src/app/pages/notes/NotesView.js`
- History: `src/app/pages/history/HistoryView.js`
- Feedback widget flottant: `src/app/components/FeedbackWidget.js`

## Shared UI

- `src/app/components/SegmentedTabs.js` — contrôle tab segmenté (utilisé dans App, Agenda, Lists)
- `src/app/pages/tasks/TaskCard.js` — carte tâche réutilisée dans Tasks et Agenda

## FICHIERS MORTS (ne pas utiliser)

- `src/app/components/FamilyPanel.js` — composant legacy jamais importé, remplacé par SettingsView
- `src/components/Tabs.js` — composant tab legacy jamais importé, remplacé par SegmentedTabs

## Tests

- Aggregators:
  - `tests/unit.test.js` — lance unit/product-utils, unit/date-utils, unit/state
  - `tests/e2e.test.js` — lance e2e/app.smoke, e2e/auth.standalone, e2e/profile-creation
- Unit coverage:
  - `tests/unit/state.test.js`
  - `tests/unit/product-utils.test.js`
  - `tests/unit/date-utils.test.js`
- E2E browser tests:
  - `tests/e2e/app.smoke.test.js` — vérification boot React + assets
  - `tests/e2e/auth.standalone.test.js` — logique PWA iOS standalone + DOM CDP
  - `tests/e2e/profile-creation.test.js` — flux complet création foyer (CDP + 17 tests purs)
- Browser/server helpers:
  - `tests/helpers/static-server.js`
  - `tests/helpers/cdp-browser.js`
  - `tests/helpers/browser-globals.js`
- Firebase stubs (pour CDP tests):
  - `tests/fixtures/firebase-stubs/firebase-app.js`
  - `tests/fixtures/firebase-stubs/firebase-auth.js`
  - `tests/fixtures/firebase-stubs/firebase-firestore.js`
  - `tests/fixtures/firebase-stubs/firebase-messaging.js`
  - `tests/fixtures/firebase-stubs/firebase-analytics.js`
  - `tests/fixtures/firebase-stubs/firebase-storage.js`
  - `tests/fixtures/firebase-stubs/firebase-functions.js`
