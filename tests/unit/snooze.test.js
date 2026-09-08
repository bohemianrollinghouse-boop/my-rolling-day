import test from "node:test";
import assert from "node:assert/strict";

import {
  SNOOZE_OPTIONS,
  canSnoozeReminder,
  reminderAudience,
  snoozeDueDate,
  taskConcernsPerson,
} from "../../src/app/utils/snooze.js";

test("report : la feuille d action propose exactement trois creneaux", () => {
  assert.deepEqual(SNOOZE_OPTIONS.map((o) => o.id), ["1h", "20h", "tomorrow"]);
});

test("report : « dans 1 heure » ajoute soixante minutes", () => {
  const now = new Date("2026-04-20T10:12:00");
  assert.equal(snoozeDueDate("1h", now).toISOString(), new Date("2026-04-20T11:12:00").toISOString());
});

test("report : « ce soir » vise 20 h le jour meme", () => {
  const due = snoozeDueDate("20h", new Date("2026-04-20T10:00:00"));
  assert.equal(due.getDate(), 20);
  assert.equal(due.getHours(), 20);
  assert.equal(due.getMinutes(), 0);
});

// Sans ce basculement, un report demande a 20h30 partirait dans la seconde.
test("report : passe 20 h, « ce soir » bascule au lendemain", () => {
  const due = snoozeDueDate("20h", new Date("2026-04-20T20:30:00"));
  assert.equal(due.getDate(), 21);
  assert.equal(due.getHours(), 20);
});

test("report : a 20 h pile, « ce soir » bascule aussi au lendemain", () => {
  const due = snoozeDueDate("20h", new Date("2026-04-20T20:00:00"));
  assert.equal(due.getDate(), 21);
});

test("report : « demain » vise 9 h le lendemain, fin de mois comprise", () => {
  const due = snoozeDueDate("tomorrow", new Date("2026-04-30T23:40:00"));
  assert.equal(due.getMonth(), 4); // mai
  assert.equal(due.getDate(), 1);
  assert.equal(due.getHours(), 9);
});

// ── Perimetre du rappel : qui le recoit, qui peut le reporter ──────────────

const TASKS = [
  { id: "solo", assignedPersonIds: ["p1"] },
  { id: "duo", assignedPersonIds: ["p1", "p2"] },
  { id: "libre" },
  { id: "foyer", assignedWholeFamily: true },
  { id: "legacy", assignedPersonId: "p2" },
];
const AGENDA = [
  { id: "e-solo", personIds: ["p2"] },
  { id: "e-foyer", wholeFamily: true },
  { id: "e-libre" },
];

test("perimetre : une tache assignee ne concerne que ses assignes", () => {
  assert.deepEqual(
    reminderAudience({ notifType: "due", taskId: "solo" }, { tasks: TASKS }),
    { scope: "person", personIds: ["p1"] },
  );
  assert.deepEqual(
    reminderAudience({ notifType: "due", taskId: "duo" }, { tasks: TASKS }),
    { scope: "person", personIds: ["p1", "p2"] },
  );
  assert.deepEqual(
    reminderAudience({ notifType: "urgent", taskId: "legacy" }, { tasks: TASKS }),
    { scope: "person", personIds: ["p2"] },
  );
});

test("perimetre : sans assigne — ou assignee au foyer — c est l affaire de la maison", () => {
  for (const taskId of ["libre", "foyer"]) {
    assert.equal(
      reminderAudience({ notifType: "due", taskId }, { tasks: TASKS }).scope,
      "household",
      taskId,
    );
  }
});

// Le recapitulatif melange les assignations : il ne peut pas etre personnel.
test("perimetre : la fin de journee reste une affaire de foyer", () => {
  assert.equal(
    reminderAudience({ notifType: "end-of-day" }, { tasks: TASKS }).scope,
    "household",
  );
});

test("perimetre : un evenement d agenda suit la meme regle", () => {
  assert.deepEqual(
    reminderAudience({ notifType: "event", eventId: "e-solo" }, { agenda: AGENDA }),
    { scope: "person", personIds: ["p2"] },
  );
  assert.equal(reminderAudience({ notifType: "event", eventId: "e-foyer" }, { agenda: AGENDA }).scope, "household");
  assert.equal(reminderAudience({ notifType: "event", eventId: "e-libre" }, { agenda: AGENDA }).scope, "household");
});

// Un evenement introuvable ne doit pas ouvrir un report a n importe qui.
test("perimetre : une cible inconnue retombe sur le foyer", () => {
  assert.equal(reminderAudience({ notifType: "due", taskId: "fantome" }, { tasks: TASKS }).scope, "household");
  assert.equal(reminderAudience(null).scope, "household");
});

test("report : un assigne reporte son rappel, meme sans etre admin", () => {
  const audience = reminderAudience({ notifType: "due", taskId: "solo" }, { tasks: TASKS });
  assert.equal(canSnoozeReminder(audience, { personId: "p1", role: "member" }), true);
});

test("report : un non-assigne ne reporte pas le rappel d un autre", () => {
  const audience = reminderAudience({ notifType: "due", taskId: "solo" }, { tasks: TASKS });
  assert.equal(canSnoozeReminder(audience, { personId: "p2", role: "member" }), false);
  // Meme admin : ce rappel n est pas le sien.
  assert.equal(canSnoozeReminder(audience, { personId: "p2", role: "admin" }), false);
});

test("report : un rappel de foyer ne se reporte que par un admin", () => {
  const audience = reminderAudience({ notifType: "end-of-day" }, { tasks: TASKS });
  assert.equal(canSnoozeReminder(audience, { personId: "p1", role: "member" }), false);
  assert.equal(canSnoozeReminder(audience, { personId: "p1", role: "admin" }), true);
});

test("chemin local : une tache assignee ne s affiche pas chez les autres", () => {
  assert.equal(taskConcernsPerson({ assignedPersonIds: ["p1"] }, "p1"), true);
  assert.equal(taskConcernsPerson({ assignedPersonIds: ["p1"] }, "p2"), false);
  assert.equal(taskConcernsPerson({}, "p2"), true);
  assert.equal(taskConcernsPerson({ assignedWholeFamily: true }, "p2"), true);
});

// Sinon le rappel partirait bien a tout le foyer (bascule serveur), mais plus
// personne n aurait le droit de le reporter.
test("perimetre : assignee a des personnes sans compte, le foyer reprend la main", () => {
  const people = [
    { id: "p1", linkedAccountId: "uid-1" },
    { id: "enfant", linkedAccountId: "" },
  ];
  assert.equal(
    reminderAudience({ notifType: "due", taskId: "enfant-seul" },
      { tasks: [{ id: "enfant-seul", assignedPersonIds: ["enfant"] }], people }).scope,
    "household",
  );
  // Un seul assigne avec compte suffit a garder le rappel personnel.
  assert.deepEqual(
    reminderAudience({ notifType: "due", taskId: "mixte" },
      { tasks: [{ id: "mixte", assignedPersonIds: ["enfant", "p1"] }], people }),
    { scope: "person", personIds: ["p1"] },
  );
});
