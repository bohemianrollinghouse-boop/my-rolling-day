import {
  canChangePassword,
  changePasswordForCurrentUser,
  completePendingFamilyOnboarding,
  createFamily,
  createFamilyPerson,
  createHouseholdInvitation,
  deleteFamily,
  discardCurrentUserDraftAccount,
  deleteCurrentUserAccount,
  deleteFamilyPerson,
  ensureAuthPersistence,
  ensureLinkedHouseholdProfile,
  ensureUserProfile,
  formatAuthError,
  formatFirestoreError,
  getGoogleRedirectResult,
  leaveFamilyAccount,
  resetPassword,
  joinFamily,
  previewHouseholdInvitation,
  saveDisplayName,
  saveFamilyPeopleOrder,
  saveUserEmail,
  setCurrentFamily,
  signOutUser,
  updateEmailForCurrentUser,
  updateFamilyMemberRole,
  updateFamilyPerson,
  watchAuth,
  watchFamilies,
  watchFamilyMembers,
  watchFamilyPeople,
  watchHouseholdInvitations,
  watchUserProfile,
} from "../firebase/client.js";
import { useEffect, useMemo, useState } from "../lib.js";
import { canSwitchToFamily, normalizeFamilyIds } from "../utils/families.js";

function shortId(label = "") {
  const cleaned = label.trim().split(/\s+/).filter(Boolean);
  if (!cleaned.length) return "?";
  if (cleaned.length === 1) return cleaned[0].slice(0, 1).toUpperCase();
  return `${cleaned[0][0] || ""}${cleaned[1][0] || ""}`.toUpperCase();
}

function buildUiPeople(people, memberDirectory = {}) {
  return (people || []).map((person) => ({
    id: person.id,
    shortId: shortId(person.displayName || "P"),
    label: person.displayName || "Personne",
    color: person.color || "#8B7355",
    type: person.type || "adult",
    profileMode: person.profileMode || (person.type === "adult" ? "app_user" : "context"),
    active: person.active !== false,
    canCompleteTasks: Boolean(person.canCompleteTasks),
    linkedAccountId: person.linkedAccountId || "",
    email: person.linkedAccountId ? memberDirectory[person.linkedAccountId]?.email || "" : "",
    role: person.linkedAccountId ? memberDirectory[person.linkedAccountId]?.role || "member" : person.role || "member",
    mood: person.mood || "",
    message: person.message || "",
  }));
}

function bootLog(step, detail = "") {
  // window.__pushBootLog (défini dans index.html) appelle déjà console.log("[boot]", ...).
  // On l'utilise s'il est disponible, sinon fallback direct.
  if (window.__pushBootLog) {
    window.__pushBootLog(step, detail);
  } else {
    console.log("[startup]", step, detail || "");
  }
}

function normalizeOnboardingProfileType(type = "") {
  if (type === "child") return "child";
  if (type === "pet" || type === "animal") return "animal";
  return "adult";
}

function normalizeOnboardingProfiles(profiles = []) {
  return (Array.isArray(profiles) ? profiles : [])
    .map((profile) => {
      const displayName = String(profile?.firstName || profile?.displayName || "").trim();
      const type = normalizeOnboardingProfileType(profile?.profileType || profile?.type || "adult");
      const hasAccount = Boolean(profile?.hasAccount) && type === "adult";
      return {
        displayName,
        type,
        hasAccount,
        role: hasAccount && profile?.role === "admin" ? "admin" : "member",
        color: String(profile?.badgeColor || profile?.color || "").trim(),
      };
    })
    .filter((profile) => profile.displayName);
}

