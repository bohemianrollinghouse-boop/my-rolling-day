# PROJECT_MAP

Read this file first in future sessions.

## Root

- `index.html`
  Static entry HTML. Loads `src/styles.css` and `src/main.js` with cache-busting query params.
- `src/main.js`
  Boots the app, mounts `App`, exposes fatal boot errors.
- `src/App.js`
  Main orchestrator. Navigation, top-level state wiring, cross-feature glue, toast handling, view selection.
- `src/styles.css`
  Global styles for the entire app.
- `src/lib.js`
  React/HTM bridge used by all components.
- `src/constants.js`
  Shared constants such as weekdays and Firebase config helpers.

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
- `tests`
  Unit tests and smoke E2E tests.
- `scripts`
  Test runner helpers.

## Feature map

### Tasks

- View: `src/components/tasks/TasksView.js`
- Shared task card: `src/components/tasks/TaskCard.js`
- Emoji picker: `src/components/tasks/EmojiPicker.js`
- Mutations: `src/hooks/useTasks.js`
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
- Mutations: `src/hooks/useMeals.js`
- Demo data: `src/data/demoRecipes.js`
- Condiment catalog: `src/data/condiments.js`
- Recipe normalization / migration: `src/utils/state.js`

### Settings

- View: `src/components/settings/SettingsView.js`
- Auth/family actions passed from: `src/App.js`
- Time simulation controls wired through: `src/utils/date.js`

## Other views

- Home / shell dashboard: `src/components/home/HomeView.js`
- Bottom nav: `src/components/nav/BottomNav.js`
- Notes: `src/components/notes/NotesView.js`
- History: `src/components/history/HistoryView.js`
- Auth screen: `src/components/auth/AuthScreen.js`
- Family helper panel: `src/components/family/FamilyPanel.js`

## Tests

- Aggregators:
  - `tests/unit.test.js`
  - `tests/e2e.test.js`
- Main unit coverage:
  - `tests/unit/state.test.js`
  - `tests/unit/product-utils.test.js`
  - `tests/unit/date-utils.test.js`
- Smoke browser/static helpers:
  - `tests/helpers/static-server.js`
  - `tests/helpers/cdp-browser.js`

