# ARCHITECTURE

Read this file before touching feature code.

## Runtime model

- **Vite + npm** (bundler depuis le commit `201c442`). `npm run dev` en local,
  `npm run build` vers `dist/`.
- React 18 + syntaxe HTM via `src/app/lib.js`. **Pas de JSX** : les composants
  écrivent des templates ``html`...` ``.
- Imports npm nus (`import React from "react"`, `import { getAuth } from "firebase/auth"`).
- Firebase depuis npm (`firebase` en dépendance), plus depuis le CDN gstatic.
- CSS global dans un seul fichier : `src/theme/styles.css` (~7 100 lignes), tokens
  `--mrd-*` comme unique source de vérité couleur.
- Capacitor 6 pour iOS / Android (`capacitor.config.ts`, `webDir: "dist"`).
- Configuration Firebase isolée dans `src/environments/environment.js`.

## Organisation du code

Structure calquée sur le projet COBA (Ionic/Angular), adaptée à React + htm.
COBA a un dossier par page parce qu'Angular impose un triplet `.ts/.html/.scss` ;
ici une page est un seul `.js`, donc le dossier ne se justifie que quand l'écran
a plusieurs fichiers (`pages/recipes/` en a cinq). La séparation, elle, est reprise
telle quelle :

```
src/
  app/
    pages/<ecran>/   une destination de route + ses sous-composants propres
    components/      briques non-écrans, dont l'enveloppe MrdModal
    modals/          modales (AppModals, SettingsModals)
    providers/       accès aux données — Firebase Auth + Firestore
    plugins/         enveloppes de plugins natifs Capacitor
    config/          constantes de domaine et données statiques
    hooks/           actions métier (spécifique React ; COBA passe par la DI)
    utils/           normalisation, dates, stockage, unités
    App.js routes.js lib.js
  environments/      configuration Firebase et drapeaux de build
  theme/             styles.css + ionic-bridge.css
  assets/
  main.js
```

Deux écarts assumés par rapport à COBA :

- **Pas de `.browserslistrc`** : Vite ne le lit pas (c'est un mécanisme
  Angular/PostCSS). Le plancher navigateur est déclaré dans `vite.config.js`
  via `build.target`, qui a un effet réel.
- **Pas de `.npmrc`** : COBA a besoin de `legacy-peer-deps=true` pour ses plages
  de pairs Angular/Ionic. Ici l'installation passe sans, et le drapeau masquerait
  justement le conflit de pair sur `react-router-dom`, épinglé en 6.30.6 exprès
  (la v7 est incompatible avec `@ionic/react-router` 9).

## Top-level data flow

1. `index.html` loads `src/main.js`
2. `main.js` mounts `App`
3. `App.js`:
   - gets auth/family context from `useAuth`
   - gets planner state from `usePlannerSync`
   - creates feature handlers from hooks (`useTasks`, `useLists`, `useMeals`, `useAgenda`)
   - passes state + callbacks into view components
4. Feature views call handlers
5. Handlers call `updateState(...)`
6. `updateState` runs `checkReset(..., getCurrentAppDate())`
7. `checkReset` normalizes through `normalizeState`
8. `usePlannerSync` persists the final state to Firestore

## Boot sequence & loading guards

Loading spinner (`.ldr`) stays visible until all three conditions are met:

```
bootLoading = !authReady
           || (!!user && !profileFetched)
           || (profileFetched && currentFamily === undefined)
           || (currentFamilyId && !peopleBootstrapped)
```

- `authReady` → `onAuthStateChanged` fired at least once
- `profileFetched` → Firestore `users/{uid}` document received
- `currentFamily === undefined` → family doc not yet loaded (not null, which means "no family")
- `peopleBootstrapped` → `families/{id}/people` and `families/{id}/members` both received

### Onboarding guard (`profileGuardActive`)

When `needsFamilySetup || needsLinkedProfileSetup` is true, `OnboardingFlow` is shown instead of the main app.

