// ── Clés localStorage ─────────────────────────────────────────────────────

export function activePersonStorageKey(familyId) {
  return `mrd-active-person-${familyId}`;
}

export function deviceModeStorageKey(familyId) {
  return `mrd-device-mode-${familyId}`;
}

// ── Lecture / écriture de la personne active ──────────────────────────────

export function readStoredActivePerson(familyId) {
  if (!familyId) return "";
  try {
    return localStorage.getItem(activePersonStorageKey(familyId)) || "";
  } catch (error) {
    return "";
  }
}

export function storeActivePerson(familyId, personId) {
  if (!familyId) return;
  try {
    localStorage.setItem(activePersonStorageKey(familyId), personId || "");
  } catch (error) {
    console.warn("[app] impossible d enregistrer la personne active", error);
  }
}

// ── Lecture / écriture du mode appareil (personal | shared) ───────────────

export function readDeviceMode(familyId) {
  if (!familyId) return "personal";
  try {
    return localStorage.getItem(deviceModeStorageKey(familyId)) === "shared" ? "shared" : "personal";
  } catch (error) {
    return "personal";
  }
}

export function storeDeviceMode(familyId, mode) {
  if (!familyId) return;
  try {
    localStorage.setItem(deviceModeStorageKey(familyId), mode === "shared" ? "shared" : "personal");
  } catch (error) {
    console.warn("[app] impossible d enregistrer le mode appareil", error);
  }
}
