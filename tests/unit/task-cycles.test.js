import test from "node:test";
import assert from "node:assert/strict";

import { checkReset } from "../../src/app/utils/state.js";
import { installMockLocalStorage, uninstallMockLocalStorage } from "../helpers/browser-globals.js";

// Les bornes de cycle sont calculees en UTC : les dates de reference le sont aussi.
const MONDAY_10H = new Date(Date.UTC(2026, 3, 20, 10, 0)); // lundi 20 avril 2026

test.beforeEach(() => {
  installMockLocalStorage();
});

test.afterEach(() => {
  uninstallMockLocalStorage();
});

function recurring(overrides = {}) {
  return {
    id: "r1",
    text: "Sortir les poubelles",
    type: "daily",
    taskKind: "recurring",
    recurrenceFrequency: "daily",
    recurrenceTime: "00:00",
    ...overrides,
  };
}

// ── Cles de reset ─────────────────────────────────────────────────────────

test("reset : les trois cles suivent le jour, la semaine et le mois", () => {
  const { state } = checkReset({ tasks: [] }, new Date(Date.UTC(2026, 3, 22, 15, 0))); // mercredi
  assert.equal(state.lastResetDaily, "2026-04-22");
  assert.equal(state.lastResetWeekly, "2026-04-20", "la semaine demarre le lundi");
  assert.equal(state.lastResetMonthly, "2026-04");
});

test("reset : rejouer le meme jour ne signale aucun changement", () => {
  const first = checkReset({ tasks: [] }, MONDAY_10H);
  const second = checkReset(first.state, MONDAY_10H);
  assert.equal(second.changed, false);
});

// ── Menage des taches uniques ─────────────────────────────────────────────

test("reset : au changement de jour, les taches uniques faites disparaissent", () => {
  const input = {
    lastResetDaily: "2026-04-19",
    tasks: [
      { id: "faite-donneby", type: "daily", taskKind: "single", doneBy: ["p1"] },
      { id: "faite-completee", type: "daily", taskKind: "single", completedByPersonId: "p1" },
      { id: "a-faire", type: "daily", taskKind: "single" },
    ],
  };
  const { state, changed } = checkReset(input, MONDAY_10H);
  assert.deepEqual(state.tasks.map((task) => task.id), ["a-faire"]);
  assert.equal(changed, true);
});

test("reset : le meme jour, une tache unique faite reste affichee", () => {
  const input = {
    lastResetDaily: "2026-04-20",
    tasks: [{ id: "faite", type: "daily", taskKind: "single", doneBy: ["p1"] }],
  };
  const { state } = checkReset(input, MONDAY_10H);
  assert.deepEqual(state.tasks.map((task) => task.id), ["faite"]);
});

test("reset : une recurrente faite n est jamais supprimee au changement de jour", () => {
  const input = {
    lastResetDaily: "2026-04-19",
    tasks: [recurring({ doneBy: ["p1"], currentCycleKey: "2026-04-20T00:00" })],
  };
  const { state } = checkReset(input, MONDAY_10H);
  assert.equal(state.tasks.length, 1);
  assert.deepEqual(state.tasks[0].doneBy, ["p1"], "le cycle est le meme : la completion tient");
});

// ── Cycles quotidiens ─────────────────────────────────────────────────────

test("cycles : une recurrente sans cycle se voit poser le cycle courant", () => {
  const { state, changed } = checkReset({ tasks: [recurring()] }, MONDAY_10H);
  assert.equal(state.tasks[0].currentCycleKey, "2026-04-20T00:00");
  assert.equal(state.tasks[0].missedCount, 0, "poser le premier cycle ne compte pas un manque");
  assert.equal(changed, true);
});

test("cycles : un nouveau cycle sans completion incremente le compteur de manques", () => {
  const input = { tasks: [recurring({ currentCycleKey: "2026-04-19T00:00", missedCount: 1 })] };
  const { state, changed } = checkReset(input, MONDAY_10H);
  assert.equal(state.tasks[0].currentCycleKey, "2026-04-20T00:00");
  assert.equal(state.tasks[0].missedCount, 2);
  assert.equal(changed, true);
});

test("cycles : un nouveau cycle avec completion remet a zero sans compter de manque", () => {
  const input = {
    tasks: [recurring({ currentCycleKey: "2026-04-19T00:00", missedCount: 0, doneBy: ["p1"], completedByPersonId: "p1", completedAt: "2026-04-19T20:00:00.000Z" })],
  };
  const { state } = checkReset(input, MONDAY_10H);
  assert.equal(state.tasks[0].missedCount, 0);
  assert.deepEqual(state.tasks[0].doneBy, []);
  assert.equal(state.tasks[0].completedByPersonId, "");
  assert.equal(state.tasks[0].completedAt, "");
});

test("cycles : la borne quotidienne bascule a l heure configuree", () => {
  const task = recurring({ recurrenceTime: "18:00" });

  // 10h : la borne de 18h n'est pas encore passee, on retombe sur la veille.
  const before = checkReset({ tasks: [task] }, MONDAY_10H);
  assert.equal(before.state.tasks[0].currentCycleKey, "2026-04-19T18:00");

  // 20h : la borne du jour est passee.
  const after = checkReset({ tasks: [task] }, new Date(Date.UTC(2026, 3, 20, 20, 0)));
  assert.equal(after.state.tasks[0].currentCycleKey, "2026-04-20T18:00");
});

