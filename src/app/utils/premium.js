export const PREMIUM_TABS = ["meals", "inventory", "recipes"];

export function isPremiumTab(tab) {
  return PREMIUM_TABS.includes(tab);
}
