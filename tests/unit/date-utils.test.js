import test from "node:test";
import assert from "node:assert/strict";

import {
  addMinutesToTime,
  daysUntilExpiry,
  formatDateTimeInputValue,
  formatHeaderDate,
  frDateLabel,
  getCurrentAppDate,
  getCurrentAppTimeMode,
  getCurrentAppTimestamp,
  getSimulatedAppDateValue,
  getWeekDays,
  localDateKey,
  localMonthKey,
  localWeekKey,
  localWeekStart,
  minutesToLabel,
  pad2,
  resetSimulatedAppDateToNow,
  setCurrentAppTimeMode,
  setSimulatedAppDateValue,
  shiftSimulatedAppDate,
  utcDateKey,
  utcMonthKey,
  utcWeekKey,
  utcWeekStart,
} from "../../src/app/utils/date.js";
import { installMockLocalStorage, uninstallMockLocalStorage } from "../helpers/browser-globals.js";

test.beforeEach(() => {
  installMockLocalStorage();
});

test.afterEach(() => {
  uninstallMockLocalStorage();
});

test("pad2 et formatDateTimeInputValue formattent les dates", () => {
  const date = new Date("2026-04-20T09:05:00");
  assert.equal(pad2(3), "03");
  assert.equal(formatDateTimeInputValue(date), "2026-04-20T09:05");
});

test("la simulation temporelle pilote la date courante de l application", () => {
  setCurrentAppTimeMode("simulated");
  setSimulatedAppDateValue("2026-04-20T10:30");
  assert.equal(formatDateTimeInputValue(getCurrentAppDate()), "2026-04-20T10:30");

  shiftSimulatedAppDate(7);
  assert.equal(localDateKey(getCurrentAppDate()), "2026-04-27");
});

test("localWeekStart et localWeekKey se calent sur le lundi", () => {
  const source = new Date("2026-04-23T14:00:00");
  const weekStart = localWeekStart(source);
  assert.equal(localDateKey(weekStart), "2026-04-20");
  assert.equal(localWeekKey(source), "2026-04-20");
});

test("addMinutesToTime ajoute correctement des minutes a une heure", () => {
  assert.equal(addMinutesToTime("09:00", 30), "09:30");
  assert.equal(addMinutesToTime("23:50", 20), "00:10");
});

// ── Mode temps simule ─────────────────────────────────────────────────────

test("mode temps : reel par defaut, et seule la valeur simulated bascule", () => {
  assert.equal(getCurrentAppTimeMode(), "real");

  setCurrentAppTimeMode("simulated");
  assert.equal(getCurrentAppTimeMode(), "simulated");

  setCurrentAppTimeMode("n-importe-quoi");
  assert.equal(getCurrentAppTimeMode(), "real");
});

test("mode temps : en mode reel, la date simulee est ignoree", () => {
  setSimulatedAppDateValue("2020-01-01T00:00");
  setCurrentAppTimeMode("real");
  const now = Date.now();
  assert.ok(Math.abs(getCurrentAppTimestamp() - now) < 5000);
});

test("mode temps : une date simulee invalide retombe sur maintenant", () => {
  setCurrentAppTimeMode("simulated");
  setSimulatedAppDateValue("pas-une-date");
  const stored = getSimulatedAppDateValue();
  assert.match(stored, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  assert.ok(Math.abs(getCurrentAppTimestamp() - Date.now()) < 60000);
});

test("mode temps : remettre a maintenant efface le decalage", () => {
  setCurrentAppTimeMode("simulated");
  setSimulatedAppDateValue("2020-01-01T00:00");
  resetSimulatedAppDateToNow();
  assert.equal(getSimulatedAppDateValue(), formatDateTimeInputValue(new Date()));
});

test("mode temps : decaler depuis le mode reel part de maintenant", () => {
  setCurrentAppTimeMode("real");
  shiftSimulatedAppDate(1);
  const expected = new Date();
  expected.setDate(expected.getDate() + 1);
  assert.equal(getSimulatedAppDateValue().slice(0, 10), localDateKey(expected));
});

test("mode temps : decaler accepte le negatif et ignore les valeurs non numeriques", () => {
  setCurrentAppTimeMode("simulated");
  setSimulatedAppDateValue("2026-04-20T10:30");

  shiftSimulatedAppDate(-3);
  assert.equal(localDateKey(getCurrentAppDate()), "2026-04-17");

  shiftSimulatedAppDate("bof");
  assert.equal(localDateKey(getCurrentAppDate()), "2026-04-17");
});

test("mode temps : un localStorage indisponible ne fait pas planter", () => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("acces refuse");
    },
  });

  assert.equal(getCurrentAppTimeMode(), "real");
  assert.equal(getSimulatedAppDateValue(), "");
  assert.doesNotThrow(() => setCurrentAppTimeMode("simulated"));
  assert.doesNotThrow(() => setSimulatedAppDateValue("2026-04-20T10:00"));
});

// ── Formats ───────────────────────────────────────────────────────────────

test("formatDateTimeInputValue : une date invalide donne une chaine vide", () => {
  assert.equal(formatDateTimeInputValue(new Date("nawak")), "");
  assert.equal(formatDateTimeInputValue("2026-04-20"), "");
  assert.equal(formatDateTimeInputValue(null), "");
});

test("frDateLabel : jour/mois/annee sur deux chiffres", () => {
  assert.equal(frDateLabel(new Date(2026, 3, 5)), "05/04/2026");
  assert.equal(frDateLabel(new Date(2026, 11, 25)), "25/12/2026");
});