- `needsFamilySetup` → user profile has no `currentFamilyId`
- `needsLinkedProfileSetup` → user is in a family but has no linked `people` entry

## State management

One main planner state object, shape defined in `src/app/config/defaultState.js`.

Key fields: `tasks`, `meals`, `recipes`, `lists`, `inventory`, `storageLocations`, `productLocationMemory`, `notes`, `history`, `agenda`, `recurringEvents`, `lastResetDaily`, `lastResetWeekly`, `lastResetMonthly`, `linkMealsToInventory`.

Normalization and backward-compatibility: `src/app/utils/state.js`.

## Feature hooks

- `useTasks` — task CRUD, completion, reorder, agenda linkage
- `useLists` — shopping list + custom lists + inventory CRUD + duplicate merge logic
- `useMeals` — weekly meals, recipe CRUD, demo recipes
- `useAgenda` — agenda blocks and recurring calendar entries
- `useAuth` — Firebase auth, family bootstrap, people/members/invitations watchers
- `usePlannerSync` — Firestore planner sync and local reset/normalization on load/save
- `useTaskNotifications` — local Notification API for task due-time alerts
- `usePushMessaging` — FCM token registration and foreground push messages

## Firestore collections

All Firestore access goes through `src/app/providers/client.js`.

### User collections

| Path | Purpose |
|------|---------|
| `users/{uid}` | User profile: `familyIds`, `currentFamilyId`, `displayName`, `pendingOnboardingFamilyId` |
| `users/{uid}/messagingTokens/{tokenDocId}` | FCM push tokens per browser/device (permission, token, updatedAt) |

### Family collections

| Path | Purpose |
|------|---------|
| `families/{familyId}` | Family metadata: name, memberCount, createdAt |
| `families/{familyId}/planner/state` | Main planner document (all task/meal/list/etc data) |
| `families/{familyId}/people/{personId}` | Household members (may or may not be app users) |
| `families/{familyId}/members/{uid}` | App users linked to the family (role, displayName, email) |
| `families/{familyId}/members/{uid}/devices/{deviceId}` | FCM token per physical device, stable device ID in localStorage (`mrd-device-id`) |
| `families/{familyId}/invitations/{invitationId}` | Join invitations with code, expiresAt, createdBy |
| `families/{familyId}/joinEvents/{eventId}` | Audit log written by client when a user joins (Cloud Functions read only) |
| `families/{familyId}/serverNotificationLog/{key}` | Anti-spam log for push notifications — written by Cloud Functions only, write rule is `false` for clients |

### Feedback collections (root level)

| Path | Purpose |
|------|---------|
| `bug_reports/{id}` | Bug report submissions from SettingsView |
| `feature_requests/{id}` | Feature request submissions |
| `tester_feedback/{id}` | General tester feedback |

### Collection groups used

- `collectionGroup(db, "invitations")` — used in `findInvitationByCode()` to search across all families

## Auth flow

1. `onAuthStateChanged` fires → `authReady = true`
2. If user null → show `AuthScreen` (email/password, signup, forgot, Google)
3. If user present → `watchUserProfile(uid)` subscribes to `users/{uid}`
4. Profile arrives → check `familyIds` / `currentFamilyId`:
   - Empty → trigger OnboardingFlow (CREATE or JOIN)
   - Present → `watchFamily(familyId)` → `watchFamilyPeople` + `watchFamilyMembers`
5. When people + members loaded → `peopleBootstrapped = true` → boot complete

### Google Sign-In (iOS PWA trap)

- Normal browsers: `signInWithPopup` → fallback to `signInWithRedirect` on `popup-not-supported`
- iOS standalone PWA: `signInWithRedirect` directly (no popup possible in WKWebView)
- Detection: `isStandalonePwa()` checks `window.navigator.standalone === true`
- Redirect return: `getRedirectResult()` + `mrd_google_redirect_pending` localStorage flag handle the comeback

## OnboardingFlow modes

Three distinct flows in `src/app/pages/auth/OnboardingFlow.js`:

