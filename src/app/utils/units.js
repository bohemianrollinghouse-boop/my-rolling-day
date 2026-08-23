import { normalizeProductName } from "./productUtils.js";

// ── Normalisation des unités ───────────────────────────────────────────────

export function normalizeUnitValue(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  const cleaned = raw.normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (cleaned === "u" || cleaned === "unite" || cleaned === "unites") return "unite";
  if (["g", "kg", "ml", "cl", "l"].includes(cleaned)) return cleaned;
  return cleaned;
}

export function parseQuantityValue(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatQuantityValue(value) {
  if (!Number.isFinite(value)) return "";
  if (Number.isInteger(value)) return String(value);
  return String(value).replace(".", ",");
}

export function normalizeUnitForStock(unit, quantity) {
  const normalized = normalizeUnitValue(unit);
  if (normalized) return normalized;
  return parseQuantityValue(quantity) != null ? "unite" : "";
}

// ── Conversion vers/depuis l'unité de base ────────────────────────────────

export function toBaseQuantity(quantity, unit) {
  const normalizedUnit = normalizeUnitForStock(unit, quantity);
  const parsedQuantity = parseQuantityValue(quantity);
  if (parsedQuantity == null || !normalizedUnit) return null;

  if (normalizedUnit === "kg") return { kind: "mass", value: parsedQuantity * 1000, unit: normalizedUnit };
  if (normalizedUnit === "g") return { kind: "mass", value: parsedQuantity, unit: normalizedUnit };
  if (normalizedUnit === "l") return { kind: "volume", value: parsedQuantity * 1000, unit: normalizedUnit };
  if (normalizedUnit === "cl") return { kind: "volume", value: parsedQuantity * 10, unit: normalizedUnit };
  if (normalizedUnit === "ml") return { kind: "volume", value: parsedQuantity, unit: normalizedUnit };
  if (normalizedUnit === "unite") return { kind: "count", value: parsedQuantity, unit: normalizedUnit };
  return null;
}

export function fromBaseQuantity(baseValue, originalUnit) {
  const normalizedUnit = normalizeUnitForStock(originalUnit, 1);
  if (!Number.isFinite(baseValue) || !normalizedUnit) return "";
  if (normalizedUnit === "kg") return formatQuantityValue(baseValue / 1000);
  if (normalizedUnit === "g") return formatQuantityValue(baseValue);
  if (normalizedUnit === "l") return formatQuantityValue(baseValue / 1000);
  if (normalizedUnit === "cl") return formatQuantityValue(baseValue / 10);
  if (normalizedUnit === "ml") return formatQuantityValue(baseValue);
  if (normalizedUnit === "unite") return formatQuantityValue(baseValue);
  return "";
}

// ── Somme de deux quantités ───────────────────────────────────────────────

/** Une quantité absente vaut 1 : rajouter « nouilles » à « nouilles » fait 2. */
function readAddend(quantity) {
  const trimmed = String(quantity ?? "").trim();
  if (!trimmed) return 1;
  return parseQuantityValue(trimmed);
}

/**
 * Additionne deux quantités de stock, exprimée dans l'unité de `target`.
 *
 * `mergeable: false` quand les deux unités ne mesurent pas la même chose (des
 * grammes et des litres, un sachet et une boîte) : aucune somme n'est juste, et
 * l'appelant garde deux lignes distinctes plutôt que d'inventer un total faux.
 * C'est le bug d'origine : 500 g de riz plus 1 kg donnaient 501 g, parce que la
 * fusion additionnait les nombres sans jamais regarder les unités.
 *
 * `hasQuantity: false` quand ni l'un ni l'autre n'annonce de nombre exploitable
 * (« un peu de persil ») : les entrées fusionnent, la quantité ne bouge pas.
 *
 * Une unité absente emprunte celle d'en face : « 2 paquets » plus « 1 » parle
 * bien de 3 paquets, refuser la fusion là couperait l'inventaire pour rien.
 */
export function addStockQuantities(target, addition) {
  const targetUnit = normalizeUnitValue(target?.unit) || normalizeUnitValue(addition?.unit);
  const additionUnit = normalizeUnitValue(addition?.unit) || normalizeUnitValue(target?.unit);
  const unit = String(target?.unit || "").trim() || String(addition?.unit || "").trim();
  const targetValue = readAddend(target?.quantity);
  const additionValue = readAddend(addition?.quantity);

  if (targetValue == null && additionValue == null) return { mergeable: true, hasQuantity: false, unit };

  const targetBase = toBaseQuantity(targetValue ?? 0, targetUnit);
  const additionBase = toBaseQuantity(additionValue ?? 0, additionUnit);

  // Unité maison (« sachet », « boîte ») : rien à convertir, on n'additionne
  // que si c'est mot pour mot la même.
  if (!targetBase || !additionBase) {
    if (targetUnit !== additionUnit) return { mergeable: false, unit };
    return { mergeable: true, hasQuantity: true, quantity: formatQuantityValue((targetValue || 0) + (additionValue || 0)), unit };
  }
  if (targetBase.kind !== additionBase.kind) return { mergeable: false, unit };
  return {
    mergeable: true,
    hasQuantity: true,
    quantity: fromBaseQuantity(targetBase.value + additionBase.value, targetUnit),
    unit,
  };
}

// ── Correspondance de noms de produits ────────────────────────────────────

export const PRODUCT_STOPWORDS = new Set(["de", "du", "des", "d", "la", "le", "les", "a", "au", "aux", "un", "une"]);

export function productMatchKey(name) {
  const normalized = normalizeProductName(name);
  const filtered = normalized
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token && !PRODUCT_STOPWORDS.has(token));
  return filtered.join(" ") || normalized;
}