test("formatHeaderDate : libelle francais complet", () => {
  assert.equal(formatHeaderDate(new Date(2026, 3, 20)), "lundi 20 avril 2026");
});

test("formatHeaderDate : sans argument, utilise la date applicative", () => {
  setCurrentAppTimeMode("simulated");
  setSimulatedAppDateValue("2026-04-20T10:00");
  assert.equal(formatHeaderDate(), "lundi 20 avril 2026");
});

test("minutesToLabel : minutes, heures rondes et heures + minutes", () => {
  assert.equal(minutesToLabel(0), "0 min");
  assert.equal(minutesToLabel(45), "45 min");
  assert.equal(minutesToLabel(60), "1h");
  assert.equal(minutesToLabel(120), "2h");
  assert.equal(minutesToLabel(75), "1h15");
  assert.equal(minutesToLabel(65), "1h05", "les minutes sont sur deux chiffres");
  assert.equal(minutesToLabel("90"), "1h30");
  assert.equal(minutesToLabel(undefined), "0 min");
});

test("addMinutesToTime : depassement de minuit et valeurs par defaut", () => {
  assert.equal(addMinutesToTime("22:30", 180), "01:30");
  assert.equal(addMinutesToTime(undefined, 30), "09:30", "sans heure de depart, on part de 09:00");
  assert.equal(addMinutesToTime("10:00", "abc"), "10:00");
  assert.equal(addMinutesToTime("10:00", -30), "09:30");
});

// ── Cles calendaires ──────────────────────────────────────────────────────

test("localMonthKey : annee-mois sur deux chiffres", () => {
  assert.equal(localMonthKey(new Date(2026, 0, 31)), "2026-01");
  assert.equal(localMonthKey(new Date(2026, 11, 1)), "2026-12");
});

test("cles UTC : jour, mois et semaine calee sur le lundi", () => {
  const jeudi = new Date(Date.UTC(2026, 3, 23, 22, 0));
  assert.equal(utcDateKey(jeudi), "2026-04-23");
  assert.equal(utcMonthKey(jeudi), "2026-04");
  assert.equal(utcDateKey(utcWeekStart(jeudi)), "2026-04-20");
  assert.equal(utcWeekKey(jeudi), "2026-04-20");
});

test("cles UTC : un dimanche appartient a la semaine qui l a precede", () => {
  const dimanche = new Date(Date.UTC(2026, 3, 26, 12, 0));
  assert.equal(utcWeekKey(dimanche), "2026-04-20");
});

test("localWeekStart : un lundi est son propre debut de semaine, a minuit", () => {
  const start = localWeekStart(new Date(2026, 3, 20, 23, 59));
  assert.equal(localDateKey(start), "2026-04-20");
  assert.equal(start.getHours(), 0);
  assert.equal(start.getMinutes(), 0);
});

test("localWeekKey : un dimanche reste rattache au lundi precedent", () => {
  assert.equal(localWeekKey(new Date(2026, 3, 26, 12, 0)), "2026-04-20");
});

// ── Peremption ────────────────────────────────────────────────────────────

test("daysUntilExpiry : positif avant, zero le jour meme, negatif apres", () => {
  setCurrentAppTimeMode("simulated");
  setSimulatedAppDateValue("2026-04-20T14:30");

  assert.equal(daysUntilExpiry("2026-04-23"), 3);
  assert.equal(daysUntilExpiry("2026-04-20"), 0, "le jour meme compte pour zero, pas pour -1");
  assert.equal(daysUntilExpiry("2026-04-18"), -2);
});

test("daysUntilExpiry : sans date ou avec une date invalide, on ne sait pas", () => {
  assert.equal(daysUntilExpiry(""), null);
  assert.equal(daysUntilExpiry(null), null);
  assert.equal(daysUntilExpiry(undefined), null);
  assert.equal(daysUntilExpiry("pas-une-date"), null);
});

// ── Semaine affichee ──────────────────────────────────────────────────────

test("getWeekDays : sept jours consecutifs du lundi au dimanche", () => {
  setCurrentAppTimeMode("simulated");
  setSimulatedAppDateValue("2026-04-23T10:00"); // un jeudi

  const days = getWeekDays(0);
  assert.equal(days.length, 7);
  assert.deepEqual(days.map(localDateKey), [
    "2026-04-20", "2026-04-21", "2026-04-22", "2026-04-23", "2026-04-24", "2026-04-25", "2026-04-26",
  ]);
});

test("getWeekDays : le decalage se compte en semaines, avant comme apres", () => {
  setCurrentAppTimeMode("simulated");
  setSimulatedAppDateValue("2026-04-23T10:00");

  assert.equal(localDateKey(getWeekDays(1)[0]), "2026-04-27");
  assert.equal(localDateKey(getWeekDays(-1)[0]), "2026-04-13");
  assert.equal(localDateKey(getWeekDays(-1)[6]), "2026-04-19");
});

test("getWeekDays : franchit un changement de mois sans trou", () => {
  setCurrentAppTimeMode("simulated");
  setSimulatedAppDateValue("2026-04-30T10:00"); // jeudi

  assert.deepEqual(getWeekDays(0).map(localDateKey), [
    "2026-04-27", "2026-04-28", "2026-04-29", "2026-04-30", "2026-05-01", "2026-05-02", "2026-05-03",
  ]);
});
