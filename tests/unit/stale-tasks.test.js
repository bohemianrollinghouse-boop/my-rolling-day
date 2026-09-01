import test from "node:test";
import assert from "node:assert/strict";

import { getStaleTaskAlerts } from "../../src/app/utils/staleTasks.js";

const NOW = new Date("2026-04-20T10:00:00");

function daysAgo(days) {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

test("relances : une tache semaine non faite depuis 6 jours declenche une relance", () => {
  const alerts = getStaleTaskAlerts(
    [{ id: "t1", type: "weekly", taskKind: "single", createdAt: daysAgo(6) }],
    NOW,
  );
  assert.deepEqual(alerts, [{ taskId: "t1", kind: "single", period: "weekly" }]);
});

test("relances : sous le seuil, rien n est propose", () => {
  const alerts = getStaleTaskAlerts(
    [
      { id: "t1", type: "weekly", taskKind: "single", createdAt: daysAgo(5.9) },
      { id: "t2", type: "monthly", taskKind: "single", createdAt: daysAgo(26.9) },
    ],
    NOW,
  );
  assert.deepEqual(alerts, []);
});

test("relances : une tache mois non faite depuis 27 jours declenche une relance", () => {
  const alerts = getStaleTaskAlerts(
    [{ id: "t2", type: "monthly", taskKind: "single", createdAt: daysAgo(27) }],
    NOW,
  );
  assert.deepEqual(alerts, [{ taskId: "t2", kind: "single", period: "monthly" }]);
});

test("relances : une tache quotidienne n est jamais relancee", () => {
  const alerts = getStaleTaskAlerts(
    [{ id: "t3", type: "daily", taskKind: "single", createdAt: daysAgo(90) }],
    NOW,
  );
  assert.deepEqual(alerts, []);
});

test("relances : une tache faite est ignoree, quel que soit le marqueur", () => {
  const base = { type: "weekly", taskKind: "single", createdAt: daysAgo(30) };
  const alerts = getStaleTaskAlerts(
    [
      { ...base, id: "done-by", doneBy: ["p1"] },
      { ...base, id: "completed-by", completedByPersonId: "p1" },
      { ...base, id: "empty-done-by", doneBy: ["", null] },
    ],
    NOW,
  );
  // Seule la tache dont doneBy ne contient que des valeurs vides reste "non faite".
  assert.deepEqual(alerts, [{ taskId: "empty-done-by", kind: "single", period: "weekly" }]);
});

test("relances : archivee, deadline ou deja ecartee → aucune relance", () => {
  const base = { type: "weekly", taskKind: "single", createdAt: daysAgo(30) };
  const alerts = getStaleTaskAlerts(
    [
      { ...base, id: "archived", archived: true },
      { ...base, id: "priority-deadline", priority: "deadline" },
      { ...base, id: "display-deadline", displayPeriod: "deadline" },
      { ...base, id: "dismissed", staleNoticeDismissedAt: "2026-04-19T08:00:00.000Z" },
    ],
    NOW,
  );
  assert.deepEqual(alerts, []);
});

test("relances : une recurrente relance a chaque nouveau cycle manque", () => {
  const alerts = getStaleTaskAlerts(
    [
      { id: "r1", taskKind: "recurring", type: "weekly", missedCount: 2, staleNoticeMissedCount: 1 },
      { id: "r2", taskKind: "recurring", type: "monthly", missedCount: 1, staleNoticeMissedCount: 0 },
    ],
    NOW,
  );
  assert.deepEqual(alerts, [
    { taskId: "r1", kind: "recurring", period: "weekly", missedCount: 2 },
    { taskId: "r2", kind: "recurring", period: "monthly", missedCount: 1 },
  ]);
});

test("relances : une recurrente deja signalee ne repasse pas", () => {
  const alerts = getStaleTaskAlerts(
    [{ id: "r1", taskKind: "recurring", type: "weekly", missedCount: 3, staleNoticeMissedCount: 3 }],
    NOW,
  );
  assert.deepEqual(alerts, []);
});

test("relances : une recurrente quotidienne n est pas relancee", () => {
  const alerts = getStaleTaskAlerts(
    [{ id: "r1", taskKind: "recurring", type: "daily", missedCount: 9, staleNoticeMissedCount: 0 }],
    NOW,
  );
  assert.deepEqual(alerts, []);
});

test("relances : une date de creation invalide ou absente ne declenche rien", () => {
  const alerts = getStaleTaskAlerts(
    [
      { id: "t1", type: "weekly", taskKind: "single", createdAt: "pas-une-date" },
      { id: "t2", type: "weekly", taskKind: "single" },
    ],
    NOW,
  );
  assert.deepEqual(alerts, []);
});

test("relances : une entree non tableau renvoie une liste vide", () => {
  assert.deepEqual(getStaleTaskAlerts(null, NOW), []);
  assert.deepEqual(getStaleTaskAlerts(undefined, NOW), []);
});
