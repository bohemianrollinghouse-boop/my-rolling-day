# PROJECT_MAP

Read this file first in future sessions.

## Root

- `index.html`
  Static entry HTML. Loads `src/styles.css` and `src/main.js` with cache-busting query params.
  Contient le spinner `.ldr` statique, le boot log (`window.__APP_BOOT_LOGS__`), et un timeout 8s
  qui affiche un écran d'erreur si React ne monte pas.
- `src/main.js`
  Boots the app, mounts `App`, exposes fatal boot errors via `window.__APP_BOOT_STATE__`.
- `src/App.js` (~1500 lignes)
  Main orchestrator. Navigation, top-level state wiring, cross-feature glue, toast handling, view
  selection. Contient aussi des helpers locaux de conversion quantité/unité et gestion localStorage
  qui n'ont pas encore été extraits vers utils/.
- `src/styles.css`
  Global styles for the entire app.
- `src/lib.js`
  React 18 + HTM bridge. Exporte : `React`, `createRoot`, `useEffect`, `useMemo`, `useRef`,
  `useState`, `html`. Source : esm.sh CDN.
- `src/constants.js`
  Shared constants : `FIREBASE_CONFIG`, `FIREBASE_WEB_VAPID_KEY`, `DAYS`, `MEMBER_COLORS`
  (6 couleurs), `APP_VERSION`, `TABS` (11 onglets).

## Firebase / Config

- `src/firebase/client.js` (~1220 lignes)
  Toute la logique Firebase Auth + Firestore. Voir ARCHITECTURE.md pour les collections.
- `src/firebase/messaging.js`
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

- `src/components`
  UI views and reusable pieces.
- `src/hooks`
  Feature actions and state mutation logic.
- `src/utils`
  Normalization, time, storage parsing, product memory.
- `src/data`
  Default state, demo recipes, condiment catalog.
- `src/firebase`
  Firebase auth + Firestore adapter.
- `src/assets/`
  Brand assets (favicon, apple-touch-icon) et icônes SVG.
- `tests`
  Unit tests and E2E tests.
- `scripts`
  Test runner helpers.

## Feature map

### Tasks

- View: `src/components/tasks/TasksView.js`
- Shared task card: `src/components/tasks/TaskCard.js`
- Emoji picker: `src/components/tasks/EmojiPicker.js`
- Mutations: `src/hooks/useTasks.js`
- Notifications tâches : `src/hooks/useTaskNotifications.js`
- Normalization / reset / recurrence: `src/utils/state.js`
- Top tab navigation lives in: `src/App.js`

### Agenda

- View: `src/components/agenda/AgendaView.js`
- Mutations: `src/hooks/useAgenda.js`
- Task-to-agenda derived planning map built in: `src/App.js`
- Agenda and recurring entries normalized in: `src/utils/state.js`

### Lists

- View: `src/components/lists/ListsView.js`
- Mutations: `src/hooks/useLists.js`
- Shopping list default / dedupe / merge rules: `src/hooks/useLists.js`, `src/utils/state.js`

### Inventory

- View: `src/components/inventory/InventoryView.js`
- Mutations: `src/hooks/useLists.js`
- Storage locations + product location memory:
  - `src/data/defaultState.js`
  - `src/hooks/useLists.js`

### Meals

- View: `src/components/meals/MealsView.js`
- Mutations: `src/hooks/useMeals.js`
- Meal shells and recipe normalization helpers: `src/utils/state.js`
- Extra stock deduction / shopping sync glue still lives partly in: `src/App.js`

### Recipes

- View: `src/components/recipes/RecipesView.js`
- Category icons: `src/components/recipes/CategoryIcons.js`
- Mutations: `src/hooks/useMeals.js`
- Demo data: `src/data/demoRecipes.js`
- Condiment catalog: `src/data/condiments.js`
- Recipe normalization / migration: `src/utils/state.js`

### Settings

- View: `src/components/settings/SettingsView.js` (~1826 lignes)
- Sous-pages : main, profile, household, notifications, appearance, account, privacy, help, about
- Sous-pages support (SupportView) : bug, feature, contact, privacy, terms
- Auth/family actions passed from: `src/App.js`
- Time simulation controls wired through: `src/utils/date.js`

### Auth & Onboarding

- Auth screen (connexion): `src/components/auth/AuthScreen.js`
  Flux : welcome → login (email+password), signup, forgot-password. Google OAuth.
- Onboarding (création/rejoindre foyer): `src/components/auth/OnboardingFlow.js` (~935 lignes)
  Flux CREATE : choose-household-mode → create-first-name → create-badge-color →
    create-household-name → create-add-members → [create-invite-members]
  Flux JOIN : join-invitation-code → join-confirm-household → join-profile-name →
    join-badge-color → join-done
  Flux EXISTING-PROFILE : existing-profile-name → existing-badge-color → existing-done
- Hook auth: `src/hooks/useAuth.js` (~828 lignes)

### Push Notifications

- Hook: `src/hooks/usePushMessaging.js` (~131 lignes)
- Firebase Messaging adapter: `src/firebase/messaging.js`
- Task notifications (local Notification API): `src/hooks/useTaskNotifications.js` (~191 lignes)
- Cloud Functions (backend): `functions/index.js`

## Other views

- Home / shell dashboard: `src/components/home/HomeView.js` (~534 lignes)
- Bottom nav: `src/components/nav/BottomNav.js`
  Onglets : home, tasks, agenda, meals, lists
- Notes: `src/components/notes/NotesView.js`
- History: `src/components/history/HistoryView.js`
- Feedback widget flottant: `src/components/feedback/FeedbackWidget.js`

## Shared UI

- `src/components/common/SegmentedTabs.js` — contrôle tab segmenté (utilisé dans App, Agenda, Lists)
- `src/components/tasks/TaskCard.js` — carte tâche réutilisée dans Tasks et Agenda

## FICHIERS MORTS (ne pas utiliser)

- `src/components/family/FamilyPanel.js` — composant legacy jamais importé, remplacé par SettingsView
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