// ── Cycles hebdomadaires ──────────────────────────────────────────────────

test("cycles : une hebdomadaire se cale sur le dernier jour coche", () => {
  // Mercredi 22, tache calee sur lundi (1) → dernier passage lundi 20.
  const input = { tasks: [recurring({ type: "weekly", recurrenceFrequency: "weekly", recurrenceDaysOfWeek: [1] })] };
  const { state } = checkReset(input, new Date(Date.UTC(2026, 3, 22, 9, 0)));
  assert.equal(state.tasks[0].currentCycleKey, "2026-04-20T00:00");
});

test("cycles : une hebdomadaire multi-jours prend le plus recent passe", () => {
  // Jours lundi(1) et jeudi(4) ; on est vendredi 24 → dernier passage jeudi 23.
  const input = { tasks: [recurring({ type: "weekly", recurrenceFrequency: "weekly", recurrenceDaysOfWeek: [1, 4] })] };
  const { state } = checkReset(input, new Date(Date.UTC(2026, 3, 24, 9, 0)));
  assert.equal(state.tasks[0].currentCycleKey, "2026-04-23T00:00");
});

test("cycles : une hebdomadaire sans jour declare vise le lundi", () => {
  const input = { tasks: [recurring({ type: "weekly", recurrenceFrequency: "weekly", recurrenceDaysOfWeek: [] })] };
  const { state } = checkReset(input, new Date(Date.UTC(2026, 3, 22, 9, 0)));
  assert.equal(state.tasks[0].currentCycleKey, "2026-04-20T00:00");
});

test("cycles : le jour meme avant l heure, l hebdomadaire pointe la semaine precedente", () => {
  // Lundi 20 a 6h, tache calee lundi 08:00 → la borne du jour n'est pas passee.
  const input = { tasks: [recurring({ type: "weekly", recurrenceFrequency: "weekly", recurrenceDaysOfWeek: [1], recurrenceTime: "08:00" })] };
  const { state } = checkReset(input, new Date(Date.UTC(2026, 3, 20, 6, 0)));
  assert.equal(state.tasks[0].currentCycleKey, "2026-04-13T08:00");
});

// ── Cycles mensuels ───────────────────────────────────────────────────────

test("cycles : une mensuelle deja passee ce mois-ci pointe le mois courant", () => {
  const input = { tasks: [recurring({ type: "monthly", recurrenceFrequency: "monthly", recurrenceDayOfMonth: 5 })] };
  const { state } = checkReset(input, MONDAY_10H);
  assert.equal(state.tasks[0].currentCycleKey, "2026-04-05T00:00");
});

test("cycles : une mensuelle a venir pointe encore le mois precedent", () => {
  const input = { tasks: [recurring({ type: "monthly", recurrenceFrequency: "monthly", recurrenceDayOfMonth: 28 })] };
  const { state } = checkReset(input, MONDAY_10H);
  assert.equal(state.tasks[0].currentCycleKey, "2026-03-28T00:00");
});

test("cycles : le 31 est ramene au dernier jour des mois plus courts", () => {
  // 15 mars 2026 : le 31 n'est pas encore passe ce mois-ci → fevrier, qui finit le 28.
  const input = { tasks: [recurring({ type: "monthly", recurrenceFrequency: "monthly", recurrenceDayOfMonth: 31 })] };
  const { state } = checkReset(input, new Date(Date.UTC(2026, 2, 15, 9, 0)));
  assert.equal(state.tasks[0].currentCycleKey, "2026-02-28T00:00");
});

test("cycles : le passage a l annee precedente est gere", () => {
  // 10 janvier 2027, echeance le 20 → dernier passage : 20 decembre 2026.
  const input = { tasks: [recurring({ type: "monthly", recurrenceFrequency: "monthly", recurrenceDayOfMonth: 20 })] };
  const { state } = checkReset(input, new Date(Date.UTC(2027, 0, 10, 9, 0)));
  assert.equal(state.tasks[0].currentCycleKey, "2026-12-20T00:00");
});

// ── Etat « en retard » ────────────────────────────────────────────────────

test("cycles : le marqueur en retard est efface sur les recurrentes comme sur les uniques", () => {
  const input = {
    tasks: [
      recurring({ id: "r1", overdue: true, currentCycleKey: "2026-04-20T00:00" }),
      { id: "s1", type: "daily", taskKind: "single", overdue: true },
    ],
  };
  const { state } = checkReset(input, MONDAY_10H);
  state.tasks.forEach((task) => assert.equal(task.overdue, false));
});

test("cycles : plusieurs taches sont traitees independamment", () => {
  const input = {
    lastResetDaily: "2026-04-20",
    tasks: [
      recurring({ id: "a", currentCycleKey: "2026-04-19T00:00" }),
      recurring({ id: "b", currentCycleKey: "2026-04-20T00:00", missedCount: 4 }),
      { id: "c", type: "daily", taskKind: "single", doneBy: ["p1"] },
    ],
  };
  const { state } = checkReset(input, MONDAY_10H);
  const byId = Object.fromEntries(state.tasks.map((task) => [task.id, task]));
  assert.equal(byId.a.missedCount, 1, "cycle manque");
  assert.equal(byId.b.missedCount, 4, "cycle inchange");
  assert.deepEqual(byId.c.doneBy, ["p1"], "tache unique conservee le meme jour");
});