export function useAuth() {
  const [authReady, setAuthReady] = useState(false);
  const [authPhase, setAuthPhase] = useState("checking");
  const [startupStage, setStartupStage] = useState("init");
  const [startupError, setStartupError] = useState("");
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(undefined); // undefined=loading, null=no profile, obj=ready
  const [profileFetched, setProfileFetched] = useState(false); // true once watchUserProfile fires ≥1 time
  const [families, setFamilies] = useState([]);
  const [familiesReady, setFamiliesReady] = useState(false); // true once families are loaded
  const [members, setMembers] = useState([]);
  const [people, setPeople] = useState([]);
  const [peopleBootstrapped, setPeopleBootstrapped] = useState(false); // true only after server snapshot
  const [familyError, setFamilyError] = useState("");
  const [authError, setAuthError] = useState("");
  const [bootstrapError, setBootstrapError] = useState("");
  const [accountMessage, setAccountMessage] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [invitations, setInvitations] = useState([]);
  const [pendingInviteCode, setPendingInviteCode] = useState("");

  const safeFamilies = Array.isArray(families) ? families : [];
  const safeMembers = Array.isArray(members) ? members : [];
  const safePeople = Array.isArray(people) ? people : [];
  const appPeopleRaw = safePeople.filter(
    (person) =>
      person.active !== false &&
      ((person.profileMode && person.profileMode !== "context") || (!person.profileMode && person.type === "adult")),
  );
  const currentFamilyId = userProfile?.currentFamilyId || userProfile?.familyIds?.[0] || "";
  // undefined = still loading (families not fetched yet or profile not ready)
  // null      = definitively no family (profile loaded, no currentFamilyId, or ID not found after fetch)
  // object    = family found
  const currentFamily =
    userProfile === undefined ? undefined :
    !currentFamilyId ? null :
    !familiesReady ? undefined :
    safeFamilies.find((family) => family.id === currentFamilyId) || null;
  const currentRole = safeMembers.find((member) => member.uid === user?.uid)?.role || "";
  const linkedAccountChoices = safeMembers.map((member) => ({
    id: member.uid,
    label: member.displayName || member.email || "Compte",
  }));
  const linkedAccountLabels = safeMembers.reduce((acc, member) => {
    acc[member.uid] = member.displayName || member.email || "Compte lié";
    return acc;
  }, {});
  const memberDirectory = safeMembers.reduce((acc, member) => {
    acc[member.uid] = {
      email: member.email || "",
      role: member.role || "member",
      displayName: member.displayName || member.email || "",
    };
    return acc;
  }, {});
  const householdPeople = useMemo(() => buildUiPeople(appPeopleRaw, memberDirectory), [appPeopleRaw, memberDirectory]);
  const agendaPeople = useMemo(
    () => buildUiPeople(safePeople.filter((person) => person.active !== false), memberDirectory),
    [safePeople, memberDirectory],
  );
  const linkedPerson = safePeople.find((person) => person.linkedAccountId === user?.uid) || null;

  // Single source of truth: app must not render anything until this is false.
  // currentFamily uses undefined=loading / null=absent / object=found semantics,
  // so we can express each boot stage cleanly without juggling multiple flags.
  const bootLoading =
    !authReady ||                                                                           // 1. Auth not resolved
    (!!user && !profileFetched) ||                                                          // 2. Server profile not confirmed yet
    (!!user && profileFetched && currentFamily === undefined) ||                            // 3. Families fetch pending (or profile still settling)
    (!!user && profileFetched && !!currentFamilyId && currentFamily !== undefined && !peopleBootstrapped); // 4. Server people not received yet

  // [route-debug] — logs every routing-relevant state change for boot diagnosis.
  // Remove once the boot flash is confirmed fixed.
  useEffect(() => {
    const profileStr =
      userProfile === undefined ? "undefined" :
      userProfile === null ? "null" :
      "ok(familyIds=" + JSON.stringify(userProfile?.familyIds) + ")";
    const familyStr =
      currentFamily === undefined ? "undefined" :
      currentFamily === null ? "null" :
      currentFamily.id;
    console.log(
      "[route-debug]",
      "authReady=" + authReady,
      "| user=" + (user ? user.uid.slice(0, 6) : "null"),
      "| profileFetched=" + profileFetched,
      "| userProfile=" + profileStr,
      "| familiesReady=" + familiesReady,
      "| currentFamilyId=" + (currentFamilyId || "''"),
      "| currentFamily=" + familyStr,
      "| peopleBootstrapped=" + peopleBootstrapped,
      "| people=" + people.length,
      "| bootLoading=" + bootLoading,
    );
  }, [authReady, user, profileFetched, userProfile, familiesReady, currentFamilyId, currentFamily, peopleBootstrapped, people, bootLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Écoute l'état de connexion Firebase
  useEffect(() => {
    let active = true;
    bootLog("app-mounted", "Initialisation App");
    setStartupStage("auth-check");

    // Si un signInWithRedirect était en cours, ce flag est présent.
    // On doit alors attendre que getRedirectResult se règle avant d'afficher
    // la page de login, car onAuthStateChanged fire d'abord avec null sur iOS PWA.
    const redirectPending = localStorage.getItem("mrd_google_redirect_pending") === "1";
    let redirectSettled = !redirectPending;
    let heldNullAuthState = false;

    // Timeout de secours — plus long si un redirect était en cours
    const timeoutMs = redirectPending ? 20000 : 4000;
    const timeoutId = setTimeout(() => {
      if (!active) return;
      bootLog("auth-timeout", `timeout ${timeoutMs}ms (redirectPending=${redirectPending})`);
      localStorage.removeItem("mrd_google_redirect_pending");
      setAuthReady(true);
      setAuthPhase((current) => (current === "checking" ? "signed_out" : current));
      setStartupStage("ready");
    }, timeoutMs);

    // Applique un état "utilisateur déconnecté" (appelé si le redirect a échoué
    // ou n'a pas produit d'utilisateur après que onAuthStateChanged a tenu son null).
    function applySignedOutState() {
      if (!active) return;
      clearTimeout(timeoutId);
      setUser(null);
      setAuthReady(true);
      setAuthPhase("signed_out");
      setBootstrapError("");
      setStartupError("");
      setUserProfile(null);
      setProfileFetched(false);
      setFamilies([]);
      setFamiliesReady(false);
      setMembers([]);
      setPeople([]);
      setPeopleBootstrapped(false);
      setInvitations([]);
      setAccountMessage("");
      setEmailMessage("");
      setPasswordMessage("");
      setStartupStage("ready");
    }

    // S'assure que la persistence locale est activée avant toute opération auth
    ensureAuthPersistence().catch(() => {});

    // Traite le retour d'un signInWithRedirect précédent.
    // Quand getRedirectResult se règle (succès, null ou erreur), on sait que
    // Firebase a fini de traiter le redirect — on peut appliquer l'état retenu.
    getGoogleRedirectResult()
      .then((result) => {
        if (!active) return;
        localStorage.removeItem("mrd_google_redirect_pending");
        redirectSettled = true;
        if (result?.user) {
          bootLog("auth-redirect-ok", `user:${result.user.uid}`);
          // onAuthStateChanged va aussi fire avec cet utilisateur — on ne fait rien ici
        } else if (heldNullAuthState) {
          // Redirect sans utilisateur + état null tenu → afficher la page de login
          applySignedOutState();
        }
      })
      .catch((error) => {
        if (!active) return;
        localStorage.removeItem("mrd_google_redirect_pending");
        redirectSettled = true;
        console.error("[auth] getGoogleRedirectResult error", error?.code, error?.message, error?.customData, error);
        const code = error?.code || "";
        if (code !== "auth/redirect-cancelled-by-user" && code !== "auth/user-cancelled") {
          setAuthError(formatAuthError(error));
        }
        if (heldNullAuthState) {
          applySignedOutState();
        }
      });

    const unsubscribe = watchAuth((nextUser) => {
      if (!active) return;
      bootLog("auth-state", nextUser ? `user:${nextUser.uid}` : "no-user");

      // Si le redirect n'est pas encore réglé et que Firebase annonce null,
      // on attend — ce null sera reconsidéré dès que getRedirectResult se règle.
      if (!nextUser && !redirectSettled) {
        heldNullAuthState = true;
        bootLog("auth-state-held", "null tenu, redirect pas encore regle");
        return;
      }

      clearTimeout(timeoutId);
      heldNullAuthState = false;
      setUser(nextUser);
      setAuthReady(true);
      setAuthPhase(nextUser ? "signed_in" : "signed_out");
      setBootstrapError("");
      setStartupError("");
      if (!nextUser) {
        setUserProfile(null);
        setProfileFetched(false);
        setFamilies([]);
        setFamiliesReady(false);
        setMembers([]);
        setPeople([]);
        setPeopleBootstrapped(false);
        setInvitations([]);
        setAccountMessage("");
        setEmailMessage("");
        setPasswordMessage("");
        setStartupStage("ready");
      } else {
        setStartupStage("profile-bootstrap");
      }
    });

    return () => {
      active = false;
      clearTimeout(timeoutId);
      unsubscribe();
    };
  }, []);

  // Charge et écoute le profil utilisateur
  useEffect(() => {
    if (!user?.uid) return undefined;
    let active = true;
    ensureUserProfile(user).catch((error) => {
      if (!active) return;
      setBootstrapError(formatFirestoreError(error));
      setStartupError(formatFirestoreError(error));
      setStartupStage("error");
    });

    let cacheTimeoutId = null;

    const unsubscribe = watchUserProfile(
      user.uid,
      (profile, fromCache) => {
        if (!active) return;
        // Always update the profile data so UI can show cached content quickly.
        setUserProfile(profile);
        if (!fromCache) {
          // Server confirmed — cancel any pending cache fallback and advance.
          clearTimeout(cacheTimeoutId);
          cacheTimeoutId = null;
          setProfileFetched(true);
          setStartupStage("ready");
        } else if (cacheTimeoutId === null) {
          // Cache snapshot arrived but server hasn't responded yet.
          // If the server doesn't confirm within 6 s (offline / very slow network),
          // unblock the spinner with cached data rather than spinning forever.
          cacheTimeoutId = setTimeout(() => {
            if (!active) return;
            setProfileFetched(true);
            setStartupStage("ready");
          }, 6000);
        }
      },
      (error) => {
        if (!active) return;
        setBootstrapError(formatFirestoreError(error));
        setStartupError(formatFirestoreError(error));
        setStartupStage("error");
      },
    );

    return () => {
      active = false;
      clearTimeout(cacheTimeoutId);
      setProfileFetched(false);
      unsubscribe();
    };
  }, [user]);

  // Stable string key: prevents effect from re-running when Firestore re-fires the same profile
  const familyIdsKey = profileFetched && userProfile
    ? (Array.isArray(userProfile.familyIds) ? userProfile.familyIds.join(",") : "")
    : "__pending__";

  // Charge et ecoute la liste des familles
  useEffect(() => {
    if (familyIdsKey === "__pending__") return undefined; // profile not ready yet
    if (!userProfile?.familyIds?.length) {
      setFamilies([]);
      setFamiliesReady(true); // definitively: no families to load
      return undefined;
    }
    setFamiliesReady(false); // reset: about to (re-)fetch
    return watchFamilies(
      userProfile.familyIds,
      (items) => {
        setFamilies(items);
        setFamiliesReady(true);
      },
      (error) => {
        setBootstrapError(formatFirestoreError(error));
        setStartupError(formatFirestoreError(error));
        setStartupStage("error");
      },
    );
  }, [familyIdsKey]); // stable string key → effect runs only when actual IDs change

  // Écoute les membres du foyer
  useEffect(() => {
    if (!currentFamilyId) { setMembers([]); return undefined; }
    return watchFamilyMembers(
      currentFamilyId,
      (items) => setMembers(items),
      (error) => {
        setBootstrapError(formatFirestoreError(error));
        setStartupError(formatFirestoreError(error));
        setStartupStage("error");
      },
    );
  }, [currentFamilyId]);

  // Écoute les profils du foyer
  useEffect(() => {
    setPeopleBootstrapped(false); // reset whenever the family context changes
    if (!currentFamilyId) { setPeople([]); return undefined; }
    let peopleTimeoutId = null;
    const unsubPeople = watchFamilyPeople(
      currentFamilyId,
      (items, fromCache) => {
        setPeople(items);
        if (!fromCache) {
          clearTimeout(peopleTimeoutId);
          peopleTimeoutId = null;
          setPeopleBootstrapped(true);
        } else if (peopleTimeoutId === null) {
          // Cache snapshot arrived — unblock after 6 s if server doesn't confirm.
          peopleTimeoutId = setTimeout(() => {
            setPeopleBootstrapped(true);
          }, 6000);
        }
      },
      (error) => {
        setBootstrapError(formatFirestoreError(error));
        setStartupError(formatFirestoreError(error));
        setStartupStage("error");
      },
    );
    return () => {
      clearTimeout(peopleTimeoutId);
      unsubPeople();
    };
  }, [currentFamilyId]);

  // Écoute les invitations
  useEffect(() => {
    if (!currentFamilyId) { setInvitations([]); return undefined; }
    return watchHouseholdInvitations(
      currentFamilyId,
      (items) => setInvitations(items),
      (error) => {
        setBootstrapError(formatFirestoreError(error));
        setStartupError(formatFirestoreError(error));
        setStartupStage("error");
      },
    );
  }, [currentFamilyId]);

  useEffect(() => {
    if (!user || !pendingInviteCode) return;
    const code = pendingInviteCode;
    setPendingInviteCode("");
    joinFamily({ user, inviteCode: code }).catch((err) => setFamilyError(err?.message || formatFirestoreError(err)));
  }, [user?.uid, pendingInviteCode]);

  // Auto-fallback : si currentFamilyId pointe vers un foyer introuvable après chargement
  // (document supprimé, accès refusé, règle Firestore refusée, etc.), bascule automatiquement
  // sur le premier foyer accessible. Évite que l'utilisateur soit bloqué en mode onboarding
  // alors qu'il a d'autres foyers valides dans safeFamilies.
  useEffect(() => {
    if (!user?.uid || !familiesReady || !currentFamilyId || currentFamily !== null) return;
    const nextFamily = safeFamilies[0] || null;
    if (!nextFamily) return;
    setBootstrapError(""); // Efface les erreurs d'accès au foyer précédent
    setCurrentFamily(user.uid, nextFamily.id).catch((err) =>
      console.warn("[useAuth] auto-switch fallback failed", err),
    );
  }, [familiesReady, currentFamilyId, currentFamily, safeFamilies.length, user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  async function runAuth(action) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        const err = new Error("La connexion a pris trop de temps. Réessaie.");
        err.code = "auth/timeout";
        reject(err);
      }, 60000);
    });
    try {
      setBusy(true);
      setAuthError("");
      return await Promise.race([action(), timeout]);
    } catch (error) {
      console.error("[auth] runAuth error", error?.code, error?.message, error?.customData, error);
      setAuthError(formatAuthError(error));
    } finally {
      clearTimeout(timeoutId);
      setBusy(false);
    }
  }

  async function runFamilyAction(action) {
    try {
      setBusy(true);
      setFamilyError("");
      return await action();
    } catch (error) {
      setFamilyError(error?.message || formatFirestoreError(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword(email) {
    if (!email?.trim()) {
      setAuthError("Entre ton adresse e-mail pour recevoir le lien de réinitialisation.");
      return;
    }
    try {
      setBusy(true);
      setAuthError("");
      await resetPassword(email);
      setAuthError("E-mail envoyé ! Vérifie ta boîte mail pour réinitialiser ton mot de passe.");
    } catch (error) {
      setAuthError(formatAuthError(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleChangeEmail(newEmail) {
    try {
      setBusy(true);
      setEmailMessage("");
      await updateEmailForCurrentUser(newEmail);
      await saveUserEmail(user.uid, newEmail, userProfile?.familyIds || []);
      setEmailMessage("E-mail mis à jour.");
    } catch (error) {
      setEmailMessage(formatAuthError(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleChangePassword(oldPassword, newPassword) {
    try {
      setBusy(true);
      setPasswordMessage("");
      await changePasswordForCurrentUser(oldPassword, newPassword);
      setPasswordMessage("Mot de passe mis à jour.");
      return true;
    } catch (error) {
      setPasswordMessage(formatAuthError(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateFamily(name, options = {}) {
    if (!name.trim()) throw new Error("Donne un nom au foyer.");
    const hadFamily = normalizeFamilyIds(userProfile?.familyIds).length > 0;
    await createFamily({ user, familyName: name, startOnboarding: Boolean(options.startOnboarding) });
    setAccountMessage(
      hadFamily
        ? "Foyer ajoute et active. Tu peux revenir a l'ancien foyer depuis Reglages."
        : "Ton compte personnel a ete lie automatiquement a ton profil du foyer.",
    );
  }

  async function handleJoinFamily(code, options = {}) {
    const hadFamily = normalizeFamilyIds(userProfile?.familyIds).length > 0;
    if (!code.trim()) throw new Error("Entre un code d’invitation.");
    await joinFamily({ user, inviteCode: code, startOnboarding: Boolean(options.startOnboarding) });
    setAccountMessage(
      hadFamily
        ? "Foyer rejoint et active. Tu peux revenir a l'ancien foyer depuis Reglages."
        : "Invitation acceptee. Ton compte a ete rattache au bon membre du foyer.",
    );
  }

  async function handleSwitchFamily(familyId) {
    const targetFamilyId = String(familyId || "").trim();
    if (!user?.uid) throw new Error("Aucun compte connecte.");
    if (!canSwitchToFamily(userProfile, targetFamilyId)) {
      throw new Error("Ce foyer n'est pas lie a ton compte.");
    }
    if (targetFamilyId === currentFamilyId) {
      setAccountMessage("Ce foyer est deja actif.");
      return;
    }
    await setCurrentFamily(user.uid, targetFamilyId);
    const targetFamily = safeFamilies.find((family) => family.id === targetFamilyId);
    setAccountMessage(`${targetFamily?.name || "Ce foyer"} est maintenant le foyer actif.`);
  }

  async function handlePreviewHouseholdInvitation(code) {
    const preview = await previewHouseholdInvitation(code);
    if (preview.email && preview.email !== String(user?.email || "").trim().toLowerCase()) {
      throw new Error("Cette invitation est reservee a une autre adresse email.");
    }
    return preview;
  }

  async function handleCreateHouseholdOnboarding(payload = {}) {
    if (!user?.uid) throw new Error("Aucun compte connecte.");
    const profile = payload?.profile || {};
    const displayName = String(profile?.firstName || profile?.displayName || userProfile?.displayName || user?.displayName || "").trim();
    const color = String(profile?.badgeColor || profile?.color || linkedPerson?.color || "#8B7355").trim() || "#8B7355";
    const householdName = String(payload?.householdName || payload?.familyName || "").trim();
    const profiles = normalizeOnboardingProfiles(payload?.profiles);

    if (!householdName) throw new Error("Donne un nom au foyer.");
    if (!displayName) throw new Error("Entre ton prenom.");

    const created = await createFamily({ user, familyName: householdName, startOnboarding: true });
    const familyId = created.familyId;
    const personId = created.memberId;
    const familyIds = [...new Set([...(userProfile?.familyIds || []), familyId])];

    await Promise.all([
      saveDisplayName(user.uid, displayName, familyIds),
      updateFamilyPerson(familyId, personId, {
        displayName,
        color,
      }),
    ]);

    const createdInvitations = [];
    for (let index = 0; index < profiles.length; index += 1) {
      const profileDraft = profiles[index];
      const createdPersonId = await createFamilyPerson(familyId, {
        displayName: profileDraft.displayName,
        type: profileDraft.type,
        profileMode: profileDraft.hasAccount ? "app_user" : "context",
        linkedAccountId: "",
        canCompleteTasks: profileDraft.hasAccount,
        active: true,
        role: profileDraft.hasAccount ? profileDraft.role : profileDraft.type === "adult" ? "member" : profileDraft.type,
        sortOrder: index + 1,
        color: profileDraft.color,
      });

      if (profileDraft.hasAccount) {
        const inv = await createHouseholdInvitation({
          familyId,
          personId: createdPersonId,
          createdBy: user.uid,
          targetEmail: "",
        });
        createdInvitations.push({ firstName: profileDraft.displayName, code: inv?.code || "" });
      }
    }

    await completePendingFamilyOnboarding(user.uid, familyId);
    setAccountMessage(
      profiles.length
        ? "Foyer cree. Ton profil et les autres membres ont bien ete ajoutes."
        : "Foyer cree. Ton profil est pret.",
    );
    return { ...created, invitations: createdInvitations };
  }

  async function handleJoinHouseholdOnboarding(payload = {}) {
    if (!user?.uid) throw new Error("Aucun compte connecte.");
    const inviteCode = String(payload?.invitationCode || "").trim().toUpperCase().replace(/-/g, "");
    if (!inviteCode) throw new Error("Entre un code d invitation.");

    const preview = await handlePreviewHouseholdInvitation(inviteCode);
    const profile = payload?.profile || {};
    const displayName = String(
      profile?.firstName || profile?.displayName || preview.memberName || userProfile?.displayName || user?.displayName || "",
    ).trim();
    const color = String(profile?.badgeColor || profile?.color || linkedPerson?.color || "#8B7355").trim() || "#8B7355";
    if (!displayName) throw new Error("Entre ton prenom.");

    const joined = await joinFamily({ user, inviteCode, startOnboarding: true });
    const familyIds = [...new Set([...(userProfile?.familyIds || []), joined.familyId])];

    await Promise.all([
      saveDisplayName(user.uid, displayName, familyIds),
      updateFamilyPerson(joined.familyId, joined.personId, {
        displayName,
        color,
      }),
    ]);

    await completePendingFamilyOnboarding(user.uid, joined.familyId);
    setAccountMessage(`Tu as rejoint ${preview.householdName}. Ton profil est maintenant lie a ce foyer.`);
    return { ...joined, preview };
  }

  async function handleCreateInvitation(personId, email) {
    if (!currentFamilyId) throw new Error("Aucun foyer actif.");
    const invitation = await createHouseholdInvitation({
      familyId: currentFamilyId,
      personId,
      createdBy: user.uid,
      targetEmail: email,
    });
    return { invitationCode: invitation.code || "", memberName: invitation.memberName || "" };
  }

  async function handleAddPerson(person) {
    if (!currentFamilyId) throw new Error("Aucune famille active.");
    const personId = await createFamilyPerson(currentFamilyId, { ...person, sortOrder: safePeople.length });
    if (
      person.generateInvitation ||
      ((person.profileMode === "app_user" || person.type === "adult") && person.profileMode !== "context")
    ) {
      const invitation = await createHouseholdInvitation({
        familyId: currentFamilyId,
        personId,
        createdBy: user.uid,
        targetEmail: "",
      });
      return {
        personId,
        invitationCode: invitation.code || "",
        memberName: invitation.memberName || person.displayName || "Ce membre",
      };
    }
    return {
      personId,
      invitationCode: "",
      memberName: person.displayName || "Ce membre",
    };
  }

  async function handleUpdatePerson(personId, updates) {
    if (!currentFamilyId) throw new Error("Aucune famille active.");
    await updateFamilyPerson(currentFamilyId, personId, updates);
  }

  async function handleUpdateMemberRole(uid, role) {
    if (!currentFamilyId) throw new Error("Aucune famille active.");
    if (!uid) throw new Error("Compte membre introuvable.");
    await updateFamilyMemberRole(currentFamilyId, uid, role);
  }

  async function handleCompleteProfileSetup(payload) {
    if (!user?.uid) throw new Error("Aucun compte connecte.");
    if (!currentFamilyId) throw new Error("Cree ou rejoins d'abord un foyer.");

    const profile = payload?.profile || payload || {};
    const memberDrafts = Array.isArray(payload?.members) ? payload.members : [];
    const displayName = String(
      profile?.displayName || linkedPerson?.displayName || userProfile?.displayName || user?.displayName || "",
    ).trim();
    if (!displayName) throw new Error("Entre ton prenom.");

    const personId = linkedPerson?.id || (await ensureLinkedHouseholdProfile(currentFamilyId, user, displayName));
    const updates = {
      displayName,
      color: profile?.color || linkedPerson?.color || "#8B7355",
    };

    await Promise.all([
      saveDisplayName(user.uid, displayName, userProfile?.familyIds || []),
      updateFamilyPerson(currentFamilyId, personId, updates),
    ]);

    const cleanedMemberDrafts = memberDrafts
      .map((member) => ({
        displayName: String(member?.displayName || member?.name || "").trim(),
        mode: member?.mode === "with-account" ? "with-account" : "without-account",
        role: member?.role === "admin" ? "admin" : "member",
      }))
      .filter((member) => member.displayName);

    const baseSortOrder = Math.max(safePeople.length, linkedPerson?.id ? 1 : 0, 1);
    for (let index = 0; index < cleanedMemberDrafts.length; index += 1) {
      const member = cleanedMemberDrafts[index];
      const wantsAccount = member.mode === "with-account";
      const createdPersonId = await createFamilyPerson(currentFamilyId, {
        displayName: member.displayName,
        type: "adult",
        profileMode: wantsAccount ? "app_user" : "context",
        linkedAccountId: "",
        canCompleteTasks: wantsAccount,
        active: true,
        role: wantsAccount ? member.role : "member",
        sortOrder: baseSortOrder + index,
      });
      if (wantsAccount) {
        await createHouseholdInvitation({
          familyId: currentFamilyId,
          personId: createdPersonId,
          createdBy: user.uid,
          targetEmail: "",
        });
      }
    }

    await completePendingFamilyOnboarding(user.uid, currentFamilyId);
    setAccountMessage(
      cleanedMemberDrafts.length
        ? "Profil cree. Le foyer est pret et les membres ont bien ete ajoutes."
        : "Profil cree. Bienvenue dans l'application.",
    );
  }

  async function handleDeletePerson(personId) {
    if (!currentFamilyId) throw new Error("Aucune famille active.");
    await deleteFamilyPerson(currentFamilyId, personId);
    await saveFamilyPeopleOrder(
      currentFamilyId,
      safePeople.filter((person) => person.id !== personId),
    );
  }

  async function handleMovePerson(personId, direction) {
    if (!currentFamilyId) throw new Error("Aucune famille active.");
    const index = safePeople.findIndex((person) => person.id === personId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= safePeople.length) return;
    const reordered = safePeople.slice();
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    await saveFamilyPeopleOrder(currentFamilyId, reordered);
  }

  async function handleLeaveFamily() {
    if (!user?.uid) throw new Error("Aucun compte connecte.");
    if (!currentFamilyId || !currentFamily) throw new Error("Aucun foyer actif.");
    const remainingFamilyIds = (userProfile?.familyIds || []).filter((id) => id && id !== currentFamilyId);
    const nextFamilyId = remainingFamilyIds[0] || "";
    await leaveFamilyAccount({
      user,
      userProfile,
      familyId: currentFamilyId,
      linkedPersonId: linkedPerson?.id || "",
      nextFamilyId,
    });
    setAccountMessage(`Tu as quitte ${currentFamily.name || "ce foyer"}. Ton profil y reste comme profil du foyer.`);
  }

  async function handleDeleteFamily() {
    if (!user?.uid) throw new Error("Aucun compte connecte.");
    if (!currentFamilyId || !currentFamily) throw new Error("Aucun foyer actif.");
    await handleDeleteFamilyById(currentFamilyId);
  }

  async function handleDeleteFamilyById(familyId) {
    if (!user?.uid) throw new Error("Aucun compte connecte.");
    if (!familyId) throw new Error("Aucun foyer specifie.");
    const targetFamily = safeFamilies.find((f) => f.id === familyId) || (familyId === currentFamilyId ? currentFamily : null);
    const name = targetFamily?.name || "ce foyer";
    const remainingFamilyIds = (userProfile?.familyIds || []).filter((id) => id && id !== familyId);
    const nextFamilyId = remainingFamilyIds[0] || "";
    await deleteFamily({ familyId, user, nextFamilyId });
    setAccountMessage(`Le foyer "${name}" a ete supprime definitivement.`);
  }

  async function handleDeleteAccount(currentPassword = "") {
    if (!user?.uid) throw new Error("Aucun compte connecte.");
    try {
      await deleteCurrentUserAccount({
        user,
        userProfile,
        currentPassword,
      });
    } catch (error) {
      if (error?.code === "auth/requires-recent-login") {
        throw new Error(
          "Firebase demande une reconnexion recente pour supprimer ce compte. Reconnecte-toi puis reessaie.",
        );
      }
      throw new Error(formatAuthError(error));
    }
  }

  async function handleCancelProfileSetup({ discardDraft = false } = {}) {
    if (!user?.uid) return;
    if (discardDraft) {
      await discardCurrentUserDraftAccount(user.uid);
      return;
    }
    await signOutUser();
  }

  return {
    user, authReady, authPhase, bootLoading,
    startupStage, startupError, setStartupStage, setStartupError,
    userProfile, currentFamilyId, currentFamily, currentRole,
    safeFamilies, safeMembers, safePeople, appPeopleRaw, invitations,
    linkedPerson, householdPeople, agendaPeople, peopleBootstrapped,
    memberDirectory, linkedAccountChoices, linkedAccountLabels,
    authError, familyError, bootstrapError, setBootstrapError,
    accountMessage, setAccountMessage,
    emailMessage, passwordMessage,
    busy,
    runAuth, runFamilyAction,
    setPendingInviteCode,
    handleForgotPassword,
    handleChangeEmail, handleChangePassword,
    handlePreviewHouseholdInvitation,
    handleCreateHouseholdOnboarding,
    handleJoinHouseholdOnboarding,
    handleCreateFamily, handleJoinFamily, handleSwitchFamily, handleCreateInvitation,
    handleAddPerson, handleUpdatePerson, handleUpdateMemberRole, handleCompleteProfileSetup, handleDeletePerson, handleMovePerson,
    handleLeaveFamily, handleDeleteFamily, handleDeleteFamilyById, handleDeleteAccount, handleCancelProfileSetup,
  };
}
