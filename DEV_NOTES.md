# DEV_NOTES

Maintenance notes. Keep this short and practical.

## Fragile areas

### `src/App.js`

- Very large orchestrator.
- Still contains cross-feature logic that ideally would live in hooks.
- Handles navigation, toasts, planner glue, some meals/inventory interactions, and cache-busting imports.

### `src/hooks/useLists.js`

- High-risk file.
- Handles:
  - shopping list creation/merge
  - optional inventory linkage
  - purchase toggle
  - undo toast
  - inventory merge rules
  - send inventory item to shopping list
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

- `linkMealsToInventory = false`
  - no inventory comparison
  - no stock deduction
  - manual ingredient selection to add to shopping list is still allowed
- `linkMealsToInventory = true`
  - compare recipe ingredients to inventory
  - show missing items popup
  - allow selected missing items to be added to shopping list
  - deduct main ingredients from inventory when meal is marked cooked/OK

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

- Mixed `?v=...` import versions make real runtime state harder to read.
- Mobile/browser cache can make old modules appear alive after a correct code fix.
- There are still some encoding/mojibake leftovers in the repo text.
- `node.exe` may be unavailable in this environment even when the app runs; syntax checks may fail for environment reasons.

## Things not to break

- Firebase auth + family bootstrap
- Firestore planner sync
- date simulation mode
- product normalization foundation
- history retention
- optional inventory linkage modes
- recurring task reset behavior

## Future-session workflow

Before coding:
1. Read `PROJECT_MAP.md`
2. Read `ARCHITECTURE.md`
3. Read `DEV_NOTES.md`
4. Then inspect only the files relevant to the requested feature

