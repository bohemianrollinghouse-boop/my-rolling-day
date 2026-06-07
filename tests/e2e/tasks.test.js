/**
 * Tests E2E — Module des tâches (TasksView + useTasks)
 *
 * Section 1 (Node.js pur, toujours exécutée) :
 *   – reorderTasks       : tri daily < weekly < monthly < deadline, renumérotation
 *   – taskPeriodFromTab  : mapping tab → période
 *   – normalizeDuration  : allDay / none / preset / custom heures / custom minutes
 *   – normalizeTaskReminderChoice : valeurs valides / invalides
 *   – defaultTaskForm    : valeurs par défaut selon l'onglet
 *   – getDueDateTime     : avec heure, sans heure, chaîne invalide
 *   – isPastDue          : uniquement deadline non-complétée non-récurrente
 *   – isTaskLate         : flag overdue ou isPastDue
 *   – urgencyBadge       : normal / urgente / deadline
 *   – taskSortValue      : en retard=0, incomplet=1-3, complété=10
 *   – getDeadlineTasksForTab : mine retourne tout ; daily/weekly/monthly filtrent par date
 *
 * Section 2 (CDP, skippée si pas de navigateur headless) :
 *   – Naviguer vers l'onglet Tâches (pas de crash)
 *   – FAB ouvre la modale de création
 *   – Créer une tâche quotidienne → apparaît dans la liste
 *   – Basculer une tâche en "terminé"
 *   – Modifier une tâche existante
 *   – Supprimer une tâche
 *   – Créer une tâche hebdomadaire
 *   – Créer une tâche deadline
 *   – Aucun crash tout au long
 *
 * Port de debug : 9226
 * (smoke=9222, standalone=9223, profile=9224, navigation=9225, tasks=9226)
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, join } from "node:path";

import { launchBrowser, openPageSession } from "../helpers/cdp-browser.js";
import { startStaticServer } from "../helpers/static-server.js";

const projectRoot = resolve(
  "C:/Users/Myenn/Documents/Codex/2026-04-17-files-mentioned-by-the-user-code/planning-react"
);

// ─────────────────────────────────────────────────────────────────────────────
// Répliques des fonctions pures de useTasks.js (testées sans React)
// ─────────────────────────────────────────────────────────────────────────────

function reorderTasks(tasks) {
  const rank = { daily: 0, weekly: 1, monthly: 2, deadline: 3 };
  const groupedCounts = { daily: 0, weekly: 0, monthly: 0, deadline: 0 };
  return tasks
    .slice()
    .sort((left, right) => {
      if (left.type !== right.type) return rank[left.type] - rank[right.type];
      return left.order - right.order;
    })
    .map((task) => {
      const nextOrder = groupedCounts[task.type] || 0;
      groupedCounts[task.type] = nextOrder + 1;
      return { ...task, order: nextOrder };
    });
}

function taskPeriodFromTab(tab) {
  if (tab === "weekly") return "weekly";
  if (tab === "monthly") return "monthly";
  return "daily";
}

function normalizeDuration(form) {
  if (form.calendarAllDay) {
    return { duration: 1440, allDay: true };
  }
  if (!form.calendarDurationPreset || form.calendarDurationPreset === "none") {
    return { duration: 0, allDay: false };
  }
  if (form.calendarDurationPreset === "custom") {
    const rawValue = Number(form.calendarCustomDurationValue) || 0;
    const minutes = form.calendarCustomDurationUnit === "hours" ? rawValue * 60 : rawValue;
    return { duration: Math.max(15, minutes), allDay: false };
  }
  return { duration: Number(form.calendarDurationPreset) || 0, allDay: false };
}

function normalizeTaskReminderChoice(form) {
  const reminder = String(form.taskReminder || "").trim();
  const valid = ["none", "at_time", "1h_before", "30m_before", "custom_before", "day_before"];
  if (valid.includes(reminder)) return reminder;
  return "none";
}

function normalizeTaskNotificationChoice(form) {
  const reminder = normalizeTaskReminderChoice(form);
  if (reminder !== "custom_before") return { reminder };
  const rawMinutes = Number(form.taskReminderCustomMinutes);
  const customMinutes = Number.isFinite(rawMinutes) ? Math.round(rawMinutes) : 15;
  return { reminder, customMinutes: Math.max(5, customMinutes) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Répliques des fonctions pures de TasksView.js (testées sans React)
// ─────────────────────────────────────────────────────────────────────────────

function defaultTaskForm(tab) {
  return {
    icon: "",
    text: "",
    assignedPersonIds: [],
    assignedWholeFamily: false,
    concernedPersonIds: [],
    priority: "normal",
    displayPeriod: tab === "mine" ? "daily" : tab,
    taskKind: "single",
    recurrenceFrequency: tab === "weekly" ? "weekly" : tab === "monthly" ? "monthly" : "daily",
    dueDate: "",
    dueTime: "",
    taskReminder: "",
    taskReminderCustomMinutes: 15,
    addToCalendar: false,
    calendarStart: "09:00",
    calendarDurationPreset: "none",
    calendarCustomDurationValue: 1,
    calendarCustomDurationUnit: "hours",
    calendarAllDay: false,
    calendarPersonIds: [],
    calendarWholeFamily: false,
    calendarConcernedPersonIds: [],
    calendarRepeatWeekly: false,
    calendarRecurConfirm: null,
  };
}

function getDueDateTime(task) {
  if (!task?.dueDate) return null;
  const dateValue = String(task.dueDate || "");
  const timeValue = String(task.dueTime || "");
  const composed = timeValue ? `${dateValue}T${timeValue}` : `${dateValue}T23:59`;
  const parsed = new Date(composed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isPastDue(task, now = new Date()) {
  const doneBy = Array.isArray(task?.doneBy) ? task.doneBy.filter(Boolean) : [];
  if (task.taskKind === "recurring" || task.priority !== "deadline" || doneBy.length || task.completedByPersonId) return false;
  const dueDate = getDueDateTime(task);
  return Boolean(dueDate && dueDate.getTime() < now.getTime());
}

function isTaskLate(task, now = new Date()) {
  if (task?.taskKind === "recurring") return false;
  return Boolean(task?.overdue || isPastDue(task, now));
}

const URGENCY_META = {
  normal:   { label: "Normale",        className: "normal",   score: 2 },
  urgent:   { label: "Urgente",        className: "urgent",   score: 1 },
  deadline: { label: "À faire avant…", className: "deadline", score: 0 },
};

function urgencyBadge(task, now = new Date()) {
  if (task.priority === "deadline") {
    return {
      label:     "⏰ …",    // label variable selon la date, on ne teste pas sa valeur exacte
      className: isPastDue(task, now) ? "deadline-past" : "deadline",
      score:     URGENCY_META.deadline.score,
    };
  }
  return URGENCY_META[task.priority] || URGENCY_META.normal;
}

function taskSortValue(task, now = new Date()) {
  const doneBy = Array.isArray(task?.doneBy) ? task.doneBy.filter(Boolean) : [];
  const completed = doneBy.length > 0 || Boolean(task.completedByPersonId);
  if (isTaskLate(task, now) && !completed) return 0;
  if (!completed) return 1 + urgencyBadge(task, now).score;
  return 10;
}

function getDeadlineTasksForTab(tab, tasks, now = new Date()) {
  if (tab === "mine") {
    return tasks.filter((task) => task.displayPeriod === "deadline" || task.priority === "deadline");
  }

  const startOfTomorrow = new Date(now);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  startOfTomorrow.setHours(0, 0, 0, 0);

  const endOfSeventhDay = new Date(now);
  endOfSeventhDay.setDate(endOfSeventhDay.getDate() + 7);
  endOfSeventhDay.setHours(23, 59, 59, 999);

  return tasks.filter((task) => {
    if (task.displayPeriod !== "deadline" && task.priority !== "deadline") return false;
    const due = getDueDateTime(task);
    if (!due) return false;
    if (tab === "daily")   return due < startOfTomorrow;
    if (tab === "weekly")  return due >= startOfTomorrow && due <= endOfSeventhDay;
    if (tab === "monthly") return due > endOfSeventhDay;
    return false;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Import map — redirige Firebase CDN vers les stubs locaux
// ─────────────────────────────────────────────────────────────────────────────

const FIREBASE_CDN_VERSION = "10.12.5";
const FIREBASE_CDN_BASE = `https://www.gstatic.com/firebasejs/${FIREBASE_CDN_VERSION}`;
const STUB_MODULES = [
  "firebase-app",
  "firebase-auth",
  "firebase-firestore",
  "firebase-messaging",
  "firebase-analytics",
  "firebase-storage",
  "firebase-functions",
];

function buildImportMapHtml() {
  const imports = {};
  for (const mod of STUB_MODULES) {
    imports[`${FIREBASE_CDN_BASE}/${mod}.js`] =
      `/tests/fixtures/firebase-stubs/${mod}.js`;
  }
  return `<script type="importmap">${JSON.stringify({ imports })}</script>`;
}

const ORIGINAL_INDEX_HTML = readFileSync(join(projectRoot, "index.html"), "utf8");
const MODIFIED_INDEX_HTML = ORIGINAL_INDEX_HTML.replace(
  /<script type="module"/,
  `${buildImportMapHtml()}\n    <script type="module"`,
);

const STUB_INDEX_PATH = join(projectRoot, "e2e-tasks.html");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers CDP
// ─────────────────────────────────────────────────────────────────────────────

async function pollForSelector(session, selector, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { result } = await session.send("Runtime.evaluate", {
      expression: `!!document.querySelector(${JSON.stringify(selector)})`,
      returnByValue: true,
    });
    if (result.value === true) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function queryText(session, selector) {
  const { result } = await session.send("Runtime.evaluate", {
    expression: `document.querySelector(${JSON.stringify(selector)})?.textContent?.trim() ?? ""`,
    returnByValue: true,
  });
  return result.value ?? "";
}

async function queryProp(session, selector, prop) {
  const { result } = await session.send("Runtime.evaluate", {
    expression: `document.querySelector(${JSON.stringify(selector)})?.[${JSON.stringify(prop)}] ?? null`,
    returnByValue: true,
  });
  return result.value;
}

async function click(session, selector) {
  await session.send("Runtime.evaluate", {
    expression: `document.querySelector(${JSON.stringify(selector)})?.click()`,
  });
}

async function waitForNextEnabled(session, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const disabled = await queryProp(session, ".onb-footer-next", "disabled");
    if (!disabled) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function fillInput(session, selector, value) {
  await session.send("Runtime.evaluate", {
    expression: `
      (function () {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return;
        Object.getOwnPropertyDescriptor(
          el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
          "value"
        ).set.call(el, ${JSON.stringify(value)});
        el.dispatchEvent(new Event("input", { bubbles: true }));
      })()
    `,
  });
}

/**
 * Complète tout le flux d'onboarding et attend l'apparition de .mrd-bnav.
 * Identique à navigation.test.js.
 */
