import {
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./core.js";

// ── Rapports de bug ───────────────────────────────────────────────────────

export async function createBugReport({ title = "", description = "", device = "", userId = "" }) {
  const cleanTitle = String(title || "").trim();
  const cleanDescription = String(description || "").trim();
  if (!cleanTitle) throw new Error("Ajoute un titre.");
  if (!cleanDescription) throw new Error("Ajoute une description.");

  await addDoc(collection(db, "bug_reports"), {
    title: cleanTitle,
    description: cleanDescription,
    device: String(device || "").trim(),
    userId: String(userId || "").trim(),
    createdAt: serverTimestamp(),
  });
}

// ── Suggestions de fonctionnalités ────────────────────────────────────────

export async function createFeatureRequest({ title = "", description = "", userId = "" }) {
  const cleanTitle = String(title || "").trim();
  const cleanDescription = String(description || "").trim();
  if (!cleanTitle) throw new Error("Ajoute un titre.");
  if (!cleanDescription) throw new Error("Ajoute une description.");

  await addDoc(collection(db, "feature_requests"), {
    title: cleanTitle,
    description: cleanDescription,
    userId: String(userId || "").trim(),
    createdAt: serverTimestamp(),
  });
}

// ── Feedback testeurs ─────────────────────────────────────────────────────

export async function sendTesterFeedback({ message = "", page = "", userId = "" }) {
  const cleanMsg = String(message || "").trim();
  if (!cleanMsg) throw new Error("Décris le problème.");
  const device = [
    typeof navigator !== "undefined" ? navigator.userAgent || "" : "",
    typeof navigator !== "undefined" && navigator.standalone ? "PWA-standalone" : "",
  ].filter(Boolean).join(" | ");
  await addDoc(collection(db, "tester_feedback"), {
    message: cleanMsg,
    page: String(page || "").trim(),
    device,
    userId: String(userId || "").trim(),
    createdAt: serverTimestamp(),
  });
}
