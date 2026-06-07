import { useEffect } from "../lib.js";

/**
 * Calcule les décisions de routage de l'app :
 * quel écran afficher (chargement, auth, onboarding, app principale).
 *
 * @param {object} params
 * @param {boolean} params.bootLoading  - true tant que l'état initial n'est pas connu
 * @param {object|null} params.user     - utilisateur Firebase connecté (ou null)
 * @param {object|null} params.userProfile - profil Firestore de l'utilisateur
 * @param {string} params.currentFamilyId  - ID du foyer actif (ou "")
 * @param {object|null} params.currentFamily - objet foyer actif
 * @param {object|null} params.linkedPerson  - profil lié à cet utilisateur dans le foyer
 *
 * @returns {{ needsFamilySetup: boolean, profileGuardActive: boolean }}
 */
export function useAppRouting({ bootLoading, user, userProfile, currentFamilyId, currentFamily, linkedPerson }) {
  // L'utilisateur est connecté mais n'a pas encore de foyer
  const needsFamilySetup = !bootLoading && Boolean(user && userProfile) && !currentFamilyId;

  // Onboarding en cours pour ce foyer (invitation acceptée, profil à compléter)
  const pendingFamilyOnboardingId = userProfile?.pendingOnboardingFamilyId || "";
  const pendingFamilyOnboarding = Boolean(currentFamilyId && pendingFamilyOnboardingId === currentFamilyId);

  // Le profil lié est absent ou incomplet → afficher le setup
  const needsLinkedProfileSetup =
    !bootLoading &&
    Boolean(user && userProfile && currentFamilyId && currentFamily) &&
    (!linkedPerson?.id || !String(linkedPerson?.displayName || "").trim() || pendingFamilyOnboarding);

  // Garde globale : onboarding actif si l'une des deux conditions ci-dessus est vraie
  const profileGuardActive = !bootLoading && (needsFamilySetup || needsLinkedProfileSetup);

  // [route-debug] — log de l'écran sélectionné à chaque changement de routing.
  // À retirer une fois le flash de boot confirmé corrigé.
  useEffect(() => {
    const screen =
      bootLoading ? "loading" :
      !user ? "auth" :
      profileGuardActive ? "onboarding" :
      "home";
    console.log(
      "[route-debug] selectedScreen=" + screen,
      "| bootLoading=" + bootLoading,
      "| user=" + (user ? user.uid.slice(0, 6) : "null"),
      "| profileGuardActive=" + profileGuardActive,
      "| needsFamilySetup=" + needsFamilySetup,
      "| needsLinkedProfileSetup=" + needsLinkedProfileSetup,
    );
  }, [bootLoading, user, profileGuardActive, needsFamilySetup, needsLinkedProfileSetup]); // eslint-disable-line react-hooks/exhaustive-deps

  return { needsFamilySetup, profileGuardActive };
}
