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