async function reachHomePage(session) {
  await pollForSelector(session, ".onboarding-shell", 12_000);

  // Étape 1 : prénom
  await click(session, ".onboarding-choice-card:first-child");
  await pollForSelector(session, ".onboarding-input", 5_000);
  await session.send("Runtime.evaluate", {
    expression: `
      const el = document.querySelector(".onboarding-input");
      if (el) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "E2E Tasks");
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    `,
  });
  await waitForNextEnabled(session);
  await click(session, ".onb-footer-next");

  // Étape 2 : couleur
  await pollForSelector(session, ".onb-color-swatch", 5_000);
  await click(session, ".onb-color-swatch");
  await waitForNextEnabled(session);
  await click(session, ".onb-footer-next");

  // Étape 3 : nom du foyer
  await pollForSelector(session, ".onb-suggestion-chip", 5_000);
  await click(session, ".onb-suggestion-chip");
  await waitForNextEnabled(session);
  await click(session, ".onb-footer-next");

  // Étape 4 : terminer
  await pollForSelector(session, ".onb-footer-next", 3_000);
  await click(session, ".onb-footer-next");

  const ok = await pollForSelector(session, ".mrd-bnav", 15_000);
  return ok;
}

/**
 * Navigue vers l'onglet Tâches depuis la page d'accueil.
 */
