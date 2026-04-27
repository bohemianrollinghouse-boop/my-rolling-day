import { normalizeState } from "./state.js?v=2026-04-26-inventory-drag-note-1";

export function parseImportedState(rawText) {
  const text = String(rawText || "").trim();
  if (!text) {
    throw new Error("Colle un JSON de planning a importer.");
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_error) {
    throw new Error("Le texte fourni n'est pas un JSON valide.");
  }

  const candidate = parsed?.data && typeof parsed.data === "object" ? parsed.data : parsed;
  return normalizeState(candidate);
}
