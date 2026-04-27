# ARCHITECTURE

Read this file before touching feature code.

## Runtime model

- Static app, no visible build step.
- React 18 + HTM syntax via `src/lib.js`.
- ES modules loaded directly from `index.html`.
- Global CSS in one file: `src/styles.css`.

## Top-level data flow

1. `index.html` loads `src/main.js`
2. `main.js` mounts `App`
3. `App.js`:
   - gets auth/family context from `useAuth`
   - gets planner state from `usePlannerSync`
   - creates feature handlers from hooks (`useTasks`, `useLists`, `useMeals`, `useAgenda`)
   - passes state + callbacks into view components
4. feature views call handlers
5. handlers call `updateState(...)`
6. `updateState` runs `checkReset(..., getCurrentAppDate())`
7. `checkReset` normalizes through `normalizeState`
8. `usePlannerSync` persists the final state to Firestore

## State management

There is one main planner state object.

Initial shape comes from:
- `src/data/defaultState.js`

Important fields:
- `tasks`
- `meals`
- `linkMealsToInventory`
- `recipes`
- `lists`
- `inventory`
- `storageLocations`
- `productLocationMemory`
- `notes`
- `history`
- `agenda`
- `recurringEvents`
- reset markers:
  - `lastResetDaily`
  - `lastResetWeekly`
  - `lastResetMonthly`

Normalization and backward-compatibility live in:
- `src/utils/state.js`

## Feature hooks

- `useTasks`
  Task CRUD, completion, reorder, agenda linkage on create/update/delete.
- `useLists`
  Shopping list + custom lists + inventory CRUD + list/inventory coupling + duplicate merge logic.
- `useMeals`
  Weekly meals, recipe CRUD, demo recipes.
- `useAgenda`
  Agenda blocks and recurring calendar entries.
- `useAuth`
  Firebase auth, family bootstrap, people/members/invitations watchers.
- `usePlannerSync`
  Firestore planner sync and local reset/normalization on load/save.

## Storage / database

### Firestore

Used through:
- `src/firebase/client.js`
- `src/hooks/useAuth.js`
- `src/hooks/usePlannerSync.js`

Main responsibilities:
- authentication
- user profile
- family metadata
- household members / people
- invitations
- planner document save/watch

### localStorage

Used for small client-side preferences, notably:
- app time simulation mode/value: `src/utils/date.js`
- theme and some device/profile selections: `src/App.js`

### Import/export

- Parser/normalizer for imported JSON: `src/utils/storage.js`

## Shared logic

### Product memory / normalization

- `src/utils/productUtils.js`

Used across:
- inventory
- lists
- recipe ingredients
- meal stock checks

This is the main anti-duplicate foundation.

### Time simulation

- `src/utils/date.js`

Any date-sensitive feature should use helpers from this file instead of raw `new Date()` when possible.

### Reset and recurrence

- `src/utils/state.js`

Contains:
- daily/weekly/monthly reset checks
- recurring task cycle boundaries
- completed task cleanup for non-recurring tasks after daily reset

## Shared UI pieces

- `BottomNav`
- `TaskCard`
- `EmojiPicker`
- global modal/backdrop patterns are mostly CSS-driven

## Important dependencies

- React 18
- HTM-style templates
- Firebase Auth
- Firestore
- Node test runner for local tests

`package.json` is minimal. There is no visible bundler or framework router here.

## Cache-busting rule

Many imports use `?v=...`.

When changing a module:
- update the parent import version if needed
- sometimes also bump:
  - `src/main.js`
  - `index.html`

Otherwise mobile browsers may keep old modules.