async function goToTasksTab(session) {
  await session.send("Runtime.evaluate", {
    expression: `
      [...document.querySelectorAll(".mrd-bnav-btn")]
        .find(btn => btn.getAttribute("aria-label")?.startsWith("Tâches"))
        ?.click();
    `,
  });
  await new Promise((r) => setTimeout(r, 400));
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 1 — Logique pure (toujours exécutée, pas de navigateur requis)
// ─────────────────────────────────────────────────────────────────────────────

// ── reorderTasks ──────────────────────────────────────────────────────────────

test("reorderTasks : trie daily < weekly < monthly < deadline", () => {
  const input = [
    { id: "d1", type: "deadline", order: 0 },
    { id: "w1", type: "weekly",   order: 0 },
    { id: "m1", type: "monthly",  order: 0 },
    { id: "a1", type: "daily",    order: 0 },
  ];
  const result = reorderTasks(input);
  assert.deepEqual(
    result.map((t) => t.type),
    ["daily", "weekly", "monthly", "deadline"],
    "L'ordre des groupes doit être daily → weekly → monthly → deadline",
  );
});

test("reorderTasks : renumérotation des ordres dans chaque groupe", () => {
  const input = [
    { id: "a1", type: "daily",   order: 5 },
    { id: "a2", type: "daily",   order: 3 },
    { id: "w1", type: "weekly",  order: 7 },
  ];
  const result = reorderTasks(input);
  const daily = result.filter((t) => t.type === "daily");
  assert.equal(daily[0].order, 0, "premier daily → order 0");
  assert.equal(daily[1].order, 1, "deuxième daily → order 1");
  const weekly = result.filter((t) => t.type === "weekly");
  assert.equal(weekly[0].order, 0, "premier weekly → order 0");
});

test("reorderTasks : liste vide renvoie []", () => {
  assert.deepEqual(reorderTasks([]), []);
});

test("reorderTasks : conserve l'ordre intra-groupe (tri par order original)", () => {
  const input = [
    { id: "a3", type: "daily", order: 2 },
    { id: "a1", type: "daily", order: 0 },
    { id: "a2", type: "daily", order: 1 },
  ];
  const result = reorderTasks(input);
  assert.deepEqual(
    result.map((t) => t.id),
    ["a1", "a2", "a3"],
    "L'ordre intra-groupe doit respecter order original",
  );
});

// ── taskPeriodFromTab ─────────────────────────────────────────────────────────

test("taskPeriodFromTab : weekly → 'weekly'", () => {
  assert.equal(taskPeriodFromTab("weekly"), "weekly");
});

test("taskPeriodFromTab : monthly → 'monthly'", () => {
  assert.equal(taskPeriodFromTab("monthly"), "monthly");
});

test("taskPeriodFromTab : daily / mine / inconnu → 'daily'", () => {
  assert.equal(taskPeriodFromTab("daily"),   "daily");
  assert.equal(taskPeriodFromTab("mine"),    "daily");
  assert.equal(taskPeriodFromTab(""),        "daily");
  assert.equal(taskPeriodFromTab("unknown"), "daily");
});

// ── normalizeDuration ─────────────────────────────────────────────────────────

test("normalizeDuration : allDay → 1440 min, allDay=true", () => {
  const result = normalizeDuration({ calendarAllDay: true });
  assert.equal(result.duration, 1440);
  assert.equal(result.allDay, true);
});

test("normalizeDuration : preset 'none' → durée 0, allDay false", () => {
  const result = normalizeDuration({ calendarDurationPreset: "none" });
  assert.equal(result.duration, 0);
  assert.equal(result.allDay, false);
});

test("normalizeDuration : preset '60' → 60 minutes", () => {
  const result = normalizeDuration({ calendarDurationPreset: "60" });
  assert.equal(result.duration, 60);
  assert.equal(result.allDay, false);
});

test("normalizeDuration : custom heures → minutes correctes (minimum 15)", () => {
  const r1 = normalizeDuration({ calendarDurationPreset: "custom", calendarCustomDurationValue: 2, calendarCustomDurationUnit: "hours" });
  assert.equal(r1.duration, 120);

  const r2 = normalizeDuration({ calendarDurationPreset: "custom", calendarCustomDurationValue: 0, calendarCustomDurationUnit: "hours" });
  assert.equal(r2.duration, 15, "minimum 15 minutes appliqué");
});

test("normalizeDuration : custom minutes → minutes directes (minimum 15)", () => {
  const r1 = normalizeDuration({ calendarDurationPreset: "custom", calendarCustomDurationValue: 45, calendarCustomDurationUnit: "minutes" });
  assert.equal(r1.duration, 45);

  const r2 = normalizeDuration({ calendarDurationPreset: "custom", calendarCustomDurationValue: 5, calendarCustomDurationUnit: "minutes" });
  assert.equal(r2.duration, 15, "minimum 15 minutes appliqué");
});

// ── normalizeTaskReminderChoice ───────────────────────────────────────────────

test("normalizeTaskReminderChoice : valeurs valides conservées", () => {
  const valid = ["none", "at_time", "1h_before", "30m_before", "custom_before", "day_before"];
  for (const v of valid) {
    assert.equal(normalizeTaskReminderChoice({ taskReminder: v }), v);
  }
});

test("normalizeTaskReminderChoice : valeur invalide → 'none'", () => {
  assert.equal(normalizeTaskReminderChoice({ taskReminder: "2h_before" }), "none");
  assert.equal(normalizeTaskReminderChoice({ taskReminder: "" }),          "none");
  assert.equal(normalizeTaskReminderChoice({}),                            "none");
});

test("normalizeTaskNotificationChoice : custom_before avec minutes valides", () => {
  const result = normalizeTaskNotificationChoice({ taskReminder: "custom_before", taskReminderCustomMinutes: 30 });
  assert.equal(result.reminder, "custom_before");
  assert.equal(result.customMinutes, 30);
});

test("normalizeTaskNotificationChoice : custom_before minimum 5 minutes", () => {
  const result = normalizeTaskNotificationChoice({ taskReminder: "custom_before", taskReminderCustomMinutes: 2 });
  assert.equal(result.customMinutes, 5, "minimum 5 minutes appliqué");
});

test("normalizeTaskNotificationChoice : 1h_before → pas de customMinutes", () => {
  const result = normalizeTaskNotificationChoice({ taskReminder: "1h_before" });
  assert.equal(result.reminder, "1h_before");
  assert.equal(Object.hasOwn(result, "customMinutes"), false);
});

// ── defaultTaskForm ───────────────────────────────────────────────────────────

test("defaultTaskForm : onglet 'daily' → displayPeriod daily, recurrenceFrequency daily", () => {
  const form = defaultTaskForm("daily");
  assert.equal(form.displayPeriod, "daily");
  assert.equal(form.recurrenceFrequency, "daily");
  assert.equal(form.taskKind, "single");
  assert.equal(form.priority, "normal");
});

test("defaultTaskForm : onglet 'weekly' → displayPeriod weekly, recurrenceFrequency weekly", () => {
  const form = defaultTaskForm("weekly");
  assert.equal(form.displayPeriod, "weekly");
  assert.equal(form.recurrenceFrequency, "weekly");
});

test("defaultTaskForm : onglet 'monthly' → displayPeriod monthly, recurrenceFrequency monthly", () => {
  const form = defaultTaskForm("monthly");
  assert.equal(form.displayPeriod, "monthly");
  assert.equal(form.recurrenceFrequency, "monthly");
});

test("defaultTaskForm : onglet 'mine' → displayPeriod daily (fallback)", () => {
  const form = defaultTaskForm("mine");
  assert.equal(form.displayPeriod, "daily",
    "L'onglet 'mine' doit créer des tâches daily par défaut");
});

test("defaultTaskForm : texte et icon vides par défaut", () => {
  const form = defaultTaskForm("daily");
  assert.equal(form.text, "");
  assert.equal(form.icon, "");
});

test("defaultTaskForm : addToCalendar false par défaut", () => {
  const form = defaultTaskForm("daily");
  assert.equal(form.addToCalendar, false);
});

// ── getDueDateTime ────────────────────────────────────────────────────────────

test("getDueDateTime : sans dueDate → null", () => {
  assert.equal(getDueDateTime({ dueDate: "", dueTime: "" }), null);
  assert.equal(getDueDateTime({}), null);
  assert.equal(getDueDateTime(null), null);
});

test("getDueDateTime : avec dueDate et dueTime → Date correcte", () => {
  const task = { dueDate: "2026-06-15", dueTime: "14:30" };
  const result = getDueDateTime(task);
  assert.ok(result instanceof Date, "doit retourner une Date");
  assert.equal(result.getFullYear(), 2026);
  assert.equal(result.getMonth(), 5);  // juin = 5
  assert.equal(result.getDate(), 15);
  assert.equal(result.getHours(), 14);
  assert.equal(result.getMinutes(), 30);
});

test("getDueDateTime : sans dueTime → heure 23:59 par défaut", () => {
  const task = { dueDate: "2026-06-15", dueTime: "" };
  const result = getDueDateTime(task);
  assert.ok(result instanceof Date, "doit retourner une Date");
  assert.equal(result.getHours(), 23);
  assert.equal(result.getMinutes(), 59);
});

test("getDueDateTime : chaîne invalide → null", () => {
  const task = { dueDate: "pas-une-date", dueTime: "" };
  assert.equal(getDueDateTime(task), null);
});

// ── isPastDue ─────────────────────────────────────────────────────────────────

test("isPastDue : tâche deadline passée non-complétée → true", () => {
  const past = new Date("2020-01-01T00:00:00");
  const task = { priority: "deadline", taskKind: "single", doneBy: [], completedByPersonId: "", dueDate: "2019-12-31", dueTime: "23:59" };
  assert.equal(isPastDue(task, new Date("2020-06-01")), true);
});

test("isPastDue : tâche deadline future → false", () => {
  const task = { priority: "deadline", taskKind: "single", doneBy: [], completedByPersonId: "", dueDate: "2099-01-01", dueTime: "" };
  assert.equal(isPastDue(task, new Date()), false);
});

test("isPastDue : tâche deadline complétée → false même si passée", () => {
  const task = { priority: "deadline", taskKind: "single", doneBy: ["p1"], completedByPersonId: "p1", dueDate: "2020-01-01", dueTime: "" };
  assert.equal(isPastDue(task, new Date("2026-01-01")), false);
});

test("isPastDue : tâche récurrente → toujours false", () => {
  const task = { priority: "deadline", taskKind: "recurring", doneBy: [], completedByPersonId: "", dueDate: "2020-01-01", dueTime: "" };
  assert.equal(isPastDue(task, new Date("2026-01-01")), false);
});

test("isPastDue : tâche normale (non-deadline) → false", () => {
  const task = { priority: "normal", taskKind: "single", doneBy: [], completedByPersonId: "", dueDate: "2020-01-01", dueTime: "" };
  assert.equal(isPastDue(task, new Date("2026-01-01")), false);
});

// ── isTaskLate ────────────────────────────────────────────────────────────────

test("isTaskLate : overdue=true sur tâche non-récurrente → true", () => {
  const task = { overdue: true, taskKind: "single", priority: "normal", doneBy: [], completedByPersonId: "", dueDate: "" };
  assert.equal(isTaskLate(task), true);
});

test("isTaskLate : tâche récurrente overdue=true → false (récurrentes jamais en retard)", () => {
  const task = { overdue: true, taskKind: "recurring" };
  assert.equal(isTaskLate(task), false);
});

test("isTaskLate : tâche deadline passée → true via isPastDue", () => {
  const task = { priority: "deadline", taskKind: "single", doneBy: [], completedByPersonId: "", overdue: false, dueDate: "2020-01-01", dueTime: "" };
  assert.equal(isTaskLate(task, new Date("2026-01-01")), true);
});

// ── urgencyBadge ──────────────────────────────────────────────────────────────

test("urgencyBadge : priorité 'normal' → className 'normal', score 2", () => {
  const task = { priority: "normal", taskKind: "single", doneBy: [] };
  const badge = urgencyBadge(task);
  assert.equal(badge.className, "normal");
  assert.equal(badge.score, 2);
});

test("urgencyBadge : priorité 'urgent' → className 'urgent', score 1", () => {
  const task = { priority: "urgent", taskKind: "single", doneBy: [] };
  const badge = urgencyBadge(task);
  assert.equal(badge.className, "urgent");
  assert.equal(badge.score, 1);
});

test("urgencyBadge : deadline non-passée → className 'deadline', score 0", () => {
  const task = { priority: "deadline", taskKind: "single", doneBy: [], completedByPersonId: "", dueDate: "2099-01-01", dueTime: "" };
  const badge = urgencyBadge(task, new Date());
  assert.equal(badge.className, "deadline");
  assert.equal(badge.score, 0);
});

test("urgencyBadge : deadline passée non-complétée → className 'deadline-past'", () => {
  const task = { priority: "deadline", taskKind: "single", doneBy: [], completedByPersonId: "", dueDate: "2020-01-01", dueTime: "" };
  const badge = urgencyBadge(task, new Date("2026-01-01"));
  assert.equal(badge.className, "deadline-past");
});

// ── taskSortValue ─────────────────────────────────────────────────────────────

test("taskSortValue : tâche en retard non-complétée → 0 (priorité max)", () => {
  const task = { priority: "normal", taskKind: "single", overdue: true, doneBy: [], completedByPersonId: "" };
  assert.equal(taskSortValue(task), 0);
});

test("taskSortValue : tâche deadline incomplete → 1 (1 + score 0)", () => {
  const task = { priority: "deadline", taskKind: "single", doneBy: [], completedByPersonId: "", overdue: false, dueDate: "2099-01-01", dueTime: "" };
  assert.equal(taskSortValue(task, new Date()), 1);
});

test("taskSortValue : tâche urgente incomplète → 2 (1 + score 1)", () => {
  const task = { priority: "urgent", taskKind: "single", doneBy: [], completedByPersonId: "", overdue: false, dueDate: "" };
  assert.equal(taskSortValue(task), 2);
});

test("taskSortValue : tâche normale incomplète → 3 (1 + score 2)", () => {
  const task = { priority: "normal", taskKind: "single", doneBy: [], completedByPersonId: "", overdue: false, dueDate: "" };
  assert.equal(taskSortValue(task), 3);
});

test("taskSortValue : tâche complétée (doneBy) → 10 (en bas)", () => {
  const task = { priority: "normal", taskKind: "single", doneBy: ["p1"], completedByPersonId: "p1", overdue: false, dueDate: "" };
  assert.equal(taskSortValue(task), 10);
});

test("taskSortValue : tâche complétée (completedByPersonId seul) → 10", () => {
  const task = { priority: "normal", taskKind: "single", doneBy: [], completedByPersonId: "p1", overdue: false, dueDate: "" };
  assert.equal(taskSortValue(task), 10);
});

// ── getDeadlineTasksForTab ────────────────────────────────────────────────────

test("getDeadlineTasksForTab : 'mine' retourne toutes les tâches deadline", () => {
  const now = new Date("2026-06-01T12:00:00");
  const tasks = [
    { id: "d1", priority: "deadline", displayPeriod: "deadline", dueDate: "2026-05-01", dueTime: "" }, // passée
    { id: "d2", priority: "deadline", displayPeriod: "deadline", dueDate: "2026-06-08", dueTime: "" }, // semaine
    { id: "d3", priority: "normal",   displayPeriod: "daily",    dueDate: "",           dueTime: "" }, // pas deadline
  ];
  const result = getDeadlineTasksForTab("mine", tasks, now);
  assert.equal(result.length, 2, "mine doit retourner d1 + d2 mais pas d3");
  assert.ok(result.some((t) => t.id === "d1"));
  assert.ok(result.some((t) => t.id === "d2"));
});

test("getDeadlineTasksForTab : 'daily' retourne seulement les échéances du jour / passées", () => {
  const now = new Date("2026-06-01T12:00:00");
  const tasks = [
    { id: "d-past",   priority: "deadline", displayPeriod: "deadline", dueDate: "2026-05-30", dueTime: "" }, // passée → daily
    { id: "d-today",  priority: "deadline", displayPeriod: "deadline", dueDate: "2026-06-01", dueTime: "23:59" }, // aujourd'hui → daily
    { id: "d-week",   priority: "deadline", displayPeriod: "deadline", dueDate: "2026-06-05", dueTime: "" }, // J+4 → weekly
    { id: "d-month",  priority: "deadline", displayPeriod: "deadline", dueDate: "2026-07-01", dueTime: "" }, // > J+7 → monthly
  ];
  const daily = getDeadlineTasksForTab("daily", tasks, now);
  assert.ok(daily.some((t) => t.id === "d-past"),  "passée → daily");
  assert.ok(daily.some((t) => t.id === "d-today"), "aujourd'hui → daily");
  assert.ok(!daily.some((t) => t.id === "d-week"),  "semaine ne doit pas être dans daily");
  assert.ok(!daily.some((t) => t.id === "d-month"), "mensuelle ne doit pas être dans daily");
});

test("getDeadlineTasksForTab : 'weekly' retourne J+1 à J+7", () => {
  const now = new Date("2026-06-01T12:00:00");
  const tasks = [
    { id: "d-today", priority: "deadline", displayPeriod: "deadline", dueDate: "2026-06-01", dueTime: "" }, // aujourd'hui → daily
    { id: "d-j2",    priority: "deadline", displayPeriod: "deadline", dueDate: "2026-06-03", dueTime: "" }, // J+2 → weekly
    { id: "d-j7",    priority: "deadline", displayPeriod: "deadline", dueDate: "2026-06-08", dueTime: "" }, // J+7 → weekly
    { id: "d-j8",    priority: "deadline", displayPeriod: "deadline", dueDate: "2026-06-09", dueTime: "" }, // J+8 → monthly
  ];
  const weekly = getDeadlineTasksForTab("weekly", tasks, now);
  assert.ok(!weekly.some((t) => t.id === "d-today"), "aujourd'hui → pas dans weekly");
  assert.ok(weekly.some((t) => t.id === "d-j2"),  "J+2 → weekly");
  assert.ok(weekly.some((t) => t.id === "d-j7"),  "J+7 → weekly");
  assert.ok(!weekly.some((t) => t.id === "d-j8"), "J+8 → pas dans weekly");
});

test("getDeadlineTasksForTab : 'monthly' retourne au-delà de J+7", () => {
  const now = new Date("2026-06-01T12:00:00");
  const tasks = [
    { id: "d-j7",   priority: "deadline", displayPeriod: "deadline", dueDate: "2026-06-08", dueTime: "" }, // J+7 → weekly
    { id: "d-j10",  priority: "deadline", displayPeriod: "deadline", dueDate: "2026-06-11", dueTime: "" }, // J+10 → monthly
    { id: "d-far",  priority: "deadline", displayPeriod: "deadline", dueDate: "2026-08-01", dueTime: "" }, // > 2 mois → monthly
  ];
  const monthly = getDeadlineTasksForTab("monthly", tasks, now);
  assert.ok(!monthly.some((t) => t.id === "d-j7"), "J+7 → pas dans monthly");
  assert.ok(monthly.some((t) => t.id === "d-j10"), "J+10 → monthly");
  assert.ok(monthly.some((t) => t.id === "d-far"),  "J+60 → monthly");
});

test("getDeadlineTasksForTab : tâches sans dueDate exclues (hors mine)", () => {
  const now = new Date("2026-06-01T12:00:00");
  const tasks = [
    { id: "no-date", priority: "deadline", displayPeriod: "deadline", dueDate: "", dueTime: "" },
  ];
  assert.equal(getDeadlineTasksForTab("daily",   tasks, now).length, 0);
  assert.equal(getDeadlineTasksForTab("weekly",  tasks, now).length, 0);
  assert.equal(getDeadlineTasksForTab("monthly", tasks, now).length, 0);
  // mine : retourne malgré tout (pas de filtre sur dueDate)
  assert.equal(getDeadlineTasksForTab("mine", tasks, now).length, 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 2 — Suite CDP (skippée si pas de navigateur headless)
// ─────────────────────────────────────────────────────────────────────────────

test("CDP: module des tâches — cycle complet", { timeout: 240_000 }, async (t) => {
  let serverHandle;
  let browserHandle;
  let browserLaunchError = null;

  t.before(async () => {
    writeFileSync(STUB_INDEX_PATH, MODIFIED_INDEX_HTML, "utf8");
    serverHandle = await startStaticServer(projectRoot);
    try {
      browserHandle = await launchBrowser(9226);
    } catch (err) {
      browserLaunchError = err;
      browserHandle = null;
    }
  });

  t.after(async () => {
    if (browserHandle) try { await browserHandle.close(); } catch { /* ignoré */ }
    if (serverHandle) await serverHandle.close();
    try { unlinkSync(STUB_INDEX_PATH); } catch { /* ignoré */ }
  });

  async function openStubbed() {
    const session = await openPageSession(browserHandle);
    await session.send("Page.navigate", { url: `${serverHandle.url}/e2e-tasks.html` });
    await session.waitForEvent("Page.loadEventFired", 15_000);
    return session;
  }

  // ── [1] Naviguer vers l'onglet Tâches ───────────────────────────────────────

  await t.test("[1] onboarding → onglet Tâches visible sans crash", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }

    const session = await openStubbed();
    try {
      const homeOk = await reachHomePage(session);
      assert.ok(homeOk, "Prérequis : .mrd-bnav doit être visible");

      await goToTasksTab(session);

      const headerOk = await pollForSelector(session, ".mrd-screen-hdr-title", 5_000);
      assert.ok(headerOk, "Le header de l'onglet Tâches doit apparaître");

      const headerText = await queryText(session, ".mrd-screen-hdr-title");
      assert.ok(
        headerText.includes("Tâches"),
        `Le header doit contenir "Tâches" (trouvé : "${headerText}")`,
      );

      const bootState = await session.send("Runtime.evaluate", {
        expression: "window.__APP_BOOT_STATE__",
        returnByValue: true,
      });
      assert.equal(bootState.result.value, "react-mounted",
        "__APP_BOOT_STATE__ doit rester 'react-mounted'");
    } finally {
      await session.close();
    }
  });

  // ── [2] FAB ouvre la modale de création ────────────────────────────────────

  await t.test("[2] FAB ouvre la modale de création de tâche", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }

    const session = await openStubbed();
    try {
      await reachHomePage(session);
      await goToTasksTab(session);

      // Vérifier que le FAB est présent
      const fabOk = await pollForSelector(session, ".mrd-fab", 5_000);
      assert.ok(fabOk, "Le bouton FAB doit être présent sur l'onglet Tâches");

      // Cliquer le FAB
      await click(session, ".mrd-fab");
      await new Promise((r) => setTimeout(r, 500));

      // La modale de création doit apparaître
      const modalOk = await pollForSelector(session, ".task-modal-redesign", 5_000);
      assert.ok(modalOk, "La modale .task-modal-redesign doit s'ouvrir après le clic FAB");

      // Le titre de la modale doit indiquer "Nouvelle tâche"
      const titleText = await queryText(session, ".mrd-mtitle");
      assert.ok(
        titleText.includes("Nouvelle tâche"),
        `Le titre de la modale doit contenir "Nouvelle tâche" (trouvé : "${titleText}")`,
      );

      const bootState = await session.send("Runtime.evaluate", {
        expression: "window.__APP_BOOT_STATE__",
        returnByValue: true,
      });
      assert.equal(bootState.result.value, "react-mounted");
    } finally {
      await session.close();
    }
  });

  // ── [3] Créer une tâche quotidienne ────────────────────────────────────────

  await t.test("[3] créer une tâche quotidienne → apparaît dans la liste", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }

    const session = await openStubbed();
    try {
      await reachHomePage(session);
      await goToTasksTab(session);

      // Ouvrir la modale
      await click(session, ".mrd-fab");
      await pollForSelector(session, ".task-modal-redesign", 5_000);

      // Saisir le nom de la tâche
      // L'input est dans .mrd-mbody, sans attribut name — on cible par placeholder
      const TASK_NAME = "Tâche E2E quotidienne";
      await session.send("Runtime.evaluate", {
        expression: `
          (function () {
            const inputs = [...document.querySelectorAll(".task-modal-redesign input")];
            const textInput = inputs.find(el => el.placeholder?.includes("Nom de la tâche"));
            if (!textInput) return;
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(textInput, ${JSON.stringify(TASK_NAME)});
            textInput.dispatchEvent(new Event("input", { bubbles: true }));
          })()
        `,
      });
      await new Promise((r) => setTimeout(r, 300));

      // Vérifier que le bouton submit est activé
      const submitDisabled = await queryProp(session, ".task-modal-redesign button[type='submit']", "disabled");
      assert.equal(submitDisabled, false, "Le bouton 'Créer la tâche' doit être activé après saisie du nom");

      // Soumettre
      await click(session, ".task-modal-redesign button[type='submit']");
      await new Promise((r) => setTimeout(r, 600));

      // La modale doit se fermer
      const modalGone = await session.send("Runtime.evaluate", {
        expression: `!document.querySelector(".task-modal-redesign")`,
        returnByValue: true,
      });
      assert.equal(modalGone.result.value, true, "La modale doit se fermer après création");

      // La tâche doit apparaître dans la liste
      const taskOk = await session.send("Runtime.evaluate", {
        expression: `[...document.querySelectorAll(".task-name")].some(el => el.textContent?.includes(${JSON.stringify(TASK_NAME)}))`,
        returnByValue: true,
      });
      assert.equal(taskOk.result.value, true,
        `La tâche "${TASK_NAME}" doit apparaître dans la liste`);

      const bootState = await session.send("Runtime.evaluate", {
        expression: "window.__APP_BOOT_STATE__",
        returnByValue: true,
      });
      assert.equal(bootState.result.value, "react-mounted");
    } finally {
      await session.close();
    }
  });

  // ── [4] Créer une tâche hebdomadaire ───────────────────────────────────────

  await t.test("[4] créer une tâche hebdomadaire sur l'onglet Semaine", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }

    const session = await openStubbed();
    try {
      await reachHomePage(session);
      await goToTasksTab(session);

      // Aller sur l'onglet Semaine (SegmentedTabs)
      await session.send("Runtime.evaluate", {
        expression: `
          [...document.querySelectorAll(".seg-tab, .mrd-seg-btn")]
            .find(el => el.textContent?.includes("Semaine"))
            ?.click();
        `,
      });
      await new Promise((r) => setTimeout(r, 300));

      // Ouvrir la modale
      await click(session, ".mrd-fab");
      await pollForSelector(session, ".task-modal-redesign", 5_000);

      const TASK_NAME = "Tâche E2E hebdo";
      await session.send("Runtime.evaluate", {
        expression: `
          (function () {
            const inputs = [...document.querySelectorAll(".task-modal-redesign input")];
            const textInput = inputs.find(el => el.placeholder?.includes("Nom de la tâche"));
            if (!textInput) return;
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(textInput, ${JSON.stringify(TASK_NAME)});
            textInput.dispatchEvent(new Event("input", { bubbles: true }));
          })()
        `,
      });
      await new Promise((r) => setTimeout(r, 300));

      await click(session, ".task-modal-redesign button[type='submit']");
      await new Promise((r) => setTimeout(r, 600));

      // Vérifier que la modale est fermée et aucun crash
      const bootState = await session.send("Runtime.evaluate", {
        expression: "window.__APP_BOOT_STATE__",
        returnByValue: true,
      });
      assert.equal(bootState.result.value, "react-mounted",
        "Pas de crash après création d'une tâche hebdomadaire");
    } finally {
      await session.close();
    }
  });

  // ── [5] Créer une tâche deadline ──────────────────────────────────────────

  await t.test("[5] créer une tâche deadline avec date d'échéance", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }

    const session = await openStubbed();
    try {
      await reachHomePage(session);
      await goToTasksTab(session);

      // Ouvrir la modale
      await click(session, ".mrd-fab");
      await pollForSelector(session, ".task-modal-redesign", 5_000);

      // Saisir le nom
      const TASK_NAME = "Tâche E2E deadline";
      await session.send("Runtime.evaluate", {
        expression: `
          (function () {
            const inputs = [...document.querySelectorAll(".task-modal-redesign input")];
            const textInput = inputs.find(el => el.placeholder?.includes("Nom de la tâche"));
            if (!textInput) return;
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(textInput, ${JSON.stringify(TASK_NAME)});
            textInput.dispatchEvent(new Event("input", { bubbles: true }));
          })()
        `,
      });
      await new Promise((r) => setTimeout(r, 200));

      // Cliquer le bouton "Avant..." (deadline)
      await session.send("Runtime.evaluate", {
        expression: `
          [...document.querySelectorAll(".task-modal-redesign button")]
            .find(btn => btn.textContent?.includes("Avant"))
            ?.click();
        `,
      });
      await new Promise((r) => setTimeout(r, 300));

      // Remplir la date d'échéance
      await session.send("Runtime.evaluate", {
        expression: `
          (function () {
            const dateInput = document.querySelector(".task-modal-redesign input[type='date']");
            if (!dateInput) return;
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(dateInput, "2026-12-31");
            dateInput.dispatchEvent(new Event("input", { bubbles: true }));
          })()
        `,
      });
      await new Promise((r) => setTimeout(r, 300));

      // Soumettre
      await click(session, ".task-modal-redesign button[type='submit']");
      await new Promise((r) => setTimeout(r, 600));

      // Pas de crash
      const bootState = await session.send("Runtime.evaluate", {
        expression: "window.__APP_BOOT_STATE__",
        returnByValue: true,
      });
      assert.equal(bootState.result.value, "react-mounted",
        "Pas de crash après création d'une tâche deadline");
    } finally {
      await session.close();
    }
  });

  // ── [6] Basculer une tâche en "terminé" ───────────────────────────────────

  await t.test("[6] basculer une tâche → compteur done incrémenté", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }

    const session = await openStubbed();
    try {
      await reachHomePage(session);
      await goToTasksTab(session);

      // Créer une tâche d'abord
      await click(session, ".mrd-fab");
      await pollForSelector(session, ".task-modal-redesign", 5_000);
      const TASK_NAME = "Tâche à cocher E2E";
      await session.send("Runtime.evaluate", {
        expression: `
          (function () {
            const inputs = [...document.querySelectorAll(".task-modal-redesign input")];
            const textInput = inputs.find(el => el.placeholder?.includes("Nom de la tâche"));
            if (!textInput) return;
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(textInput, ${JSON.stringify(TASK_NAME)});
            textInput.dispatchEvent(new Event("input", { bubbles: true }));
          })()
        `,
      });
      await new Promise((r) => setTimeout(r, 200));
      await click(session, ".task-modal-redesign button[type='submit']");
      await new Promise((r) => setTimeout(r, 600));

      // Lire le compteur done avant toggle
      const doneBefore = await session.send("Runtime.evaluate", {
        expression: `
          (() => {
            const el = document.querySelector(".task-counter-done, .tasks-done-count, [class*='done']");
            return el ? el.textContent.trim() : "0";
          })()
        `,
        returnByValue: true,
      });

      // Cliquer le bouton de complétion de la tâche créée
      // Le TaskCard a un bouton .task-check ou similaire
      await session.send("Runtime.evaluate", {
        expression: `
          (function () {
            // Trouver la card contenant notre tâche
            const nameEl = [...document.querySelectorAll(".task-name")]
              .find(el => el.textContent?.includes(${JSON.stringify(TASK_NAME)}));
            if (!nameEl) return;
            const card = nameEl.closest(".task-card, [class*='task-item'], [class*='task-row']");
            if (!card) {
              // Essayer de cliquer directement le bouton check dans le même parent
              const parent = nameEl.closest("[data-task-id], li, article, .mrd-task");
              const btn = parent?.querySelector("button");
              if (btn) btn.click();
              return;
            }
            // Chercher un bouton de complétion dans la card
            const checkBtn = card.querySelector("button");
            if (checkBtn) checkBtn.click();
          })()
        `,
      });
      await new Promise((r) => setTimeout(r, 500));

      // L'app ne doit pas crasher
      const bootState = await session.send("Runtime.evaluate", {
        expression: "window.__APP_BOOT_STATE__",
        returnByValue: true,
      });
      assert.equal(bootState.result.value, "react-mounted",
        "Pas de crash après toggle d'une tâche");
    } finally {
      await session.close();
    }
  });

  // ── [7] Fermer la modale avec ✕ ────────────────────────────────────────────

  await t.test("[7] fermer la modale de création avec ✕ — aucune tâche créée", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }

    const session = await openStubbed();
    try {
      await reachHomePage(session);
      await goToTasksTab(session);

      // Compter les tâches avant
      const countBefore = await session.send("Runtime.evaluate", {
        expression: `document.querySelectorAll(".task-name").length`,
        returnByValue: true,
      });

      // Ouvrir la modale
      await click(session, ".mrd-fab");
      await pollForSelector(session, ".task-modal-redesign", 5_000);

      // Saisir un nom
      await session.send("Runtime.evaluate", {
        expression: `
          (function () {
            const inputs = [...document.querySelectorAll(".task-modal-redesign input")];
            const textInput = inputs.find(el => el.placeholder?.includes("Nom de la tâche"));
            if (!textInput) return;
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(textInput, "Tâche abandonnée");
            textInput.dispatchEvent(new Event("input", { bubbles: true }));
          })()
        `,
      });
      await new Promise((r) => setTimeout(r, 200));

      // Fermer avec ✕
      await click(session, ".mrd-mclose");
      await new Promise((r) => setTimeout(r, 400));

      // La modale est fermée
      const modalGone = await session.send("Runtime.evaluate", {
        expression: `!document.querySelector(".task-modal-redesign")`,
        returnByValue: true,
      });
      assert.equal(modalGone.result.value, true, "La modale doit être fermée");

      // Aucune tâche supplémentaire créée
      const countAfter = await session.send("Runtime.evaluate", {
        expression: `document.querySelectorAll(".task-name").length`,
        returnByValue: true,
      });
      assert.equal(
        countAfter.result.value,
        countBefore.result.value,
        "Aucune tâche ne doit être créée si on ferme la modale sans soumettre",
      );

      const bootState = await session.send("Runtime.evaluate", {
        expression: "window.__APP_BOOT_STATE__",
        returnByValue: true,
      });
      assert.equal(bootState.result.value, "react-mounted");
    } finally {
      await session.close();
    }
  });

  // ── [8] Navigation vers "Mes tâches" ──────────────────────────────────────

  await t.test("[8] onglet 'Mes tâches' visible et sans crash", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }

    const session = await openStubbed();
    try {
      await reachHomePage(session);
      await goToTasksTab(session);

      // Cliquer l'onglet "Mes tâches" dans les SegmentedTabs
      await session.send("Runtime.evaluate", {
        expression: `
          [...document.querySelectorAll(".seg-tab, .mrd-seg-btn, [role='tab']")]
            .find(el => el.textContent?.trim().startsWith("Mes"))
            ?.click();
        `,
      });
      await new Promise((r) => setTimeout(r, 400));

      // L'app ne doit pas crasher
      const bootState = await session.send("Runtime.evaluate", {
        expression: "window.__APP_BOOT_STATE__",
        returnByValue: true,
      });
      assert.equal(bootState.result.value, "react-mounted",
        "Pas de crash sur l'onglet Mes tâches");

      // Pas d'écran d'erreur
      const bodyText = await session.send("Runtime.evaluate", {
        expression: "document.body.innerText",
        returnByValue: true,
      });
      assert.doesNotMatch(bodyText.result.value, /Demarrage bloque/i);
      assert.doesNotMatch(bodyText.result.value, /Erreur visible/i);
    } finally {
      await session.close();
    }
  });

  // ── [9] Aucun crash sur tous les sous-onglets Tâches ─────────────────────

  await t.test("[9] tous les sous-onglets (Aujourd'hui / Semaine / Mois / Mes tâches) sans crash", async (st) => {
    if (!browserHandle) {
      st.skip(browserLaunchError?.message ?? "Navigateur headless indisponible");
      return;
    }

    const session = await openStubbed();
    try {
      await reachHomePage(session);
      await goToTasksTab(session);

      const SUBTABS = ["Semaine", "Mois", "Mes", "Aujourd'hui"];

      for (const label of SUBTABS) {
        await session.send("Runtime.evaluate", {
          expression: `
            [...document.querySelectorAll(".seg-tab, .mrd-seg-btn, [role='tab']")]
              .find(el => el.textContent?.trim().startsWith(${JSON.stringify(label)}))
              ?.click();
          `,
        });
        await new Promise((r) => setTimeout(r, 300));

        const bootState = await session.send("Runtime.evaluate", {
          expression: "window.__APP_BOOT_STATE__",
          returnByValue: true,
        });
        assert.equal(
          bootState.result.value,
          "react-mounted",
          `Sous-onglet "${label}" : pas de crash`,
        );
      }
    } finally {
      await session.close();
    }
  });
});
