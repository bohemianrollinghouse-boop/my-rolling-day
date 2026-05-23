# DEV_NOTES

Maintenance notes. Keep this short and practical.

## Fragile areas

### `src/App.js`

- Very large orchestrator (~1500 lines).
- Still contains cross-feature logic that ideally would live in hooks: quantity conversion helpers, `computeMealCookState`, meals/inventory interaction glue.
- Handles navigation, toasts, planner glue, and cache-busting imports.

### `src/hooks/useLists.js`

- High-risk file.
- Handles: shopping list creation/merge, optional inventory linkage, purchase toggle, undo toast, inventory merge rules, send inventory item to shopping list.
- Easy place for duplicate, quantity, or race-condition regressions.

### `src/components/meals/MealsView.js`

- Sensitive for meal/inventory/list flows.
- Missing ingredients popup behavior depends on `linkMealsToInventory`.
- Manual ingredient-to-list flow also exists when inventory link is off.

### `src/components/recipes/RecipesView.js`

- Sensitive for recipe editing, structured ingredients, condiments, and seasonal availability.
- UI changed multiple times; avoid reintroducing older condiment logic.

### `src/components/tasks/TasksView.js`

- Drag & drop and task modal logic is now fairly custom.
- Long-press reorder, ghost card, insertion placeholder, and open/create triggers are easy to break.

### `src/firebase/client.js`

- 1220+ lines. All Firestore operations. The one place `initializeApp()` is called.
- `joinFamily()` is a pure alias for `acceptHouseholdInvitation()` — do not maintain both separately.
- Never import `client.js` with different `?v=...` strings from different files — it will create duplicate Firebase app instances and throw `app/duplicate-app`.

## iOS PWA (standalone mode) traps

- `signInWithPopup` is blocked in WKWebView (iOS standalone PWA). Always check `isStandalonePwa()` before choosing popup vs redirect.
- `getRedirectResult()` must be called on app boot if `mrd_google_redirect_pending` flag is set in localStorage.
- The `heldNullAuthState` pattern in `useAuth.js` prevents flashing the login screen during a redirect return.

## Preact / React controlled input trap

- HTM-rendered `<input value=${state.foo}>` is a controlled input.
- Simulating user typing via `HTMLInputElement.prototype.value` setter + dispatched `input` event does NOT reliably update Preact state.
- In E2E tests: prefer clicking elements that call state setters directly (e.g. suggestion chips) rather than trying to type into controlled inputs.

## Version string rule (cache-busting)

- No bundler = no automatic module deduplication.
- Each unique URL for a JS file = a separate module. Two different `?v=...` on `client.js` → two `initializeApp()` calls → `app/duplicate-app` crash.
- When you modify a file: update the `?v=` string in that file's own import AND in every importer.
- All importers of `client.js` must always share the exact same version string.

## Dead files (do not use)

- `src/components/family/FamilyPanel.js` — never imported anywhere. Replaced by `SettingsView.js`.
- `src/components/Tabs.js` — never imported anywhere. Replaced by `SegmentedTabs.js`.

Safe to remove in a cleanup commit, confirmed by grep.

## Cloud Functions (`functions/index.js`)

- Not documented in earlier README/PROJECT_MAP versions.
- Deployed to Firebase, not part of the frontend bundle.
- Scheduled every 5 minutes: reads families, sends FCM push for due tasks/events.
- Anti-spam: writes to `families/{id}/serverNotificationLog` (client write rule is `false`).
- Token cleanup: triggered by `onDocumentCreated` / `onDocumentUpdated` on FCM token docs.

## E2E test infra notes

- Tests use `node:test` (Node built-in runner), not Jest/Mocha.
- CDP tests write a stub HTML file (`e2e-onboarding.html`) to the project root and navigate the browser to it. This is the only reliable way to inject an import map without a build step.
- The stub file is cleaned up in `t.after`. If a test crashes mid-run, the file may remain — safe to delete manually.
- Firebase stubs live in `tests/fixtures/firebase-stubs/`. They must export every symbol that `client.js` imports, or the browser will throw a `SyntaxError` before React boots.

## UI rules already decided

- Do not replace app structure with external HTML prototypes.
- Reuse current hooks/components; apply design selectively.
- Tasks top tabs should visually match Agenda tabs.
- No reorder arrows on task cards; reorder is via long press drag.
- No empty emoji placeholder: if no emoji, show no emoji block.
- Condiments are visually secondary to main ingredients.

## Recurrence logic notes

- Recurring tasks must not show as late/overdue.
- Recurring tasks reset by cycle in `state.js`.
- Non-recurring completed tasks are removed from task tabs on next daily reset and remain only in History.
- Unique overdue tasks may still be marked late.

## Task / calendar sync notes

- Task is the source of truth; calendar block is a placement/scheduling layer.
- Deleting a task should remove linked agenda + recurring entries.
- Removing a task block from calendar should not automatically delete the task.
- Calendar-linked task display should reuse task card design as much as possible.

## Meals / inventory / list rules

- `linkMealsToInventory = false` → no inventory comparison, no stock deduction, manual ingredient selection to shopping list still allowed.
- `linkMealsToInventory = true` → compare recipe ingredients to inventory, show missing items popup, allow selected missing items to be added to shopping list, deduct main ingredients from inventory when meal is marked cooked/OK.

## Recipe rules

- Main ingredients are structured rows with `name`, `quantity`, `unit`.
- Condiments/epices are separate from main ingredients.
- Condiments can be reported missing, but are never auto-deducted from stock.
- Recipes store a base servings count; no full auto-rescaling is guaranteed yet.

## Lists / inventory rules

- Inventory linkage for lists is optional, including the shopping list.
- Purchased list items can update inventory when list linkage is enabled.
- Purchased list items are reset to quantity `0`, and undo should restore previous quantity.
- Similar product names should merge carefully, not aggressively.
- Product memory should include inventory, lists, and recipe ingredients.

## Known maintenance traps

- Mixed `?v=...` import versions → `app/duplicate-app` Firebase crash (see version string rule above).
- Mobile/browser cache can make old modules appear alive after a correct code fix.
- `node.exe` may be unavailable in this environment even when the app runs; syntax checks may fail for environment reasons.
- EBUSY error when closing Chrome in CDP tests is benign — Chrome holds SQLite files after `kill()`. Wrap `browserHandle.close()` in try-catch.

## Things not to break

- Firebase auth + family bootstrap
- Firestore planner sync
- Date simulation mode
- Product normalization foundation
- History retention
- Optional inventory linkage modes
- Recurring task reset behavior
- iOS PWA Google sign-in redirect flow

## Future-session workflow

Before coding:
1. Read `PROJECT_MAP.md`
2. Read `ARCHITECTURE.md`
3. Read `DEV_NOTES.md`
4. Then inspect only the files relevant to the requested feature
