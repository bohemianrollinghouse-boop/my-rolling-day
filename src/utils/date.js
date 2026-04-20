export function pad2(value) {
  return String(value).padStart(2, "0");
}

const APP_TIME_MODE_KEY = "mrd-app-time-mode";
const APP_TIME_SIMULATED_KEY = "mrd-app-time-simulated";

function safeLocalStorageRead(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

function safeLocalStorageWrite(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn("[date] impossible d enregistrer la simulation temporelle", error);
  }
}

export function getCurrentAppTimeMode() {
  return safeLocalStorageRead(APP_TIME_MODE_KEY) === "simulated" ? "simulated" : "real";
}

export function getSimulatedAppDateValue() {
  return safeLocalStorageRead(APP_TIME_SIMULATED_KEY) || "";
}

function parseSimulatedDateValue(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getCurrentAppDate() {
  if (getCurrentAppTimeMode() !== "simulated") return new Date();
  const simulated = parseSimulatedDateValue(getSimulatedAppDateValue());
  return simulated || new Date();
}

export function getCurrentAppTimestamp() {
  return getCurrentAppDate().getTime();
}

export function formatDateTimeInputValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function setCurrentAppTimeMode(mode) {
  safeLocalStorageWrite(APP_TIME_MODE_KEY, mode === "simulated" ? "simulated" : "real");
}

export function setSimulatedAppDateValue(value) {
  const parsed = parseSimulatedDateValue(value);
  safeLocalStorageWrite(APP_TIME_SIMULATED_KEY, formatDateTimeInputValue(parsed || new Date()));
}

export function resetSimulatedAppDateToNow() {
  setSimulatedAppDateValue(formatDateTimeInputValue(new Date()));
}

export function shiftSimulatedAppDate(days) {
  const base = getCurrentAppTimeMode() === "simulated"
    ? parseSimulatedDateValue(getSimulatedAppDateValue()) || new Date()
    : new Date();
  base.setDate(base.getDate() + (Number(days) || 0));
  setSimulatedAppDateValue(formatDateTimeInputValue(base));
}

export function localDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function localMonthKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

export function localWeekStart(date) {
  const output = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (output.getDay() + 6) % 7;
  output.setDate(output.getDate() - offset);
  output.setHours(0, 0, 0, 0);
  return output;
}

export function localWeekKey(date) {
  return localDateKey(localWeekStart(date));
}

export function utcDateKey(date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function utcMonthKey(date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
}

export function utcWeekStart(date) {
  const offset = (date.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - offset));
}

export function utcWeekKey(date) {
  return utcDateKey(utcWeekStart(date));
}

export function frDateLabel(date) {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function formatHeaderDate(date = getCurrentAppDate()) {
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function minutesToLabel(value) {
  const minutes = Number(value) || 0;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (hours && remaining) return `${hours}h${pad2(remaining)}`;
  if (hours) return `${hours}h`;
  return `${remaining} min`;
}

export function addMinutesToTime(start, minutes) {
  const [hour, minute] = String(start || "09:00").split(":").map(Number);
  const total = hour * 60 + minute + (Number(minutes) || 0);
  return `${pad2(Math.floor(total / 60) % 24)}:${pad2(total % 60)}`;
}

export function getWeekDays(weekOffset) {
  const start = localWeekStart(getCurrentAppDate());
  start.setDate(start.getDate() + weekOffset * 7);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}
