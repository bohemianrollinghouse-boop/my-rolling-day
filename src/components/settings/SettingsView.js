import { APP_VERSION } from "../../constants.js";
import { html, useEffect, useState } from "../../lib.js";
import {
  BADGE_PALETTE, EMPTY_PERSON, getNotificationPermissionState,
  SectionCard, PlaceholderList, SeeMoreLink,
  SettingsGroup, SettingsRow, SettingsSwitch, SettingsToggleRow,
  SubPageHeader, ColorGrid,
} from "./SettingsUI.js";
import { EditMemberModal, AddPersonModal, NewMemberInviteModal } from "./SettingsModals.js";
import { SettingsSupportPage } from "./SettingsSupportPage.js";
import { NewHouseholdWizard } from "./NewHouseholdWizard.js";

export function SettingsView({
  isOnboarding = false,
  currentFamily = null,
  families = [],
  currentRole = "",
  userProfile = null,
  linkedPerson = null,
  memberDirectory = {},
  activePersonId = "",
  deviceMode = "personal",
  people = [],
  invitations = [],
  authMode = "unknown",
  syncLabel = "Pret",
  dataMessage = "",
  emailMessage = "",
  passwordMessage = "",
  accountMessage = "",
  busy = false,
  appTimeMode = "real",
  simulatedDateTime = "",
  currentAppDateLabel = "",
  importText = "",
  showImport = false,
  onCreateFamily,
  onCreateFamilyWizard,
  onJoinFamily,
  onSwitchFamily,
  onRenameFamily,
  onAddPerson,
  onUpdatePerson,
  onUpdateMemberRole = async () => {},
  onDeletePerson,
  onMovePerson,
  onChangeEmail,
  onChangePassword,
  onLeaveFamily,
  onDeleteFamily,
  onDeleteFamilyById,
  onDeleteAccount,
  onChangeActivePerson,
  onChangeDeviceMode,
  onCreateInvitation,
  onToggleImport,
  onUseRealDate,
  onUseSimulatedDate,
  onChangeSimulatedDate,
  onChangeSimulatedTime,
  onShiftSimulatedDate,
  onResetSimulatedDate,
  onImportTextChange,
  onImportData,
  onExportData,
  onClearHistory,
  onResetPlanner,
  autoOpenAddPersonSignal = 0,
  onConsumeAutoOpenAddPersonSignal = null,
  taskNotifications = null,
  onUpdateTaskNotifications = () => {},
  pushToken = "",
  pushSyncing = false,
  pushError = "",
  onRequestPushPermission = async () => null,
  settingsPage = "main",
  onSettingsPageChange = () => {},
  supportPage = "",
  onSupportPageChange = () => {},
  linkedAccountChoices = [],
  linkedAccountLabels = {},
  onLogout,
}) {
  const safeFamilies = Array.isArray(families) ? families : [];
  const safePeople = Array.isArray(people) ? people : [];
  const safeInvitations = Array.isArray(invitations) ? invitations : [];
  const safeMemberDirectory = memberDirectory && typeof memberDirectory === "object" ? memberDirectory : {};
  const [showNewHouseholdWizard, setShowNewHouseholdWizard] = useState(false);
  const [renamingHouseholdId, setRenamingHouseholdId] = useState("");
  const [renamingHouseholdValue, setRenamingHouseholdValue] = useState("");
  const [createName, setCreateName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [rename, setRename] = useState(currentFamily?.name || "");
  const [newEmail, setNewEmail] = useState(userProfile?.email || "");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [linkedName, setLinkedName] = useState(linkedPerson?.displayName || "");
  const [personForm, setPersonForm] = useState(EMPTY_PERSON);
  const [inviteEmails] = useState({});
  const [editId, setEditId] = useState("");
  const [securityOpen, setSecurityOpen] = useState(isOnboarding);
  const [appearanceMode, setAppearanceMode] = useState(() => {
    try {
      return localStorage.getItem("mrd-theme") || "light";
    } catch (error) {
      return "light";
    }
  });
  const [language, setLanguage] = useState(() => {
    try {
      return localStorage.getItem("mrd-language") || "fr";
    } catch (error) {
      return "fr";
    }
  });
  // settingsPage est géré par App.js via la prop settingsPage / onSettingsPageChange
  const [openSections, setOpenSections] = useState(() => (isOnboarding ? ["foyer"] : []));
  const [profileOpen, setProfileOpen] = useState(isOnboarding);
  const [linkedColor, setLinkedColor] = useState(linkedPerson?.color || "#8B7355");
  const [showInviteForId, setShowInviteForId] = useState("");
  const [showBadgePalette, setShowBadgePalette] = useState(false);
  const [showAddPersonModal, setShowAddPersonModal] = useState(false);
  const [newMemberInvite, setNewMemberInvite] = useState(null);
  const [editPersonModalId, setEditPersonModalId] = useState("");
  const [notificationPermission, setNotificationPermission] = useState(() => getNotificationPermissionState());
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  function refreshNotificationPermission() {
    setNotificationPermission(getNotificationPermissionState());
  }

  useEffect(() => {
    refreshNotificationPermission();
    function handleVisibility() {
      if (document.visibilityState === "visible") refreshNotificationPermission();
    }
    window.addEventListener("focus", refreshNotificationPermission);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", refreshNotificationPermission);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    setRename(currentFamily?.name || "");
  }, [currentFamily?.id, currentFamily?.name]);

  useEffect(() => {
    setNewEmail(userProfile?.email || "");
  }, [userProfile?.email]);

  useEffect(() => {
    setLinkedName(linkedPerson?.displayName || "");
  }, [linkedPerson?.id, linkedPerson?.displayName]);

  useEffect(() => {
    setLinkedColor(linkedPerson?.color || "#8B7355");
  }, [linkedPerson?.id, linkedPerson?.color]);

  useEffect(() => {
    setShowBadgePalette(false);
  }, [linkedPerson?.id]);

  useEffect(() => {
    if (!isOnboarding) return;
    setOpenSections((previous) => Array.from(new Set([...previous, "foyer"])));
    setProfileOpen(true);
  }, [isOnboarding]);

  useEffect(() => {
    const root = document.documentElement;
    const isDark = appearanceMode === "dark";
    root.setAttribute("data-theme", isDark ? "dark" : "light");
    try {
      localStorage.setItem("mrd-theme", appearanceMode);
      const themeColor = isDark ? "#1F1A17" : "#FAF4ED";
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", themeColor));
      const sb = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
      if (sb) sb.setAttribute("content", isDark ? "black" : "default");
    } catch (error) {
      console.warn("[settings] impossible d enregistrer le theme", error);
    }
  }, [appearanceMode]);

  useEffect(() => {
    try {
      localStorage.setItem("mrd-language", language);
    } catch (error) {
      console.warn("[settings] impossible d enregistrer la langue", error);
    }
  }, [language]);

  const effectiveRole = currentRole;
  const canManageHousehold = effectiveRole === "admin";

  function toggleSection(id) {
    setOpenSections((previous) => (previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]));
  }

  function goSettingsPage(page) {
    onSupportPageChange("");
    onSettingsPageChange(page || "main");
    requestAnimationFrame(() => {
      const scroller = document.querySelector(".mrd-screen .cnt");
      if (scroller?.scrollTo) scroller.scrollTo({ top: 0, behavior: "auto" });
    });
  }

  function resetPersonForm() {
    setEditId("");
    setPersonForm(EMPTY_PERSON);
  }

  function openAddPersonModal() {
    if (!canManageHousehold) return;
    setShowAddPersonModal(true);
  }

  function startAddFlow(kind) {
    if (!canManageHousehold) return;
    if (kind === "context-child") {
      setEditId("");
      setPersonForm({
        id: "",
        displayName: "",
        type: "child",
        profileMode: "context",
        canCompleteTasks: false,
        active: true,
      });
      return;
    }
    if (kind === "context-animal") {
      setEditId("");
      setPersonForm({
        id: "",
        displayName: "",
        type: "animal",
        profileMode: "context",
        canCompleteTasks: false,
        active: true,
      });
      return;
    }
    setEditId("");
    setPersonForm({
      id: "",
      displayName: "",
      type: "adult",
      profileMode: "app_user",
      canCompleteTasks: true,
      active: true,
    });
  }

  function submitPerson() {
    if (!canManageHousehold) return;
    if (!personForm.displayName.trim()) return;
    const payload = {
      displayName: personForm.displayName.trim(),
      type: personForm.type,
      profileMode: personForm.profileMode || (personForm.type === "adult" ? "app_user" : "context"),
      canCompleteTasks: Boolean(personForm.canCompleteTasks),
      active: Boolean(personForm.active),
    };
    if (editId) {
      onUpdatePerson(editId, payload);
    } else {
      onAddPerson(payload);
    }
    resetPersonForm();
  }

  function startEdit(person) {
    if (!canManageHousehold) return;
    const safePerson = person || EMPTY_PERSON;
    setEditId(safePerson.id || "");
      setPersonForm({
        id: safePerson.id || "",
        displayName: safePerson.displayName || "",
        type: safePerson.type || "adult",
        profileMode: safePerson.profileMode || (safePerson.type === "adult" ? "app_user" : "context"),
        canCompleteTasks: Boolean(safePerson.canCompleteTasks),
        active: safePerson.active !== false,
      });
    setOpenSections((previous) => (previous.includes("foyer") ? previous : [...previous, "foyer"]));
  }

  async function submitPassword() {
    if (!oldPassword.trim() || !newPassword.trim()) return;
    const success = await onChangePassword(oldPassword.trim(), newPassword.trim());
    if (!success) return;
    setOldPassword("");
    setNewPassword("");
    setShowPasswordForm(false);
  }

  function submitEmail() {
    if (!newEmail.trim()) return;
    onChangeEmail(newEmail.trim());
  }

  function submitLinkedName() {
    if (!linkedPerson?.id || !linkedName.trim()) return;
    onUpdatePerson(linkedPerson.id, { displayName: linkedName.trim() });
  }

  function submitLinkedColor() {
    if (!linkedPerson?.id) return;
    onUpdatePerson(linkedPerson.id, { color: linkedColor });
    setShowBadgePalette(false);
  }

  async function submitCreateFamily() {
    const name = createName.trim();
    if (!name) return;
    await onCreateFamily(name);
    setCreateName("");
  }

  async function submitJoinFamily() {
    const code = joinCode.trim();
    if (!code) return;
    await onJoinFamily(code);
    setJoinCode("");
  }

  async function handleLeaveFamilyClick() {
    if (!onLeaveFamily || !currentFamily) return;
    const confirmed = window.confirm(
      `Quitter le foyer "${currentFamily.name || "ce foyer"}" ? Ton profil y restera sans compte lie.`,
    );
    if (!confirmed) return;
    await onLeaveFamily();
  }

  async function handleDeleteFamilyClick() {
    if (!onDeleteFamily || !currentFamily) return;
    const name = currentFamily.name || "ce foyer";
    const confirmed = window.confirm(
      `Supprimer definitivement le foyer "${name}" ?\n\nToutes les donnees (taches, agenda, repas, listes, membres...) seront effacees pour tous les membres. Cette action est irreversible.`,
    );
    if (!confirmed) return;
    await onDeleteFamily();
  }

  async function handleDeleteAccountClick() {
    if (!onDeleteAccount) return;
    const confirmed = window.confirm(
      "Supprimer definitivement ton compte ? Tu seras retiree de tes foyers et tu devras te reconnecter si tu changes d'avis.",
    );
    if (!confirmed) return;
    let currentPassword = "";
    if (authMode === "password") {
      currentPassword = window.prompt("Entre ton mot de passe actuel pour confirmer la suppression de ton compte.") || "";
      if (!currentPassword.trim()) return;
    }
    await onDeleteAccount(currentPassword);
  }

  const loginMethodLabel = authMode === "password" ? "Email et mot de passe" : authMode === "google" ? "Google" : "Connexion externe";
  // safeInvitations est trié newest-first — on prend le premier code pending par membre
  const pendingInvitationsByMember = {};
  for (const invitation of safeInvitations) {
    if (invitation.status !== "pending") continue;
    if (!pendingInvitationsByMember[invitation.memberId]) {
      pendingInvitationsByMember[invitation.memberId] = invitation;
    }
  }

  const profileInitial = (linkedPerson?.displayName || userProfile?.email || "?").slice(0, 1).toUpperCase();
  const profileColor = linkedColor || linkedPerson?.color || "#8B7355";
  const roleDisplay = effectiveRole === "admin" ? "Admin" : "Standard";
  const currentLinkedName = String(linkedPerson?.displayName || "");
  const currentFamilyName = String(currentFamily?.name || "");
  const currentEmail = String(userProfile?.email || "");
  const currentLinkedColor = String(linkedPerson?.color || "#8B7355");
  const canSubmitLinkedName = Boolean(linkedPerson?.id) && linkedName.trim() && linkedName.trim() !== currentLinkedName.trim();
  const canSubmitLinkedColor = Boolean(linkedPerson?.id) && linkedColor !== currentLinkedColor;
  const canSubmitEmail = newEmail.trim() && newEmail.trim() !== currentEmail.trim();
  const canSubmitPassword = authMode === "password" && oldPassword.trim() && newPassword.trim();

  useEffect(() => {
    if (!autoOpenAddPersonSignal || !canManageHousehold) return;
    setOpenSections((previous) => Array.from(new Set([...previous, "foyer"])));
    openAddPersonModal();
    onConsumeAutoOpenAddPersonSignal?.();
  }, [autoOpenAddPersonSignal, canManageHousehold, onConsumeAutoOpenAddPersonSignal]);
  const canRenameFamily = canManageHousehold && rename.trim() && rename.trim() !== currentFamilyName.trim();
  const canCreateFamily = createName.trim().length > 0;
  const canJoinFamily = joinCode.trim().length > 0;
  const canSubmitPerson = personForm.displayName.trim().length > 0;
  const editModalPerson = editPersonModalId ? (safePeople.find((p) => p.id === editPersonModalId) || null) : null;
  const editModalHasPendingCode = editModalPerson ? Boolean(pendingInvitationsByMember[editModalPerson.id]) : false;
  const editModalLinkedAccount = editModalPerson?.linkedAccountId ? safeMemberDirectory[editModalPerson.linkedAccountId] || null : null;
  const editModalRole = editModalLinkedAccount?.role || editModalPerson?.role || "member";
  // Autorise la re-génération même si le compte est déjà lié : utile si le membre perd l'accès
  // au foyer (ex. currentFamilyId réinitialisé). Seul le même uid peut ré-accepter le code.
  const editModalCanInvite = editModalPerson && editModalPerson.type !== "animal";
  const supportUserId = String(userProfile?.uid || linkedPerson?.linkedAccountId || "");

  function openSupportPage(page) {
    onSupportPageChange(page);
  }

  const notif = {
    enabled: Boolean(taskNotifications?.enabled),
    endOfDay: taskNotifications?.endOfDay !== false,
    endOfDayTime: taskNotifications?.endOfDayTime || "18:00",
    urgent: taskNotifications?.urgent !== false,
    due: taskNotifications?.due !== false,
    weeklyReminder: taskNotifications?.weeklyReminder !== false,
  };
  const activeNotificationItems = [
    notif.endOfDay ? `fin de journee ${notif.endOfDayTime}` : null,
    notif.urgent ? "taches urgentes" : null,
    notif.due ? "taches avec echeance" : null,
    notif.weeklyReminder ? "rappel hebdo 3 jours" : null,
  ].filter(Boolean);

  function updateNotif(key, value) {
    onUpdateTaskNotifications({ ...notif, [key]: value });
  }

  function openMemberFromSubpage(personId) {
    setEditPersonModalId(personId);
  }

  function openAddMemberFromSubpage() {
    setTimeout(() => openAddPersonModal(), 0);
  }

  function renderSettingsSubPage() {
    if (settingsPage === "profile") {
      return html`
        <div className="mrd-set-page settings-subpage">
          <${SubPageHeader} title="Mon profil" />
          <div className="settings-profile-hero">
            <div className="settings-profile-hero-avatar" style=${{ background: profileColor }}>${profileInitial}</div>
            <div className="settings-profile-hero-name">${linkedPerson?.displayName || "Mon profil"}</div>
            ${userProfile?.email ? html`<div className="settings-profile-hero-email">${userProfile.email}</div>` : null}
          </div>
          <${SettingsGroup} title="Identite">
            <div className="settings-subpage-field">
              <label>Prenom</label>
              <input className="ainp" placeholder="Votre prenom" value=${linkedName} onInput=${(event) => setLinkedName(event.target.value)} />
            </div>
            <${SettingsRow} label="Role dans le foyer" value=${roleDisplay} last=${true} />
          <//>
          <${SettingsGroup} title="Couleur du badge">
            <div className="settings-subpage-field">
              <p className="settings-subpage-help">Cette couleur t'identifie dans le foyer, les taches et les plannings.</p>
              <${ColorGrid} value=${linkedColor} onChange=${setLinkedColor} />
            </div>
          <//>
          <button
            type="button"
            className=${`settings-valider-btn${(canSubmitLinkedName || canSubmitLinkedColor) ? " active" : ""}`}
            disabled=${!canSubmitLinkedName && !canSubmitLinkedColor}
            onClick=${() => { if (canSubmitLinkedName) submitLinkedName(); if (canSubmitLinkedColor) submitLinkedColor(); }}
          >Valider</button>
        </div>
      `;
    }

    if (settingsPage === "households") {
      return html`
        <div className="mrd-set-page settings-subpage">
          <${SubPageHeader} title="Mes foyers" />

          <!-- Liste des foyers -->
          <section className="settings-subpage-group">
            <div className="settings-subpage-title-row">
              <div className="settings-subpage-group-title">${safeFamilies.length} foyer${safeFamilies.length !== 1 ? "s" : ""}</div>
            </div>
            <div className="settings-subpage-group-card">
              ${safeFamilies.length === 0 ? html`
                <div className="settings-empty-row">Aucun foyer pour le moment.</div>
              ` : safeFamilies.map((family, index) => {
                const isActive   = family.id === currentFamily?.id;
                const isRenaming = renamingHouseholdId === family.id;
                const isLast     = index === safeFamilies.length - 1;

                return html`
                  <div key=${family.id} className=${`households-row${isActive ? " households-row--active" : ""}${isLast ? " is-last" : ""}`}>

                    <!-- En-tête de la carte foyer -->
                    <div className="households-row-head">
                      <div className="households-row-icon">🏠</div>
                      <div className="households-row-info">
                        <span className="households-row-name">${family.name}</span>
                        ${isActive ? html`<span className="households-row-badge households-row-badge--active">Actif</span>` : null}
                      </div>
                    </div>

                    <!-- Champ de renommage inline (foyer actif + admin seulement) -->
                    ${isRenaming ? html`
                      <div className="households-rename-row">
                        <input
                          className="ainp households-rename-input"
                          value=${renamingHouseholdValue}
                          autoFocus
                          placeholder="Nouveau nom…"
                          onInput=${(e) => setRenamingHouseholdValue(e.target.value)}
                          onKeyDown=${(e) => {
                            if (e.key === "Enter" && renamingHouseholdValue.trim() && renamingHouseholdValue.trim() !== family.name) {
                              onRenameFamily(renamingHouseholdValue.trim());
                              setRenamingHouseholdId("");
                            }
                            if (e.key === "Escape") setRenamingHouseholdId("");
                          }}
                        />
                        <button
                          type="button"
                          className="settings-valider-btn${renamingHouseholdValue.trim() && renamingHouseholdValue.trim() !== family.name ? " active" : ""}"
                          disabled=${!renamingHouseholdValue.trim() || renamingHouseholdValue.trim() === family.name || busy}
                          onClick=${() => {
                            onRenameFamily(renamingHouseholdValue.trim());
                            setRenamingHouseholdId("");
                          }}
                        >Valider</button>
                      </div>
                    ` : null}

                    <!-- Actions -->
                    <div className="households-row-actions">
                      <div className="households-row-actions-left">
                        ${!isActive ? html`
                          <button
                            type="button"
                            className="households-switch-btn"
                            disabled=${busy}
                            onClick=${() => onSwitchFamily(family.id)}
                          >Changer de foyer</button>
                        ` : html`
                          <button
                            type="button"
                            className="households-switch-btn households-switch-btn--add"
                            disabled=${busy}
                            onClick=${openAddMemberFromSubpage}
                          >+ Ajouter un membre</button>
                        `}
                      </div>
                      ${isActive && canManageHousehold ? html`
                        <div className="households-row-actions-right">
                          <button
                            type="button"
                            className="households-switch-btn households-switch-btn--edit"
                            onClick=${() => {
                              if (isRenaming) {
                                setRenamingHouseholdId("");
                              } else {
                                setRenamingHouseholdId(family.id);
                                setRenamingHouseholdValue(family.name);
                              }
                            }}
                          >${isRenaming ? "✕ Annuler" : "✏️ Renommer"}</button>
                          <button
                            type="button"
                            className="households-switch-btn households-switch-btn--danger"
                            disabled=${busy}
                            onClick=${async () => {
                              const name = family.name || "ce foyer";
                              const ok = window.confirm(
                                `Supprimer definitivement "${name}" ?\n\nToutes les donnees (taches, agenda, repas, listes, membres...) seront effacees. Action irreversible.`
                              );
                              if (!ok) return;
                              await (onDeleteFamilyById || onDeleteFamily)(family.id);
                            }}
                          >Supprimer</button>
                        </div>
                      ` : null}
                    </div>

                  </div>
                `;
              })}
            </div>
          </section>

          <!-- Actions bas de page -->
          <${SettingsGroup} title="Ajouter un foyer">
            <div className="settings-subpage-field">
              <button
                type="button"
                className="foyer-add-btn foyer-add-btn--detail"
                onClick=${() => setShowNewHouseholdWizard(true)}
                disabled=${busy}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
                </svg>
                Nouveau foyer…
              </button>
            </div>
            <div className="settings-subpage-field">
              <div className="miniTitle">Rejoindre un foyer avec un code</div>
              <div className="arow">
                <input className="ainp" placeholder="ABC-123" value=${joinCode} onInput=${(e) => setJoinCode(e.target.value)} />
                <button className="aok" onClick=${submitJoinFamily} disabled=${!joinCode.trim() || busy}>Rejoindre</button>
              </div>
              <div className="mini">Le code d'invitation rattache ton compte au bon membre du foyer.</div>
            </div>
          <//>
        </div>
      `;
    }

    if (settingsPage === "household") {
      if (!canManageHousehold) {
        return html`
          <div className="mrd-set-page settings-subpage">
            <${SubPageHeader} title="Mon foyer" />
            <div className="settings-summary-card">
              <strong>Accès admin requis</strong>
              <span>La gestion détaillée du foyer est réservée aux admins.</span>
            </div>
          </div>
        `;
      }
      return html`
        <div className="mrd-set-page settings-subpage">
          <${SubPageHeader} title="Mon foyer" />
          <${SettingsGroup} title="Nom du foyer">
            <div className="settings-subpage-field">
              ${canManageHousehold ? html`
                <input className="ainp" value=${rename} onInput=${(event) => setRename(event.target.value)} />
                <button
                  type="button"
                  className=${`settings-valider-btn${canRenameFamily ? " active" : ""}`}
                  disabled=${!canRenameFamily}
                  onClick=${() => onRenameFamily(rename)}
                >Valider</button>
              ` : html`<div className="settings-static-value">${currentFamily?.name || "Aucun foyer"}</div>`}
            </div>
          <//>
          <section className="settings-subpage-group">
            <div className="settings-subpage-title-row">
              <div className="settings-subpage-group-title">Membres · ${safePeople.length}</div>
            </div>
            <div className="settings-subpage-group-card">
              ${safePeople.length ? safePeople.map((person, index) => {
                const isNoAccount = person.profileMode === "context" || person.type === "child" || person.type === "animal";
                const linkedAccount = person.linkedAccountId ? safeMemberDirectory[person.linkedAccountId] || null : null;
                const roleLabel = isNoAccount
                  ? (person.type === "animal" ? "Animal" : person.type === "child" ? "Enfant" : "Membre")
                  : (linkedAccount?.role === "admin" ? "Admin" : "Standard");
                const pendingCode = pendingInvitationsByMember[person.id] || null;
                return html`
                  <button type="button" className=${`settings-member-row${index === safePeople.length - 1 ? " is-last" : ""}`} key=${person.id} onClick=${() => openMemberFromSubpage(person.id)}>
                    <span className="foyer-member-badge" style=${{ background: person.color || "#8B7355" }}>${(person.displayName || "?").slice(0, 2).toUpperCase()}</span>
                    <span className="settings-member-copy">
                      <span className="settings-member-name">${person.displayName || "Sans nom"}</span>
                      <span className="settings-member-role">${roleLabel}${pendingCode?.code ? ` · ${pendingCode.code.slice(0, 3)}-${pendingCode.code.slice(3)}` : ""}</span>
                    </span>
                    <span className="settings-subpage-row-chevron">›</span>
                  </button>
                `;
              }) : html`<div className="settings-empty-row">Aucun membre pour le moment.</div>`}
            </div>
          </section>
          <${SettingsGroup} title="Invitations">
            <div className="settings-subpage-field">
              <button type="button" className="foyer-add-btn foyer-add-btn--detail" onClick=${openAddMemberFromSubpage}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
                </svg>
                Ajouter un membre
              </button>
              <div className="mini">${safeInvitations.filter((invitation) => invitation.status === "pending").length ? "Des codes d'invitation sont actifs." : "Aucun code actif pour le moment."}</div>
            </div>
          <//>
          <${SettingsGroup} title="Zone sensible">
            <${SettingsRow} icon="🚪" label="Quitter le foyer" onClick=${handleLeaveFamilyClick} danger=${true} />
            ${canManageHousehold ? html`
              <${SettingsRow} icon="🗑️" label="Supprimer le foyer" onClick=${handleDeleteFamilyClick} danger=${true} />
            ` : null}
            <${SettingsRow} icon="⛔" label="Supprimer mon compte" onClick=${handleDeleteAccountClick} danger=${true} last=${true} />
          <//>
        </div>
      `;
    }

    if (settingsPage === "notifications") {
      return html`
        <div className="mrd-set-page settings-subpage">
          <${SubPageHeader} title="Notifications" />
          <${SettingsGroup} title="Canal">
            <${SettingsToggleRow} icon="🔔" label="Rappels de taches" sub="Preferences partagees dans le foyer." value=${notif.enabled} onChange=${(value) => updateNotif("enabled", value)} />
            <${SettingsToggleRow}
              icon="📱"
              label="Cet appareil"
              sub=${
                notificationPermission === "granted"
                  ? (pushSyncing ? "Enregistrement en cours…" : pushToken ? "Rappels actifs sur cet appareil." : "Autorise — token en attente.")
                  : notificationPermission === "denied"
                  ? "Bloque. Modifiez les reglages de votre navigateur."
                  : notificationPermission === "unsupported"
                  ? "Non disponible sur cet appareil."
                  : "Appuyez pour activer les rappels ici."
              }
              value=${notificationPermission === "granted"}
              onChange=${async (val) => {
                if (val) {
                  if (notificationPermission === "denied") {
                    setShowNotificationModal(true);
                  } else {
                    await onRequestPushPermission();
                    refreshNotificationPermission();
                  }
                } else {
                  setShowNotificationModal(true);
                }
              }}
              last=${true}
            />
          <//>
          <${SettingsGroup} title="Types d'alertes">
            <${SettingsToggleRow} icon="🌙" label="Rappel fin de journee" sub=${`Tous les jours a ${notif.endOfDayTime}`} value=${notif.endOfDay} onChange=${(value) => updateNotif("endOfDay", value)} />
            ${notif.endOfDay ? html`
              <div className="settings-subpage-field">
                <label>Heure</label>
                <input className="ainp settings-time-input" type="time" value=${notif.endOfDayTime} onChange=${(event) => updateNotif("endOfDayTime", event.target.value)} />
              </div>
            ` : null}
            <${SettingsToggleRow} icon="⚠️" label="Taches urgentes" sub="Maximum un rappel par tache urgente et par jour." value=${notif.urgent} onChange=${(value) => updateNotif("urgent", value)} />
            <${SettingsToggleRow} icon="📅" label="Taches avec echeance" sub="Utilise le rappel choisi dans la tache." value=${notif.due} onChange=${(value) => updateNotif("due", value)} />
            <${SettingsToggleRow} icon="📆" label="Taches hebdomadaires en attente" sub="Rappel si une tache de la semaine n'a pas ete faite apres 3 jours." value=${notif.weeklyReminder} onChange=${(value) => updateNotif("weeklyReminder", value)} last=${true} />
          <//>
          <div className="settings-summary-card">
            <strong>Resume actif</strong>
            <span>${notif.enabled ? (activeNotificationItems.length ? activeNotificationItems.join(" · ") : "Aucun rappel actif") : "Rappels de taches desactives"}</span>
          </div>
        </div>
        ${showNotificationModal ? html`
        <div className="modal-backdrop settings-modal-backdrop notification-modal-backdrop" onClick=${() => setShowNotificationModal(false)}>
          <div className="notification-modal-card" onClick=${(event) => event.stopPropagation()}>
            <h2 className="notification-modal-title">Notifications</h2>
            ${(notificationPermission === "denied" || notificationPermission === "granted") ? html`
              <p className="notification-modal-text">${
                notificationPermission === "granted"
                  ? "Pour desactiver les notifications sur cet appareil, ouvre les reglages de ton navigateur et bloque les notifications pour cette application."
                  : "Les notifications ont ete bloquees sur cet appareil. Pour les reactiver, ouvre les reglages de ton navigateur ou de ton appareil et autorise les notifications pour cette application."
              }</p>
              <div className="notification-modal-actions">
                <button type="button" className="notification-modal-close" onClick=${() => setShowNotificationModal(false)}>Fermer</button>
              </div>
            ` : html`
              <p className="notification-modal-text">Choisis si cet appareil peut recevoir les rappels.</p>
              <div className="notification-modal-actions">
                <button
                  type="button"
                  className="notification-modal-primary"
                  disabled=${pushSyncing || notificationPermission === "unsupported"}
                  onClick=${async () => {
                    await onRequestPushPermission();
                    refreshNotificationPermission();
                    setShowNotificationModal(false);
                  }}
                >
                  Autoriser
                </button>
                <button
                  type="button"
                  className="notification-modal-secondary"
                  onClick=${() => {
                    refreshNotificationPermission();
                    setShowNotificationModal(false);
                  }}
                >
                  Ne pas autoriser
                </button>
                <button
                  type="button"
                  className="notification-modal-close"
                  onClick=${() => setShowNotificationModal(false)}
                >
                  Fermer
                </button>
              </div>
            `}
          </div>
        </div>
        ` : null}
      `;
    }

    if (settingsPage === "appearance") {
      return html`
        <div className="mrd-set-page settings-subpage">
          <${SubPageHeader} title="Apparence" />
          <div className="settings-appearance-grid">
            <button type="button" className=${`settings-choice-card${appearanceMode === "light" ? " on" : ""}`} onClick=${() => setAppearanceMode("light")}>
              <span>☀️</span><strong>Clair</strong>
            </button>
            <button type="button" className=${`settings-choice-card${appearanceMode === "dark" ? " on" : ""}`} onClick=${() => setAppearanceMode("dark")}>
              <span>🌙</span><strong>Sombre</strong>
            </button>
          </div>
          <${SettingsGroup} title="Langue">
            <div className="settings-subpage-field">
              <select className="asel" value=${language} onChange=${(event) => setLanguage(event.target.value)}>
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </div>
          <//>
        </div>
      `;
    }

    if (settingsPage === "account") {
      return html`
        <div className="mrd-set-page settings-subpage">
          <${SubPageHeader} title="Compte et securite" />
          <${SettingsGroup} title="Connexion">
            <${SettingsRow} icon="🔐" label="Mode de connexion" value=${loginMethodLabel} />
            <div className="settings-subpage-field">
              <label>Adresse mail</label>
              <input className="ainp" type="email" placeholder="Nouvel email" value=${newEmail} onInput=${(event) => setNewEmail(event.target.value)} />
              ${emailMessage ? html`<div className="mini">${emailMessage}</div>` : null}
            </div>
            ${authMode === "password" ? html`
              <div className="settings-subpage-field">
                <label>Mot de passe</label>
                <input className="ainp" type="password" placeholder="Ancien mot de passe" autocomplete="current-password" onInput=${(event) => setOldPassword(event.target.value)} />
                <input className="ainp" type="password" placeholder="Nouveau mot de passe" value=${newPassword} onInput=${(event) => setNewPassword(event.target.value)} autocomplete="new-password" />
                ${passwordMessage ? html`<div className="mini">${passwordMessage}</div>` : null}
              </div>
            ` : html`<div className="settings-subpage-note">Compte Google : le mot de passe se gere en dehors de l'application.</div>`}
            ${accountMessage ? html`<div className="mini">${accountMessage}</div>` : null}
          <//>
          <button
            type="button"
            className=${`settings-valider-btn${(canSubmitEmail || canSubmitPassword) ? " active" : ""}`}
            disabled=${!canSubmitEmail && !canSubmitPassword}
            onClick=${() => { if (canSubmitEmail) submitEmail(); if (canSubmitPassword) submitPassword(); }}
          >Valider</button>
          <${SettingsGroup} title="Zone sensible">
            <${SettingsRow} icon="🚪" label="Quitter le foyer" onClick=${handleLeaveFamilyClick} danger=${true} />
            <${SettingsRow} icon="🗑" label="Supprimer le compte" onClick=${handleDeleteAccountClick} danger=${true} last=${true} />
          <//>
        </div>
      `;
    }

    if (settingsPage === "privacy") {
      return html`
        <div className="mrd-set-page settings-subpage">
          <${SubPageHeader} title="💾 Donnees" />
          <${SettingsGroup} title="Mes donnees">
            <${SettingsRow} icon="📤" label="Exporter mes donnees" value="JSON" onClick=${onExportData} />
            <${SettingsRow} icon="📥" label=${showImport ? "Masquer l'import" : "Importer des donnees"} onClick=${onToggleImport} />
            ${showImport ? html`
              <div className="settings-subpage-field">
                <label>Import JSON</label>
                <textarea className="nta" rows="6" value=${importText} onInput=${(event) => onImportTextChange(event.target.value)}></textarea>
                <button type="button" className="aok" onClick=${onImportData}>Importer</button>
              </div>
            ` : null}
            ${dataMessage ? html`<div className="mini">${dataMessage}</div>` : null}
          <//>
          <${SettingsGroup} title="Maintenance">
            <${SettingsRow} icon="🧹" label="Vider l'historique" onClick=${onClearHistory} />
            <${SettingsRow} icon="↺" label="Reinitialiser le planner" onClick=${onResetPlanner} danger=${true} last=${true} />
          <//>
          <${SettingsGroup} title="Documents legaux">
            <${SettingsRow} label="Politique de confidentialite" onClick=${() => openSupportPage("privacy")} />
            <${SettingsRow} label="Conditions d'utilisation" onClick=${() => openSupportPage("terms")} last=${true} />
          <//>
        </div>
      `;
    }

    if (settingsPage === "help") {
      const faqs = [
        { q: "Comment inviter quelqu'un dans mon foyer ?", a: "Va dans Reglages, puis Foyer. Les codes d'invitation actifs sont affiches avec les membres concernes." },
        { q: "Puis-je utiliser plusieurs appareils ?", a: "Oui. Le mode appareil personnel ou partage se regle dans le foyer." },
        { q: "Les notes privees sont-elles partagees ?", a: "Non. Les contenus prives restent visibles uniquement par leur createur." },
      ];
      return html`
        <div className="mrd-set-page settings-subpage">
          <${SubPageHeader} title="Aide et contact" />
          <${SettingsGroup} title="Nous contacter">
            <${SettingsRow} icon="🐞" label="Signaler un bug" onClick=${() => openSupportPage("bug")} />
            <${SettingsRow} icon="✨" label="Suggerer une fonctionnalite" onClick=${() => openSupportPage("feature")} />
            <${SettingsRow} icon="✉️" label="Contacter le support" onClick=${() => openSupportPage("contact")} last=${true} />
          <//>
          <${SettingsGroup} title="Questions frequentes">
            ${faqs.map((faq, index) => html`
              <details className=${`settings-faq-row${index === faqs.length - 1 ? " is-last" : ""}`} key=${faq.q}>
                <summary>${faq.q}</summary>
                <p>${faq.a}</p>
              </details>
            `)}
          <//>
        </div>
      `;
    }

    if (settingsPage === "about") {
      return html`
        <div className="mrd-set-page settings-subpage">
          <${SubPageHeader} title="A propos" />
          <div className="settings-about-hero">
            <div className="settings-about-logo">
              <img src="./src/assets/brand/mark-white.svg" width="52" height="52" alt="" />
            </div>
            <h2>My Rolling Day</h2>
            <p>Version ${APP_VERSION}</p>
          </div>
          <div className="settings-about-quote">L'app qui fait tourner la maison.</div>
          <${SettingsGroup} title="Informations">
            <${SettingsRow} icon="🏷" label="Version" value=${APP_VERSION} />
            <${SettingsRow} icon="🏢" label="Editeur" value="Bohemian Rolling House" last=${true} />
          <//>
          <${SettingsGroup} title="Legal">
            <${SettingsRow} label="Politique de confidentialite" onClick=${() => openSupportPage("privacy")} />
            <${SettingsRow} label="Conditions d'utilisation" onClick=${() => openSupportPage("terms")} last=${true} />
          <//>
        </div>
      `;
    }

    return null;
  }

  if (supportPage) {
    return html`
      <${SettingsSupportPage}
        key=${supportPage}
        supportPage=${supportPage}
        onBack=${() => onSupportPageChange("")}
        userId=${supportUserId}
      />
    `;
  }

  function renderModalOverlays() {
    return html`
      ${editModalPerson ? html`
        <${EditMemberModal}
          person=${editModalPerson}
          role=${editModalRole}
          hasPendingCode=${editModalHasPendingCode}
          canInvite=${editModalCanInvite}
          linkedAccount=${editModalLinkedAccount}
          onClose=${() => setEditPersonModalId("")}
          onUpdateMemberRole=${onUpdateMemberRole}
          onUpdatePerson=${onUpdatePerson}
          onCreateInvitation=${onCreateInvitation}
          onInviteCreated=${(invite) => setNewMemberInvite(invite)}
          onDeletePerson=${onDeletePerson}
        />
      ` : null}

      ${showAddPersonModal ? html`
        <${AddPersonModal}
          onClose=${() => setShowAddPersonModal(false)}
          onAddPerson=${onAddPerson}
          onInviteCreated=${(invite) => setNewMemberInvite(invite)}
        />
      ` : null}

      ${newMemberInvite ? html`
        <${NewMemberInviteModal}
          invite=${newMemberInvite}
          onClose=${() => setNewMemberInvite(null)}
        />
      ` : null}

      ${showNewHouseholdWizard ? html`
        <${NewHouseholdWizard}
          onClose=${() => setShowNewHouseholdWizard(false)}
          onSubmit=${async (payload) => {
            await (onCreateFamilyWizard || onCreateFamily)(payload);
            setShowNewHouseholdWizard(false);
          }}
          busy=${busy}
          errorMessage=${""}
          linkedPerson=${linkedPerson}
          userProfile=${userProfile}
        />
      ` : null}
    `;
  }

  if (settingsPage !== "main") {
    return html`
      <div>
        ${renderSettingsSubPage()}
        ${renderModalOverlays()}
      </div>
    `;
  }

  return html`
    <div className="mrd-set-page">
      <!-- ── Carte profil (MOI) ── -->
      <div className=${`mrd-set-profile-card${profileOpen ? " is-open" : ""}`}>
        <button className="mrd-set-profile-head" onClick=${() => goSettingsPage("profile")}>
          <div className="mrd-set-profile-avatar" style=${{ background: profileColor }}>
            ${profileInitial}
          </div>
          <div className="mrd-set-profile-info">
            <span className="mrd-set-profile-name">${linkedPerson?.displayName || "Mon profil"}</span>
            <span className="mrd-set-profile-meta">${roleDisplay} · ${currentFamily?.name || "Aucun foyer"}</span>
            ${userProfile?.email ? html`<span className="mrd-set-profile-email">${userProfile.email}</span>` : null}
          </div>
          <svg className="mrd-set-profile-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>

        ${profileOpen ? html`
          <div className="mrd-set-profile-body">

            <!-- Prénom + couleur + rôle -->
            <div className="settings-group">
              <div className="settings-row" style=${{ flexDirection: "row", alignItems: "center", justifyContent: "flex-start", gap: "10px" }}>
                <span>Prénom :</span>
                <input
                  className="ainp"
                  placeholder="Votre prénom"
                  value=${linkedName}
                  onInput=${(event) => setLinkedName(event.target.value)}
                  style=${{ width: "140px", minWidth: 0 }}
                />
              </div>
              <div className="settings-row" style=${{ flexDirection: "column", alignItems: "flex-start", gap: "10px" }}>
                <div style=${{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                  <span>Couleur du badge :</span>
                  <div style=${{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <div style=${{ width: "22px", height: "22px", borderRadius: "50%", background: profileColor, flexShrink: 0, border: "2px solid var(--mrd-border)" }}></div>
                    ${showBadgePalette
                      ? html`<button className="abtn" onClick=${() => setShowBadgePalette(false)}>Annuler</button>`
                      : html`<button className="abtn" onClick=${() => setShowBadgePalette(true)}>Modifier</button>`}
                  </div>
                </div>
                ${showBadgePalette ? html`
                  <div className="badge-palette-grid">
                    ${BADGE_PALETTE.map((column, ci) => html`
                      <div key=${ci} className="badge-palette-col">
                        ${column.map((hex) => html`
                          <button
                            key=${hex}
                            type="button"
                            className=${`badge-palette-swatch${linkedColor === hex ? " selected" : ""}`}
                            style=${{ background: hex }}
                            onClick=${() => setLinkedColor(hex)}
                            aria-label=${hex}
                            title=${hex}
                          >
                            ${linkedColor === hex ? html`
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                                <path d="M5 13l4 4L19 7" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                              </svg>
                            ` : null}
                          </button>
                        `)}
                      </div>
                    `)}
                  </div>
                ` : null}
              </div>
              <div className="settings-row" style=${{ flexDirection: "row", alignItems: "center", justifyContent: "flex-start", gap: "10px" }}>
                <span>Rôle dans le foyer :</span>
                <strong>${roleDisplay}</strong>
              </div>
              <button
                type="button"
                className=${`settings-valider-btn${(canSubmitLinkedName || canSubmitLinkedColor) ? " active" : ""}`}
                disabled=${!canSubmitLinkedName && !canSubmitLinkedColor}
                onClick=${() => { if (canSubmitLinkedName) submitLinkedName(); if (canSubmitLinkedColor) submitLinkedColor(); }}
              >Valider</button>
            </div>

            <!-- Compte & connexion (tout en un) -->
            <div className="settings-subcard">
              <button className="settings-subhead" onClick=${() => setSecurityOpen((v) => !v)}>
                <div>
                  <div className="miniTitle">Connexion</div>
                  <div className="mini">${loginMethodLabel}</div>
                </div>
                <span className="settings-chevron">${securityOpen ? "Fermer" : "Modifier"}</span>
              </button>
              ${securityOpen ? html`
                <div className="settings-subbody">
                  <div className="settings-actions">
                    <div className="miniTitle">Adresse mail</div>
                    <input className="ainp" type="email" placeholder="Nouvel email" value=${newEmail} onInput=${(event) => setNewEmail(event.target.value)} />
                    ${emailMessage ? html`<div className="mini">${emailMessage}</div>` : null}
                  </div>
                  ${authMode === "password" ? html`
                    <div className="settings-actions">
                      <div className="miniTitle">Mot de passe</div>
                      <input className="ainp" type="password" placeholder="Ancien mot de passe" autocomplete="current-password" onInput=${(event) => setOldPassword(event.target.value)} />
                      <input className="ainp" type="password" placeholder="Nouveau mot de passe" value=${newPassword} onInput=${(event) => setNewPassword(event.target.value)} autocomplete="new-password" />
                      ${passwordMessage ? html`<div className="mini">${passwordMessage}</div>` : null}
                    </div>
                  ` : html`<div className="mini">Compte Google — le mot de passe se gère en dehors de l’application.</div>`}
                  ${accountMessage ? html`<div className="mini">${accountMessage}</div>` : null}
                  <button
                    type="button"
                    className=${`settings-valider-btn${(canSubmitEmail || canSubmitPassword) ? " active" : ""}`}
                    disabled=${!canSubmitEmail && !canSubmitPassword}
                    onClick=${() => { if (canSubmitEmail) submitEmail(); if (canSubmitPassword) submitPassword(); }}
                  >Valider</button>
                  <div className="settings-inline-actions settings-inline-actions--center">
                    <button className="ghost-btn settings-danger-btn" onClick=${handleLeaveFamilyClick} disabled=${busy || !currentFamily}>Quitter le foyer</button>
                    <button className="ghost-btn settings-danger-btn" onClick=${handleDeleteAccountClick} disabled=${busy || !userProfile}>Supprimer le compte</button>
                  </div>
                </div>
              ` : null}
            </div>

          </div>
        ` : null}
      </div>

      <!-- ── Sections ── -->
      <div className="mrd-set-stack">

        <!-- Foyer + Membres -->
        <${SectionCard}
          id="foyer"
          icon="🏠"
          title=${currentFamily ? `Foyer · ${currentFamily.name}` : "Foyer"}
          subtitle=${currentFamily
            ? `${safePeople.length} membre${safePeople.length !== 1 ? "s" : ""}`
            : "Créer ou rejoindre un foyer."}
          open=${openSections.includes("foyer")}
          onToggle=${toggleSection}
        >
          ${currentFamily ? html`

            <!-- Nom du foyer -->
            <div className="foyer-name-block">
              <div className="foyer-name-row">
                <strong className="foyer-name-value foyer-name-value--preview">${currentFamily.name}</strong>
              </div>
            </div>

            <!-- Liste des membres -->
            <div className="settings-actions">
              <div className="miniTitle">Membres du foyer</div>
              ${safePeople.length ? safePeople.map((person) => {
                return html`
                  <div className="foyer-member-card foyer-member-card--preview" key=${person.id}>
                    <div className="foyer-member-left">
                      <div className="foyer-member-badge foyer-member-badge--preview" style=${{ background: person.color || "#8B7355" }}>
                        ${(person.displayName || "?").slice(0, 1).toUpperCase()}
                      </div>
                      <div className="foyer-member-info">
                        <span className="foyer-member-name">${person.displayName || "Sans nom"}</span>
</div>
                    </div>
</div>
                `;
              }) : html`<div className="empty">Aucun membre pour l’instant.</div>`}
            </div>
            <${SeeMoreLink} onClick=${() => goSettingsPage("households")}>
              ${safeFamilies.length > 1 ? `Mes foyers (${safeFamilies.length}) →` : "Gérer mes foyers →"}
            <//>

          ` : html`
            <div className="empty">Aucun foyer actif pour l'instant.</div>
          `}
          ${!currentFamily ? html`
            <div className="settings-actions">
              <div className="miniTitle">Creer un foyer</div>
              <div className="arow">
                <input className="ainp" placeholder="Nom du foyer" value=${createName} onInput=${(event) => setCreateName(event.target.value)} />
                <button className="aok" onClick=${submitCreateFamily} disabled=${!canCreateFamily || busy}>Creer</button>
              </div>
            </div>
            <div className="settings-actions">
              <div className="miniTitle">Rejoindre un foyer existant</div>
              <div className="arow">
                <input className="ainp" placeholder="ABC-123" value=${joinCode} onInput=${(event) => setJoinCode(event.target.value)} />
                <button className="aok" onClick=${submitJoinFamily} disabled=${!canJoinFamily || busy}>Rejoindre</button>
              </div>
              <div className="mini">Le code d’invitation rattache ton compte au bon membre du foyer.</div>
            </div>
          ` : null}
          ${canManageHousehold ? html`<${SeeMoreLink} onClick=${() => goSettingsPage("household")}>Gerer le foyer en detail<//>` : null}
        <//>

        <!-- Apparence -->
        <${SectionCard}
          id="appearance"
          icon="🎨"
          title="Apparence"
          subtitle="Thème clair / sombre et langue."
          open=${openSections.includes("appearance")}
          onToggle=${toggleSection}
        >
          <div className="settings-actions">
            <div className="miniTitle">Thème</div>
            <div className="segmented settings-segmented">
              <button className=${`seg-btn ${appearanceMode === "light" ? "on" : ""}`} onClick=${() => setAppearanceMode("light")}>☀️ Clair</button>
              <button className=${`seg-btn ${appearanceMode === "dark" ? "on" : ""}`} onClick=${() => setAppearanceMode("dark")}>🌙 Sombre</button>
            </div>
          </div>
          <div className="settings-actions">
            <div className="miniTitle">Langue</div>
            <select className="asel" value=${language} onChange=${(event) => setLanguage(event.target.value)}>
              <option value="fr">🇫🇷 Français</option>
              <option value="en">🇬🇧 English</option>
            </select>
          </div>
          <${SeeMoreLink} onClick=${() => goSettingsPage("appearance")}>Plus d'options d'apparence<//>
        <//>

        <!-- Notifications -->
        <${SectionCard}
          id="notifications"
          icon="🔔"
          title="Notifications"
          subtitle="Rappels de tâches du foyer."
          open=${openSections.includes("notifications")}
          onToggle=${toggleSection}
        >
          ${(() => {
            const notif = {
              enabled: Boolean(taskNotifications?.enabled),
              endOfDay: taskNotifications?.endOfDay !== false,
              endOfDayTime: taskNotifications?.endOfDayTime || "18:00",
              urgent: taskNotifications?.urgent !== false,
              due: taskNotifications?.due !== false,
            };
            return html`
              <div className="settings-compact-toggle-row">
                <span>Activer les rappels de taches</span>
                <${SettingsSwitch}
                  value=${notif.enabled}
                  onChange=${(value) => onUpdateTaskNotifications({ ...notif, enabled: value })}
                />
              </div>
            `;
          })()}
          <${SeeMoreLink} onClick=${() => goSettingsPage("notifications")}>Tous les paramètres de notifications<//>
        <//>

        ${showNotificationModal ? html`
        <div className="modal-backdrop settings-modal-backdrop notification-modal-backdrop" onClick=${() => setShowNotificationModal(false)}>
            <div className="notification-modal-card" onClick=${(event) => event.stopPropagation()}>
              <h2 className="notification-modal-title">Notifications</h2>
              ${(notificationPermission === "denied" || notificationPermission === "granted") ? html`
                <p className="notification-modal-text">${
                  notificationPermission === "granted"
                    ? "Pour desactiver les notifications sur cet appareil, ouvre les reglages de ton navigateur et bloque les notifications pour cette application."
                    : "Les notifications ont ete bloquees sur cet appareil. Pour les reactiver, ouvre les reglages de ton navigateur ou de ton appareil et autorise les notifications pour cette application."
                }</p>
                <div className="notification-modal-actions">
                  <button type="button" className="notification-modal-close" onClick=${() => setShowNotificationModal(false)}>Fermer</button>
                </div>
              ` : html`
                <p className="notification-modal-text">Choisis si cet appareil peut recevoir les rappels.</p>
                <div className="notification-modal-actions">
                  <button
                    type="button"
                    className="notification-modal-primary"
                    disabled=${pushSyncing || notificationPermission === "unsupported"}
                    onClick=${async () => {
                      await onRequestPushPermission();
                      refreshNotificationPermission();
                      setShowNotificationModal(false);
                    }}
                  >
                    Autoriser
                  </button>
                  <button
                    type="button"
                    className="notification-modal-secondary"
                    onClick=${() => {
                      refreshNotificationPermission();
                      setShowNotificationModal(false);
                    }}
                  >
                    Ne pas autoriser
                  </button>
                  <button
                    type="button"
                    className="notification-modal-close"
                    onClick=${() => setShowNotificationModal(false)}
                  >
                    Fermer
                  </button>
                </div>
              `}
            </div>
          </div>
        ` : null}

        <${SectionCard}
          id="account"
          icon="🔐"
          title="Compte & sécurité"
          subtitle=${loginMethodLabel}
          open=${openSections.includes("account")}
          onToggle=${toggleSection}
        >
          <div className="settings-row">
            <span>Email</span>
            <strong>${currentEmail || "Non renseigne"}</strong>
          </div>
          <div className="settings-row">
            <span>Connexion</span>
            <strong>${loginMethodLabel}</strong>
          </div>
          <${SeeMoreLink} onClick=${() => goSettingsPage("account")}>Gérer la sécurité<//>
        <//>

        <!-- Aide -->
        <${SectionCard}
          id="support"
          icon="❓"
          title="Support & legal"
          subtitle="Contact, suggestions et infos légales."
          open=${openSections.includes("support")}
          onToggle=${toggleSection}
        >
          ${false ? html`<${PlaceholderList}
            items=${[
              "Signaler un bug",
              "Contacter le support",
              "Suggérer une fonctionnalité",
              "Politique de confidentialité",
              "Conditions d’utilisation",
            ]}
          />` : null}
          <div className="support-link-list">
            <button type="button" className="support-link-row" onClick=${() => openSupportPage("bug")}>
              <span>Signaler un bug</span><span>›</span>
            </button>
            <button type="button" className="support-link-row" onClick=${() => openSupportPage("feature")}>
              <span>Suggérer une fonctionnalité</span><span>›</span>
            </button>
            <button type="button" className="support-link-row" onClick=${() => openSupportPage("contact")}>
              <span>Contacter le support</span><span>›</span>
            </button>
            <button type="button" className="support-link-row" onClick=${() => openSupportPage("privacy")}>
              <span>Politique de confidentialité</span><span>›</span>
            </button>
            <button type="button" className="support-link-row" onClick=${() => openSupportPage("terms")}>
              <span>Conditions d’utilisation</span><span>›</span>
            </button>
          </div>
          <div className="settings-row">
            <span>Version</span>
            <strong>${APP_VERSION}</strong>
          </div>
          <${SeeMoreLink} onClick=${() => goSettingsPage("help")}>Centre d'aide & contact<//>
        <//>

        <${SectionCard}
          id="about"
          icon="ℹ️"
          title="À propos"
          subtitle=${`My Rolling Day · ${APP_VERSION}`}
          open=${openSections.includes("about")}
          onToggle=${toggleSection}
        >
          <div className="settings-row">
            <span>Version</span>
            <strong>${APP_VERSION}</strong>
          </div>
          <div className="settings-row">
            <span>Éditeur</span>
            <strong>Bohemian Rolling House</strong>
          </div>
          <${SeeMoreLink} onClick=${() => goSettingsPage("about")}>Voir les informations<//>
        <//>

      </div>

      <!-- ── Bouton déconnexion ── -->
      <button className="mrd-set-logout" onClick=${onLogout}>
        Se déconnecter
      </button>

      ${renderModalOverlays()}

    </div>
  `;
}
