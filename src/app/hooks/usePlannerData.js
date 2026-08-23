// Import / export / remise à zéro du planner — la section « Données » des
// réglages, réservée au compte développeur.
//
// Extrait d'`App.js`. Ces trois opérations écrivent l'état **en entier** au lieu
// de le muter champ par champ : elles passent donc par `setState` directement et
// non par `updateState`, mais toujours à travers `checkReset`, qui porte la
// normalisation et les migrations de compatibilité. Court-circuiter `checkReset`
// ici, c'est réinjecter dans Firestore un document d'une version antérieure.

import { Capacitor } from "@capacitor/core";

import { createDefaultState } from "../config/defaultState.js";
import { useState } from "../lib.js";
import { getCurrentAppDate } from "../utils/date.js";
import { checkReset } from "../utils/state.js";
import { parseImportedState } from "../utils/storage.js";

/**
 * @param {object}   deps
 * @param {object}   deps.state       état planner courant (source de l'export)
 * @param {Function} deps.setState    remplace l'état en entier
 * @param {string}   deps.familyName  sert à nommer le fichier exporté
 */
export function usePlannerData({ state, setState, familyName = "" }) {
  const [dataMessage, setDataMessage] = useState("");
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);

  function handleManualImport() {
    try {
      setDataMessage("");
      const imported = checkReset(parseImportedState(importText), getCurrentAppDate()).state;
      setState(imported);
      setDataMessage("Import manuel termine.");
      setShowImport(false);
      setImportText("");
    } catch (error) {
      setDataMessage(error.message || "Import impossible.");
    }
  }

  async function handleExportData() {
    const payload = JSON.stringify(state, null, 2);
    const fileName = `my-rolling-day-${familyName || "foyer"}.json`;

    // Natif : `<a download>` ne fait rien en WKWebView → fichier + feuille de
    // partage. Les imports sont dynamiques pour que le web ne charge pas les
    // deux plugins Capacitor sans jamais s'en servir.
    if (Capacitor.isNativePlatform()) {
      try {
        const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
          import("@capacitor/filesystem"),
          import("@capacitor/share"),
        ]);
        const written = await Filesystem.writeFile({
          path: fileName,
          data: payload,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        });
        await Share.share({ title: fileName, files: [written.uri] });
        setDataMessage("Export partagé.");
      } catch (error) {
        // L'utilisateur a fermé la feuille de partage → pas une erreur
        if (String(error?.message || "").toLowerCase().includes("cancel")) return;
        setDataMessage(error.message || "Export impossible.");
      }
      return;
    }

    try {
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
      setDataMessage("Export lance.");
    } catch (error) {
      setDataMessage(error.message || "Export impossible.");
    }
  }

  function handleResetPlanner() {
    setState(checkReset(createDefaultState(), getCurrentAppDate()).state);
    setDataMessage("Planner reinitialise.");
  }

  return {
    dataMessage,
    setDataMessage,
    importText,
    setImportText,
    showImport,
    setShowImport,
    handleManualImport,
    handleExportData,
    handleResetPlanner,
  };
}
