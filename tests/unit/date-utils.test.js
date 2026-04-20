import test from "node:test";
import assert from "node:assert/strict";

import {
  addMinutesToTime,
  formatDateTimeInputValue,
  getCurrentAppDate,
  localDateKey,
  localWeekKey,
  localWeekStart,
  pad2,
  setCurrentAppTimeMode,
  setSimulatedAppDateValue,
  shiftSimulatedAppDate,
} from "../../src/utils/date.js";
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
