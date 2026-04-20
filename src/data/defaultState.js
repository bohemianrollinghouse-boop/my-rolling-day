export function createDefaultState() {
  return {
    tasks: [],
    meals: [],
    linkMealsToInventory: false,
    recipes: [],
    shopping: [],
    lists: [
      {
        id: "shopping-default",
        name: "Liste de courses",
        addToInventory: true,
        isShoppingList: true,
        items: [],
      },
    ],
    inventory: [],
    notes: [],
    history: [],
    agenda: [],
    recurringEvents: [],
    lastResetDaily: "",
    lastResetWeekly: "",
    lastResetMonthly: "",
  };
}
