import { APP_VERSION } from "../../constants.js";
import { html, useEffect, useState } from "../../lib.js";

const EMPTY_PERSON = {
  id: "",
  displayName: "",
  type: "adult",
  profileMode: "app_user",
  canCompleteTasks: true,
  active: true,
  dateOfBirth: "",
};

function calcAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const d = new Date(dateOfBirth + "T00:00");
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
  return age >= 0 ? age : null;
}

function SectionCard({ id, icon, title, subtitle, soon = false, open, onToggle, children }) {
  return html`
    <div className=${`mrd-set-section${open ? " is-open" : ""}`}>
      <button className="mrd-set-section-head" onClick=${() => onToggle(id)}>
        <span className="mrd-set-section-icon">${icon}</span>
        <div className="mrd-set-section-info">
          <span className="mrd-set-section-title">${title}</span>
          <span className="mrd-set-section-sub">${subtitle}</span>
        </div>
        <div className="mrd-set-section-right">
          ${soon ? html`<span className="mrd-set-soon">Bientôt</span>` : null}
          <svg className="mrd-set-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </button>
      ${open ? html`<div className="mrd-set-section-body">${children}</div>` : null}
    </div>
  `;
}

function PlaceholderList({ items }) {
  return html`
    <div className="mrd-set-placeholder-list">
      ${items.map((item) => html`
        <div className="mrd-set-placeholder-row" key=${item}>
          <span>${item}</span>
          <span className="mrd-set-soon">Bientôt</span>
        </div>
      `)}
    </div>
  `;
}

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
  appTimeMode = "real",
  simulatedDateTime = "",
  currentAppDateLabel = "",
  importText = "",
  showImport = false,
  onCreateFamily,
  onJoinFamily,
  onSwitchFamily,
  onRenameFamily,
  onAddPerson,
  onUpdatePerson,
  onDeletePerson,
  onMovePerson,
  onChangeEmail,
  onChangePassword,
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
  onLogout,
}) {
  const safeFamilies = Array.isArray(families) ? families : [];
  const safePeople = Array.isArray(people) ? people : [];
  const safeInvitations = Array.isArray(invitations) ? invitations : [];
  const safeMemberDirectory = memberDirectory && typeof memberDirectory === "object" ? memberDirectory : {};
  const [createName, setCreateName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [rename, setRename] = useState(currentFamily?.name || "");
  const [newEmail, setNewEmail] = useState(userProfile?.email || "");
  const [newPassword, setNewPassword] = useState("");
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
  const [openSections, setOpenSections] = useState(() => (isOnboarding ? ["foyer"] : []));
  const [profileOpen, setProfileOpen] = useState(isOnboarding);
  const [linkedColor, setLinkedColor] = useState(linkedPerson?.color || "#8B7355");
  const [showInviteForId, setShowInviteForId] = useState("");

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
    if (!isOnboarding) return;
    setOpenSections((previous) => Array.from(new Set([...previous, "foyer"])));
    setProfileOpen(true);
  }, [isOnboarding]);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", appearanceMode === "dark" ? "dark" : "light");
    try {
      localStorage.setItem("mrd-theme", appearanceMode);
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

  function toggleSection(id) {
    setOpenSections((previous) => (previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]));
  }

  function resetPersonForm() {
    setEditId("");
    setPersonForm(EMPTY_PERSON);
  }

  function startAddFlow(kind) {
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

  function submitPassword() {
    if (!newPassword.trim()) return;
    onChangePassword(newPassword.trim());
    setNewPassword("");
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
  }

  const loginMethodLabel = authMode === "password" ? "Email et mot de passe" : authMode === "google" ? "Google" : "Connexion externe";
  const pendingInvitationsByMember = safeInvitations.reduce((accumulator, invitation) => {
    if (invitation.status !== "pending") return accumulator;
    accumulator[invitation.memberId] = invitation;
    return accumulator;
  }, {});

  const profileInitial = (linkedPerson?.displayName || userProfile?.email || "?").slice(0, 1).toUpperCase();
  const profileColor = linkedColor || linkedPerson?.color || "#8B7355";
  const roleDisplay = currentRole === "admin" ? "Admin" : "Standard";

  return html`
    <div className="mrd-set-page">

      <!-- ── Carte profil (MOI) ── -->
      <div className=${`mrd-set-profile-card${profileOpen ? " is-open" : ""}`}>
        <button className="mrd-set-profile-head" onClick=${() => setProfileOpen((v) => !v)}>
          <div className="mrd-set-profile-avatar" style=${{ background: profileColor }}>
            ${profileInitial}
          </div>
          <div className="mrd-set-profile-info">
            <span className="mrd-set-profile-name">${linkedPerson?.displayName || "Mon profil"}</span>
            <span className="mrd-set-profile-meta">${roleDisplay} · ${currentFamily?.name || "Aucun foyer"}</span>
            ${userProfile?.email ? html`<span className="mrd-set-profile-email">${userProfile.email}</span>` : null}
          </div>
          <svg className="mrd-set-profile-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>

        ${profileOpen ? html`
          <div className="mrd-set-profile-body">

            <!-- Prénom + couleur + rôle -->
            <div className="settings-group">
              <div className="settings-row">
                <span>Prénom affiché</span>
                <div style=${{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <input
                    className="ainp"
                    placeholder="Ton prénom"
                    value=${linkedName}
                    onInput=${(event) => setLinkedName(event.target.value)}
                    style=${{ width: "120px", minWidth: 0 }}
                  />
                  <button className="abtn" onClick=${submitLinkedName} disabled=${!linkedPerson?.id || !linkedName.trim()}>OK</button>
                </div>
              </div>
              <div className="settings-row">
                <span>Couleur du badge</span>
                <div style=${{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <div style=${{ width: "26px", height: "26px", borderRadius: "50%", background: profileColor, flexShrink: 0, border: "2px solid var(--mrd-border)" }}></div>
                  <input
                    type="color"
                    value=${linkedColor}
                    onInput=${(event) => setLinkedColor(event.target.value)}
                    style=${{ width: "34px", height: "34px", border: "none", background: "none", cursor: "pointer", padding: "0" }}
                  />
                  <button className="abtn" onClick=${submitLinkedColor} disabled=${!linkedPerson?.id}>OK</button>
                </div>
              </div>
              <div className="settings-row">
                <span>Rôle dans le foyer</span>
                <strong>${roleDisplay}</strong>
              </div>
            </div>

            <!-- Compte & connexion (tout en un) -->
            <div className="settings-subcard">
              <button className="settings-subhead" onClick=${() => setSecurityOpen((v) => !v)}>
                <div>
                  <div className="miniTitle">Compte & Connexion</div>
                  <div className="mini">${userProfile?.email || "—"} · ${loginMethodLabel}</div>
                </div>
                <span className="settings-chevron">${securityOpen ? "Fermer" : "Modifier"}</span>
              </button>
              ${securityOpen ? html`
                <div className="settings-subbody">
                  <div className="settings-actions">
                    <div className="miniTitle">Changer l’email</div>
                    <div className="arow">
                      <input className="ainp" type="email" placeholder="Nouvel email" value=${newEmail} onInput=${(event) => setNewEmail(event.target.value)} />
                      <button className="abtn" onClick=${submitEmail}>OK</button>
                    </div>
                    ${emailMessage ? html`<div className="mini">${emailMessage}</div>` : null}
                  </div>
                  <div className="settings-actions">
                    <div className="miniTitle">Changer le mot de passe</div>
                    ${authMode === "password"
                      ? html`
                          <div className="arow">
                            <input className="ainp" type="password" placeholder="Nouveau mot de passe" value=${newPassword} onInput=${(event) => setNewPassword(event.target.value)} />
                            <button className="aok" onClick=${submitPassword}>OK</button>
                          </div>
                        `
                      : html`<div className="mini">Compte Google — le mot de passe se gère en dehors de l’application.</div>`}
                    ${passwordMessage ? html`<div className="mini">${passwordMessage}</div>` : null}
                  </div>
                  ${accountMessage ? html`<div className="mini">${accountMessage}</div>` : null}
                  <div className="settings-inline-actions">
                    <button className="ghost-btn" disabled>Quitter le foyer</button>
                    <button className="ghost-btn" disabled>Supprimer le compte</button>
                    <span className="settings-badge soon">Bientôt</span>
                  </div>
                </div>
              ` : null}
            </div>

          </div>
        ` : null}
      </div>

      <!-- ── Sections ── -->
      <div className="mrd-set-stack">

        <!-- Foyer + Membres (fusionnés) -->
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

            <!-- Infos du foyer -->
            <div className="settings-group">
              <div className="settings-row">
                <span>Nom du foyer</span>
                <strong>${currentFamily.name}</strong>
              </div>
            </div>

            <!-- Renommer (admin seulement) -->
            ${currentRole === "admin" ? html`
              <div className="settings-row">
                <span>Renommer</span>
                <div style=${{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <input className="ainp" style=${{ width: "130px", minWidth: 0 }} placeholder="Nouveau nom" value=${rename} onInput=${(event) => setRename(event.target.value)} />
                  <button className="abtn" onClick=${() => onRenameFamily(rename)}>OK</button>
                </div>
              </div>
            ` : null}

            <!-- Liste des membres -->
            <div className="settings-actions">
              <div className="miniTitle">Membres du foyer</div>
              ${safePeople.length ? safePeople.map((person, index) => {
                const isContextProfile = person.profileMode === "context" || person.type === "child" || person.type === "animal";
                const linkedAccount = person.linkedAccountId ? safeMemberDirectory[person.linkedAccountId] || null : null;
                const pendingInvitation = pendingInvitationsByMember[person.id] || null;
                const roleLabel = linkedAccount?.role === "admin" ? "Admin" : "Standard";
                const memberTypeLabel = person.type === "animal" ? "Animal" : person.type === "child" ? "Enfant" : "Membre sans compte";
                const accountEmail = linkedAccount?.email || "";
                const canInvite = !isContextProfile && person.type === "adult" && !person.linkedAccountId;
                const inviteVisible = showInviteForId === person.id;
                return html`
                  <div className="person-row" key=${person.id}>
                    <div className="ubdg">
                      <div className="ucirc" style=${{ background: person.color || "#8B7355" }}>
                        ${(person.displayName || "?").slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        ${isContextProfile ? html`
                          <div>${person.displayName || "Sans nom"}</div>
                          <div className="mini">${memberTypeLabel} · sans compte</div>
                        ` : html`
                          <div>${person.displayName || "Sans nom"}</div>
                          <div className="mini">Utilisateur · ${roleLabel}${accountEmail ? ` · ${accountEmail}` : ""}</div>
                        `}
                        ${inviteVisible && pendingInvitation ? html`
                          <div style=${{ display: "flex", alignItems: "center", gap: "6px", marginTop: "6px" }}>
                            <span style=${{ fontFamily: "monospace", fontWeight: "700", fontSize: "14px", letterSpacing: "2px", background: "var(--mrd-surf2)", padding: "4px 10px", borderRadius: "8px", color: "var(--mrd-fg)" }}>${pendingInvitation.code}</span>
                            <button className="abtn" style=${{ fontSize: "11px", padding: "4px 10px" }} onClick=${() => navigator.clipboard?.writeText(pendingInvitation.code)}>Copier</button>
                            <button className="acn" style=${{ fontSize: "11px", padding: "4px 10px" }} onClick=${() => setShowInviteForId("")}>Fermer</button>
                          </div>
                        ` : null}
                      </div>
                    </div>
                    <div className="member-actions">
                      <button className="abtn" onClick=${() => startEdit(person)}>Modifier</button>
                      ${canInvite ? html`
                        <button className="abtn" style=${{ fontSize: "11px" }} onClick=${() => {
                          setShowInviteForId(person.id);
                          onCreateInvitation(person.id, "");
                        }}>
                          ${pendingInvitation ? "Code" : "Inviter"}
                        </button>
                      ` : null}
                      <button className="delbtn" onClick=${() => onDeletePerson(person.id)}>✕</button>
                    </div>
                  </div>
                `;
              }) : html`<div className="empty">Aucun membre pour l’instant.</div>`}
            </div>

            <!-- Ajouter un membre -->
            <div className="settings-actions">
              <div className="miniTitle">${editId ? "Modifier un membre" : "Ajouter un membre"}</div>
              ${!editId ? html`
                <div className="settings-actions" style=${{ gap: "6px" }}>
                  <div className="mini" style=${{ fontWeight: "600", color: "var(--mrd-fg2)" }}>Avec compte</div>
                  <div className="settings-inline-actions">
                    <button className=${`task-choice ${personForm.profileMode === "app_user" ? "on" : ""}`} onClick=${() => startAddFlow("app-user")}>
                      Utilisateur du foyer
                    </button>
                  </div>
                  <div className="mini" style=${{ fontWeight: "600", color: "var(--mrd-fg2)", marginTop: "6px" }}>Sans compte</div>
                  <div className="settings-inline-actions">
                    <button className=${`task-choice ${personForm.profileMode === "context" && personForm.type === "child" ? "on" : ""}`} onClick=${() => startAddFlow("context-child")}>
                      Enfant
                    </button>
                    <button className=${`task-choice ${personForm.profileMode === "context" && personForm.type === "animal" ? "on" : ""}`} onClick=${() => startAddFlow("context-animal")}>
                      Animal
                    </button>
                  </div>
                </div>
              ` : null}
              <div className="mini">
                ${personForm.profileMode === "app_user"
                  ? "Membre avec compte. Peut se connecter, recevoir et valider des tâches."
                  : "Membre sans compte. Peut être concerné par des événements, rendez-vous ou rappels."}
              </div>
              <div className="arow">
                <input className="ainp" placeholder="Prénom ou nom" value=${personForm.displayName} onInput=${(event) => setPersonForm({ ...personForm, displayName: event.target.value })} />
                <span className=${`settings-badge ${personForm.profileMode === "context" ? "soon" : ""}`}>
                  ${personForm.profileMode === "app_user" ? "Utilisateur" : personForm.type === "animal" ? "Animal" : "Sans compte"}
                </span>
              </div>
              ${personForm.profileMode === "app_user" ? html`
                <div className="arow">
                  <label className="help">
                    <input type="checkbox" checked=${personForm.canCompleteTasks} onChange=${(event) => setPersonForm({ ...personForm, canCompleteTasks: event.target.checked })} />
                    Peut valider les tâches
                  </label>
                  <label className="help">
                    <input type="checkbox" checked=${personForm.active} onChange=${(event) => setPersonForm({ ...personForm, active: event.target.checked })} />
                    Profil actif
                  </label>
                </div>
              ` : html`
                <div className="arow">
                  <label className="help">
                    <input type="checkbox" checked=${personForm.active} onChange=${(event) => setPersonForm({ ...personForm, active: event.target.checked })} />
                    Profil actif
                  </label>
                </div>
              `}
              <div className="arow">
                <button className="aok" onClick=${submitPerson}>${editId ? "Mettre à jour" : "Ajouter"}</button>
                ${editId ? html`<button className="acn" onClick=${resetPersonForm}>Annuler</button>` : null}
              </div>
            </div>

            <!-- Changer de foyer -->
            ${safeFamilies.length > 1 ? html`
              <div className="settings-actions">
                <div className="miniTitle">Changer de foyer</div>
                <div className="arow">
                  ${safeFamilies.map((family) => html`
                    <button key=${family.id} className=${`family-chip ${currentFamily?.id === family.id ? "on" : ""}`} onClick=${() => onSwitchFamily(family.id)}>
                      ${family.name}
                    </button>
                  `)}
                </div>
              </div>
            ` : null}

          ` : html`
            <!-- Pas encore de foyer -->
            <div className="settings-actions">
              <div className="miniTitle">Créer un foyer</div>
              <div className="arow">
                <input className="ainp" placeholder="Nom du foyer" value=${createName} onInput=${(event) => setCreateName(event.target.value)} />
                <button className="aok" onClick=${() => onCreateFamily(createName)}>Créer</button>
              </div>
            </div>
            <div className="settings-actions">
              <div className="miniTitle">Rejoindre un foyer existant</div>
              <div className="arow">
                <input className="ainp" placeholder="Code d’invitation" value=${joinCode} onInput=${(event) => setJoinCode(event.target.value)} />
                <button className="aok" onClick=${() => onJoinFamily(joinCode)}>Rejoindre</button>
              </div>
              <div className="mini">Le code d’invitation rattache ton compte au bon membre du foyer.</div>
            </div>
          `}
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
        <//>

        <!-- Notifications -->
        <${SectionCard}
          id="notifications"
          icon="🔔"
          title="Notifications"
          subtitle="Rappels, heures calmes et préférences."
          soon=${true}
          open=${openSections.includes("notifications")}
          onToggle=${toggleSection}
        >
          <${PlaceholderList}
            items=${[
              "Activer / désactiver les notifications",
              "Rappels de tâches",
              "Rappels agenda",
              "Rappels liste de courses",
              "Rappels repas",
              "Heures calmes / nuit",
            ]}
          />
        <//>

        <!-- Données -->
        <${SectionCard}
          id="data"
          icon="💾"
          title="Données"
          subtitle="Synchronisation, import et export."
          open=${openSections.includes("data")}
          onToggle=${toggleSection}
        >
          <div className="settings-group">
            <div className="settings-row">
              <span>Synchronisation</span>
              <strong>${syncLabel}</strong>
            </div>
          </div>
          <div className="settings-inline-actions">
            <button className="abtn" onClick=${onExportData}>Exporter</button>
            <button className="abtn" onClick=${onToggleImport}>${showImport ? "Fermer l’import" : "Importer"}</button>
            <button className="clrbtn" onClick=${onClearHistory}>Effacer l’historique</button>
            <button className="clrbtn" onClick=${onResetPlanner}>Réinitialiser</button>
          </div>
          ${showImport
            ? html`
                <div className="settings-actions">
                  <textarea className="nta" placeholder="Colle ici un export JSON" value=${importText} onInput=${(event) => onImportTextChange(event.target.value)}></textarea>
                  <div className="arow">
                    <button className="aok" onClick=${onImportData}>Importer</button>
                  </div>
                </div>
              `
            : null}
          ${dataMessage ? html`<div className="mini">${dataMessage}</div>` : null}
        <//>

        <!-- Aide -->
        <${SectionCard}
          id="support"
          icon="❓"
          title="Aide & Support"
          subtitle="Contact, suggestions et infos légales."
          open=${openSections.includes("support")}
          onToggle=${toggleSection}
        >
          <${PlaceholderList}
            items=${[
              "Signaler un bug",
              "Contacter le support",
              "Suggérer une fonctionnalité",
              "Politique de confidentialité",
              "Conditions d’utilisation",
            ]}
          />
          <div className="settings-row">
            <span>Version</span>
            <strong>${APP_VERSION}</strong>
          </div>
        <//>

      </div>

      <!-- ── Bouton déconnexion ── -->
      <button className="mrd-set-logout" onClick=${onLogout}>
        Se déconnecter
      </button>

    </div>
  `;
}
