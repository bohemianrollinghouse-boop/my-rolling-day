import {
  canChangePassword,
  changePasswordForCurrentUser,
  createFamily,
  createFamilyPerson,
  createHouseholdInvitation,
  deleteFamilyPerson,
  ensureUserProfile,
  formatAuthError,
  formatFirestoreError,
  resetPassword,
  joinFamily,
  listFamilies,
  saveFamilyPeopleOrder,
  saveUserEmail,
  updateEmailForCurrentUser,
  updateFamilyPerson,
  watchAuth,
  watchFamilyMembers,
  watchFamilyPeople,
  watchHouseholdInvitations,
  watchUserProfile,
} from "../firebase/client.js";
import { useEffect, useMemo, useState } from "../lib.js";

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
  console.log("[startup]", step, detail);
  if (window.__pushBootLog) {
    window.__pushBootLog(step, detail);
  }
}

export function useAuth() {
  const [authReady, setAuthReady] = useState(false);
  const [authPhase, setAuthPhase] = useState("checking");
  const [startupStage, setStartupStage] = useState("init");
  const [startupError, setStartupError] = useState("");
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [families, setFamilies] = useState([]);
  const [members, setMembers] = useState([]);
  const [people, setPeople] = useState([]);
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
  const currentFamily = safeFamilies.find((family) => family.id === currentFamilyId) || null;
  const currentRole = safeMembers.find((member) => member.uid === user?.uid)?.role || "";
  const linkedAccountChoices = safeMembers.map((member) => ({
    id: member.uid,
    label: member.displayName || member.email || "Compte",
  }));
  const linkedAccountLabels = safeMembers.reduce((acc, member) => {
    acc[member.uid] = member.displayName || member.email || "Compte lie";
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

  // Écoute l'état de connexion Firebase
  useEffect(() => {
    bootLog("app-mounted", "Initialisation App");
    setStartupStage("auth-check");
    const timeoutId = setTimeout(() => {
      bootLog("auth-timeout", "onAuthStateChanged trop long");
      setAuthReady(true);
      setAuthPhase((current) => (current === "checking" ? "signed_out" : current));
      setStartupStage("ready");
    }, 4000);

    const unsubscribe = watchAuth((nextUser) => {
      clearTimeout(timeoutId);
      bootLog("auth-state", nextUser ? `user:${nextUser.uid}` : "no-user");
      setUser(nextUser);
      setAuthReady(true);
      setAuthPhase(nextUser ? "signed_in" : "signed_out");
      setBootstrapError("");
      setStartupError("");
      if (!nextUser) {
        setUserProfile(null);
        setFamilies([]);
        setMembers([]);
        setPeople([]);
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

    const unsubscribe = watchUserProfile(
      user.uid,
      (profile) => {
        if (!active) return;
        setUserProfile(profile);
        setStartupStage("ready");
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
      unsubscribe();
    };
  }, [user]);

  // Charge la liste des familles
  useEffect(() => {
    let cancelled = false;
    if (!userProfile?.familyIds?.length) {
      setFamilies([]);
      return undefined;
    }
    listFamilies(userProfile.familyIds)
      .then((items) => { if (!cancelled) setFamilies(items); })
      .catch((error) => {
        if (cancelled) return;
        setBootstrapError(formatFirestoreError(error));
        setStartupError(formatFirestoreError(error));
        setStartupStage("error");
      });
    return () => { cancelled = true; };
  }, [userProfile?.familyIds]);

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
    if (!currentFamilyId) { setPeople([]); return undefined; }
    return watchFamilyPeople(
      currentFamilyId,
      (items) => setPeople(items),
      (error) => {
        setBootstrapError(formatFirestoreError(error));
        setStartupError(formatFirestoreError(error));
        setStartupStage("error");
      },
    );
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

  async function runAuth(action) {
    try {
      setBusy(true);
      setAuthError("");
      await action();
    } catch (error) {
      setAuthError(formatAuthError(error));
    } finally {
      setBusy(false);
    }
  }

  async function runFamilyAction(action) {
    try {
      setBusy(true);
      setFamilyError("");
      await action();
    } catch (error) {
      setFamilyError(error?.message || formatFirestoreError(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword(email) {
    if (!email?.trim()) {
      setAuthError("Entre ton adresse email pour recevoir le lien de reinitialisation.");
      return;
    }
    try {
      setBusy(true);
      setAuthError("");
      await resetPassword(email);
      setAuthError("Email envoye ! Verifie ta boite mail pour reinitialiser ton mot de passe.");
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
      setEmailMessage("Email mis a jour.");
    } catch (error) {
      setEmailMessage(formatAuthError(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleChangePassword(newPassword) {
    try {
      setBusy(true);
      setPasswordMessage("");
      await changePasswordForCurrentUser(newPassword);
      setPasswordMessage("Mot de passe mis a jour.");
    } catch (error) {
      setPasswordMessage(formatAuthError(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateFamily(name) {
    if (!name.trim()) throw new Error("Donne un nom au foyer.");
    await createFamily({ user, familyName: name });
    setAccountMessage("Ton compte personnel a ete lie automatiquement a ton profil du foyer.");
  }

  async function handleJoinFamily(code) {
    if (!code.trim()) throw new Error("Entre un code d invitation.");
    await joinFamily({ user, inviteCode: code });
    setAccountMessage("Invitation acceptee. Ton compte a ete rattache au bon membre du foyer.");
  }

  async function handleCreateInvitation(personId, email) {
    if (!currentFamilyId) throw new Error("Aucun foyer actif.");
    const invitation = await createHouseholdInvitation({
      familyId: currentFamilyId,
      personId,
      createdBy: user.uid,
      targetEmail: email,
    });
    setAccountMessage(`Invitation creee pour ${invitation.memberName} : ${invitation.code}`);
  }

  async function handleAddPerson(person) {
    if (!currentFamilyId) throw new Error("Aucune famille active.");
    const personId = await createFamilyPerson(currentFamilyId, { ...person, sortOrder: safePeople.length });
    if ((person.profileMode === "app_user" || person.type === "adult") && person.profileMode !== "context") {
      await createHouseholdInvitation({ familyId: currentFamilyId, personId, createdBy: user.uid, targetEmail: "" });
    }
  }

  async function handleUpdatePerson(personId, updates) {
    if (!currentFamilyId) throw new Error("Aucune famille active.");
    await updateFamilyPerson(currentFamilyId, personId, updates);
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

  return {
    user, authReady, authPhase,
    startupStage, startupError, setStartupStage, setStartupError,
    userProfile, currentFamilyId, currentFamily, currentRole,
    safeFamilies, safeMembers, safePeople, appPeopleRaw, invitations,
    linkedPerson, householdPeople, agendaPeople,
    memberDirectory, linkedAccountChoices, linkedAccountLabels,
    authError, familyError, bootstrapError, setBootstrapError,
    accountMessage, setAccountMessage,
    emailMessage, passwordMessage,
    busy,
    runAuth, runFamilyAction,
    setPendingInviteCode,
    handleForgotPassword,
    handleChangeEmail, handleChangePassword,
    handleCreateFamily, handleJoinFamily, handleCreateInvitation,
    handleAddPerson, handleUpdatePerson, handleDeletePerson, handleMovePerson,
  };
}