**CREATE** (new household):
1. `choose-household-mode`
2. `create-first-name`
3. `create-badge-color`
4. `create-household-name`
5. `create-add-members`
6. `create-invite-members` (conditional — only if members were added)

**JOIN** (invitation code):
1. `join-invitation-code`
2. `join-confirm-household`
3. `join-profile-name`
4. `join-badge-color`
5. `join-done`

**EXISTING-PROFILE** (already has a family, needs to link profile):
1. `existing-profile-name`
2. `existing-badge-color`
3. `existing-done`

## Cloud Functions (`functions/index.js`)

Backend logic deployed to Firebase, not bundled in the frontend.

### `scheduledNotifications` (every 5 minutes)

- Reads all families
- Checks agenda events and tasks due within the 5-minute window
- Sends FCM messages via Admin SDK
- Anti-spam via `serverNotificationLog` (keys expire after 3 days, cleaned each run)
- Time zone: Europe/Paris (naïve local time comparison)

### Token management triggers

- `onDocumentCreated` — new FCM token doc triggers token validation
- `onDocumentUpdated` — updated FCM token triggers sync/cleanup

## Push notifications (FCM)

Two separate systems:

1. **Local notifications** (`useTaskNotifications`) — browser `Notification` API, fires when task due time arrives. Works only while app is open/foreground.
2. **Server push** (`functions/index.js` + `usePushMessaging`) — Cloud Functions send FCM messages to all family members even when app is closed. Requires `users/{uid}/messagingTokens` + `families/{familyId}/members/{uid}/devices/{deviceId}`.

### PWA / Service Worker

- `firebase-messaging-sw.js` at root — registered by `src/app/providers/messaging.js`
- Handles background FCM messages
- `manifest.json` — PWA manifest (standalone, icons, theme_color)

## localStorage keys

| Key | Purpose |
|-----|---------|
| `mrd_google_redirect_pending` | Set before `signInWithRedirect`, cleared after `getRedirectResult` |
| `mrd-device-id` | Stable device identifier for FCM `devices` subcollection |
| `mrd_sim_mode` / `mrd_sim_value` | Time simulation mode/value (dev tool) |
| Various theme + preference keys | Managed in `App.js` and `SettingsView.js` |

## Shared logic

- `src/app/utils/productUtils.js` — product name normalization, anti-duplicate foundation used across inventory, lists, and recipes
- `src/app/utils/date.js` — all date helpers; any date-sensitive code should use these instead of raw `new Date()`
- `src/app/utils/state.js` — daily/weekly/monthly reset, recurring task cycles, normalization, backward-compat migrations
- `src/app/utils/storage.js` — JSON import/export parser

## Cache-busting — règle supprimée

**Obsolète.** Les suffixes `?v=...` étaient nécessaires quand les modules
étaient chargés à l'unité par le navigateur : chaque URL distincte donnait une
instance de module distincte, et un `client.js` chargé deux fois appelait
`initializeApp()` deux fois. Vite résout et dédoublonne les modules au build :
il n'y a plus rien à aligner. Ne pas réintroduire de `?v=` dans les imports.

## Important dependencies

- React 18 + HTM (npm)
- Firebase Auth, Firestore, Cloud Messaging (npm)
- Capacitor 6 + plugins (`@capacitor/*`, `@capacitor-community/*`)
- Vite (devDependency, unique outil de build)
- Firebase Admin SDK (Cloud Functions uniquement, pas dans le frontend)
- Node test runner pour les tests locaux (`node:test`)

## Surfaces livrées

**iOS et Android uniquement** (Capacitor, `webDir: "dist"`). Décision produit du
22 août 2026 : il n'y a **pas de version ordinateur** au programme, et le rendu
bureau (barre latérale de 240 px sur `@media (min-width: 900px)`) a été supprimé
en phase 6 de la migration Ionic.

Ce n'est pas la même chose que « pas de web » : `dist/` reste servi par Firebase
Hosting, parce que deux choses en dépendent — la redirection d'authentification
Google (`__/auth/*`, cf. `netlify.toml`) et la page autonome de réinitialisation
de mot de passe (`site/reset-password.html`). Ouverte dans une fenêtre large,
l'app s'affiche comme sur téléphone, sur toute la largeur.

