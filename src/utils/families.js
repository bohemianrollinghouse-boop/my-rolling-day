export function normalizeFamilyIds(familyIds = []) {
  return [...new Set((Array.isArray(familyIds) ? familyIds : []).map((id) => String(id || "").trim()).filter(Boolean))];
}

export function canSwitchToFamily(userProfile, familyId) {
  const targetId = String(familyId || "").trim();
  if (!targetId) return false;
  return normalizeFamilyIds(userProfile?.familyIds).includes(targetId);
}
