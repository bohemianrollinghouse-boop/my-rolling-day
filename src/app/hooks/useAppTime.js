// Simulation temporelle — l'outil de dev qui permet de tester les échéances,
// les resets de cycle et les relances sans attendre le calendrier réel.
//
// Extrait d'`App.js`. La date simulée vit dans `utils/date.js` (module, hors
// React) : ce hook n'en est que la télécommande. `appTimeVersion` existe pour
// cette raison précise — changer une valeur dans un module ne redéclenche aucun
// rendu, il faut donc un compteur d'état dont les `useMemo` et effets
// dépendants peuvent se servir comme signal.

import { useState } from "../lib.js";
import {
  formatDateTimeInputValue,
  getCurrentAppDate,
  getCurrentAppTimeMode,
  getSimulatedAppDateValue,
  localDateKey,
  resetSimulatedAppDateToNow,
  setCurrentAppTimeMode,
  setSimulatedAppDateValue,
  shiftSimulatedAppDate,
} from "../utils/date.js";

const DEFAULT_TIME = "09:00";

export function useAppTime() {
  const [appTimeMode, setAppTimeModeState] = useState(() => getCurrentAppTimeMode());
  const [simulatedDateTime, setSimulatedDateTimeState] = useState(
    () => getSimulatedAppDateValue() || formatDateTimeInputValue(getCurrentAppDate()),
  );
  /* Incrémenté à chaque changement : c'est le signal de rafraîchissement des
     `useMemo` qui lisent la date. Sans lui, l'app garderait la date d'avant. */
  const [appTimeVersion, setAppTimeVersion] = useState(0);

  function syncAppTimeControls() {
    setAppTimeModeState(getCurrentAppTimeMode());
    setSimulatedDateTimeState(getSimulatedAppDateValue() || formatDateTimeInputValue(getCurrentAppDate()));
    setAppTimeVersion((value) => value + 1);
  }

  function handleSetRealDateMode() {
    setCurrentAppTimeMode("real");
    syncAppTimeControls();
  }

  function handleSetSimulatedDateMode() {
    // Sans valeur de départ, la simulation partirait de l'époque Unix.
    if (!getSimulatedAppDateValue()) resetSimulatedAppDateToNow();
    setCurrentAppTimeMode("simulated");
    syncAppTimeControls();
  }

  function handleChangeSimulatedDate(dateValue) {
    const currentValue = getSimulatedAppDateValue() || formatDateTimeInputValue(getCurrentAppDate());
    const currentTime = currentValue.slice(11, 16) || DEFAULT_TIME;
    setSimulatedAppDateValue(`${dateValue}T${currentTime}`);
    setCurrentAppTimeMode("simulated");
    syncAppTimeControls();
  }

  function handleChangeSimulatedTime(timeValue) {
    const currentValue = getSimulatedAppDateValue() || formatDateTimeInputValue(getCurrentAppDate());
    const currentDatePart = currentValue.slice(0, 10) || localDateKey(getCurrentAppDate());
    setSimulatedAppDateValue(`${currentDatePart}T${timeValue}`);
    setCurrentAppTimeMode("simulated");
    syncAppTimeControls();
  }

  function handleShiftSimulatedDate(days) {
    setCurrentAppTimeMode("simulated");
    shiftSimulatedAppDate(days);
    syncAppTimeControls();
  }

  function handleResetSimulatedDateToToday() {
    setCurrentAppTimeMode("simulated");
    resetSimulatedAppDateToNow();
    syncAppTimeControls();
  }

  return {
    appTimeMode,
    simulatedDateTime,
    appTimeVersion,
    syncAppTimeControls,
    handleSetRealDateMode,
    handleSetSimulatedDateMode,
    handleChangeSimulatedDate,
    handleChangeSimulatedTime,
    handleShiftSimulatedDate,
    handleResetSimulatedDateToToday,
  };
}
