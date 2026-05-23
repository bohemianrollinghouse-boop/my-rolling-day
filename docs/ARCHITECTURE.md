# ARCHITECTURE

Read this file before touching feature code.

## Runtime model

- Static app, no build step, no bundler.
- React 18 + HTM syntax via `src/lib.js` (esm.sh CDN).
- ES modules loaded directly from `index.html`.
- Firebase SDK loaded from gstatic CDN via `import` statements with `?v=...` cache-busting.
- Global CSS in one file: `src/styles.css`.

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

One main planner state object, shape defined in `src/data/defaultState.js`.

Key fields: `tasks`, `meals`, `recipes`, `lists`, `inventory`, `storageLocations`, `productLocationMemory`, `notes`, `history`, `agenda`, `recurringEvents`, `lastResetDaily`, `lastResetWeekly`, `lastResetMonthly`, `linkMealsToInventory`.

Normalization and backward-compatibility: `src/utils/state.js`.

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

All Firestore access goes through `src/firebase/client.js`.

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

Three distinct flows in `src/components/auth/OnboardingFlow.js`:

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

- `firebase-messaging-sw.js` at root — registered by `src/firebase/messaging.js`
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

- `src/utils/productUtils.js` — product name normalization, anti-duplicate foundation used across inventory, lists, and recipes
- `src/utils/date.js` — all date helpers; any date-sensitive code should use these instead of raw `new Date()`
- `src/utils/state.js` — daily/weekly/monthly reset, recurring task cycles, normalization, backward-compat migrations
- `src/utils/storage.js` — JSON import/export parser

## Cache-busting rule

All imports use `?v=...` query strings. Since there is no bundler, each unique URL = a separate module instance. **All imports of the same file must use the identical version string** to avoid duplicate module initialization (especially critical for `client.js` which calls `initializeApp()`).

When touching any file:
1. Update its own version string (if it has one)
2. Update the version string in every file that imports it
3. Bump `index.html` if needed for mobile cache refresh

Current aligned version: `?v=2026-05-08-offline-cache-1` (all `client.js` imports).

## Important dependencies

- React 18 + HTM (CDN)
- Firebase Auth, Firestore, Cloud Messaging (CDN)
- Firebase Admin SDK (Cloud Functions only, not in frontend)
- Node test runner for local tests (`node:test`)

`package.json` is minimal. No visible bundler or framework router.
