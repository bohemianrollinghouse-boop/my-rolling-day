// Boîtes de dialogue — remplace `window.confirm`.
//
// `window.confirm` est **bloquant** : il gèle le fil JavaScript. Dans une
// WebView native c'est pire qu'en navigateur — le dialogue est celui du
// système, hors charte, et sur iOS il peut ne pas s'afficher du tout selon le
// contexte. C'est le seul contrôle de la phase 8 qui n'était pas juste une
// question d'apparence.
//
// On passe par le **contrôleur impératif** d'Ionic plutôt que par un
// `<IonAlert>` monté : les 6 appels sont dispersés dans 3 composants, et un
// contrôleur évite d'ajouter un état et un rendu conditionnel à chacun. La
// signature reste proche de `confirm()` — un `await` en plus.

import { alertController } from "@ionic/core/components";

/**
 * Demande confirmation. Résout à `true` si l'utilisateur confirme.
 *
 * @param {object} options
 * @param {string} options.message      question posée
 * @param {string} [options.header]     titre
 * @param {string} [options.confirmText]
 * @param {string} [options.cancelText]
 * @param {boolean} [options.destructive] colore le bouton de confirmation en
 *   rouge — pour une suppression définitive.
 * @returns {Promise<boolean>}
 */
export async function confirmDialog({
  message,
  header = "",
  confirmText = "Confirmer",
  cancelText = "Annuler",
  destructive = false,
}) {
  const alert = await alertController.create({
    header: header || undefined,
    message,
    cssClass: `mrd-alert${destructive ? " mrd-alert-danger" : ""}`,
    backdropDismiss: true,
    buttons: [
      { text: cancelText, role: "cancel" },
      { text: confirmText, role: "confirm" },
    ],
  });
  await alert.present();
  const { role } = await alert.onDidDismiss();
  return role === "confirm";
}

/**
 * Demande une saisie. Résout à la valeur, ou `""` si annulé.
 *
 * Remplace `window.prompt`, bloquant lui aussi — et qui, sur iOS en WebView,
 * affiche un champ système sans gestion du clavier ni du type `password`.
 *
 * @param {object} options
 * @param {string} options.message
 * @param {string} [options.header]
 * @param {string} [options.type]        `text` (défaut) ou `password`
 * @param {string} [options.placeholder]
 * @param {string} [options.confirmText]
 * @param {string} [options.cancelText]
 * @returns {Promise<string>}
 */
export async function promptDialog({
  message,
  header = "",
  type = "text",
  placeholder = "",
  confirmText = "Confirmer",
  cancelText = "Annuler",
}) {
  const alert = await alertController.create({
    header: header || undefined,
    message,
    cssClass: "mrd-alert",
    backdropDismiss: true,
    inputs: [{ name: "value", type, placeholder, attributes: { autocomplete: "current-password" } }],
    buttons: [
      { text: cancelText, role: "cancel" },
      { text: confirmText, role: "confirm" },
    ],
  });
  await alert.present();
  const { role, data } = await alert.onDidDismiss();
  return role === "confirm" ? String(data?.values?.value || "") : "";
}