Les media queries restantes (600 / 640 / 720 px) ne sont pas du bureau : un
téléphone en paysage fait 844 px de large et les atteint.

## Routage

**`@ionic/react-router` au-dessus de `react-router-dom` 6.** L'URL est la source
de vérité de l'écran affiché — plus aucun `useState` pour ça.

`src/app/routes.js` est la **seule** traduction entre l'URL et le vocabulaire
historique du code (`pathForTab`, `tabFromPath`, `bottomIdForTab`,
`settingsPathFor`, `settingsStateFromPath`). Module pur, testé sans navigateur
(`tests/unit/routes.test.js`).

| Chemin | Écran |
|---|---|
| `/home` | Accueil |
| `/tasks/:period` | Tâches — `daily`, `weekly`, `monthly`, `mine`. **Une seule route** : changer de période change un segment, pas de page. |
| `/agenda`, `/meals` | Onglets |
| `/lists`, `/notes`, `/inventory`, `/recipes`, `/history`, `/inbox` | Écrans secondaires, empilés par-dessus l'accueil |
| `/settings`, `/settings/:section`, `/settings/support/:page` | Réglages, 3 niveaux |
| `*` | Redirige sur `/home` |

Dans `App.js`, `activeTab` et `setActiveTab` **gardent leur nom et leur
vocabulaire** (« daily », pas « tasks ») : seules leurs définitions ont changé.
C'est ce qui a permis de ne pas toucher les ~50 endroits qui les utilisent.

Deux pièges à connaître avant de toucher à la navigation :

- **Ne jamais faire `navigate()` en direct** — passer par `go()`, qui n'empile
  pas deux fois la même destination. Plusieurs endroits enchaînent deux
  changements d'état visant la même URL, et sans ce garde le bouton retour
  semble ne rien faire au premier appui.
- **Un `setState` transformé en navigation n'est plus réversible.** Un effet de
  remise à zéro sur `[user]` empilait deux entrées `/settings` au démarrage,
  sans que rien ne se voie à l'écran. Voir `tests/e2e/navigation.test.js` [7].

Les gardes de haut niveau (chargement / auth / onboarding) restent des rendus
conditionnels dans `AppShell` et **non** des routes : ce sont des prises de
contrôle plein écran avant que l'app existe.

Détail complet et historique des décisions : `docs/MIGRATION_IONIC.md`.

## Tests

```
npm test          # unitaires + e2e
npm run test:unit
npm run test:e2e
```

Les suites e2e (`tests/e2e/`) pilotent un Chrome headless par CDP sur un vrai
build Vite où Firebase est remplacé par les stubs de
`tests/fixtures/firebase-stubs/` (voir `tests/helpers/e2e-build.js`).

⚠️ Les sections CDP se **skippent silencieusement** si aucun navigateur n'est
trouvé — la suite affiche alors « 0 fail » sans avoir rien vérifié. Les chemins
sont dans `tests/helpers/cdp-browser.js`. Vérifier le compteur `skipped` :
il doit être à 0.

⚠️ Un fichier posé dans `tests/unit/` **ne tourne pas tout seul** : il doit être
importé par `tests/unit.test.js` (idem `tests/e2e/` → `tests/e2e.test.js`).
`tests/unit/routes.test.js` est resté douze tests morts entre la phase 5 de la
migration Ionic et le refactor de structure pour cette raison. Après avoir
ajouté un fichier de test, vérifier que le compteur `# tests` a bougé.

`tests/unit/structure.test.js` est la contrepartie exécutable de la section
« Organisation du code » ci-dessus : il lit les imports relatifs réels et
échoue si une dépendance remonte d'une couche, si `config/` acquiert une
dépendance, ou si un fichier apparaît à la racine de `src/app/`.

Garde anti-régression visuelle : `tests/screenshots/` (voir son README).
