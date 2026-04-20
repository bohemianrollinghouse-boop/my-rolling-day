import { APP_VERSION } from "../../constants.js";
import { html, useEffect, useState } from "../../lib.js";

const EMPTY_PERSON = {
  id: "",
  displayName: "",
  type: "adult",
  profileMode: "app_user",
  canCompleteTasks: true,
  active: true,
};

function SectionCard({ id, title, subtitle, status = "", open, onToggle, children }) {
  return html`
    <section className="settings-card">
      <button className="settings-head" onClick=${() => onToggle(id)}>
        <div>
          <div className="settings-title">${title}</div>
          <div className="mini">${subtitle}</div>
        </div>
        <div className="settings-meta">
          ${status ? html`<span className=${`settings-badge ${status === "Bientot disponible" ? "soon" : ""}`}>${status}</span>` : null}
          <span className="settings-chevron">${open ? "Masquer" : "Ouvrir"}</span>
        </div>
      </button>
      ${open ? html`<div className="settings-body">${children}</div>` : null}
    </section>
  `;
}

function PlaceholderList({ items }) {
  return html`
    <div className="placeholder-list">
      ${items.map(
        (item) => html`
          <div className="placeholder-row" key=${item}>
            <span>${item}</span>
            <span className="settings-badge soon">Bientot disponible</span>
          </div>
        `,
      )}
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
  const [openSections, setOpenSections] = useState(() => (isOnboarding ? ["foyer", "people", "account"] : ["account", "foyer"]));

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
    if (!isOnboarding) return;
    setOpenSections((previous) => Array.from(new Set([...previous, "foyer", "people", "account"])));
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
    setOpenSections((previous) => (previous.includes("people") ? previous : [...previous, "people"]));
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
    onUpdatePerson(linkedPerson.id, {
      displayName: linkedName.trim(),
    });
  }

  const loginMethodLabel = authMode === "password" ? "Email et mot de passe" : authMode === "google" ? "Google" : "Connexion externe";
  const pendingInvitationsByMember = safeInvitations.reduce((accumulator, invitation) => {
    if (invitation.status !== "pending") return accumulator;
    accumulator[invitation.memberId] = invitation;
    return accumulator;
  }, {});

  return html`
    <section className="settings-page">
      <div className="settings-intro ncard">
        <div className="miniTitle">${isOnboarding ? "Bienvenue" : "Reglages"}</div>
        <div className="family-name">${currentFamily?.name || "Mon foyer"}</div>
        <div className="mini">
          ${isOnboarding
            ? "On se connecte avec son compte personnel. Les invitations servent ensuite a rattacher le compte au bon membre du foyer."
            : "Compte personnel, foyer partage et profils du foyer pour organiser la vie de famille."}
        </div>
      </div>

      <div className="settings-stack">
        <${SectionCard}
          id="account"
          title="Compte"
          subtitle="Email personnel, nom visible et foyer."
          status="Actif"
          open=${openSections.includes("account")}
          onToggle=${toggleSection}
        >
          <div className="settings-group">
            <div className="settings-row">
              <span>Email connecte</span>
              <strong>${userProfile?.email || ""}</strong>
            </div>
            <div className="settings-row">
              <span>Nom</span>
              <div className="arow">
                <input className="ainp" placeholder="Nom" value=${linkedName} onInput=${(event) => setLinkedName(event.target.value)} />
                <button className="abtn" onClick=${submitLinkedName} disabled=${!linkedPerson?.id || !linkedName.trim()}>Enregistrer</button>
              </div>
            </div>
            <div className="settings-row">
              <span>Foyer</span>
              <strong>${currentFamily?.name || ""}</strong>
            </div>
          </div>

          <div className="settings-subcard">
            <button className="settings-subhead" onClick=${() => setSecurityOpen((value) => !value)}>
              <div>
                <div className="miniTitle">Securite du compte</div>
                <div className="mini">Email, mot de passe, methode de connexion et deconnexion.</div>
              </div>
              <span className="settings-chevron">${securityOpen ? "Masquer" : "Ouvrir"}</span>
            </button>

            ${securityOpen
              ? html`
                  <div className="settings-subbody">
                    <div className="settings-row">
                      <span>Methode de connexion</span>
                      <strong>${loginMethodLabel}</strong>
                    </div>

                    <div className="settings-actions">
                      <div className="miniTitle">Changer l'email</div>
                      <div className="arow">
                        <input className="ainp" type="email" placeholder="Nouvel email" value=${newEmail} onInput=${(event) => setNewEmail(event.target.value)} />
                        <button className="abtn" onClick=${submitEmail}>Changer</button>
                      </div>
                      ${emailMessage ? html`<div className="mini">${emailMessage}</div>` : null}
                    </div>

                    <div className="settings-actions">
                      <div className="miniTitle">Changer le mot de passe</div>
                      ${authMode === "password"
                        ? html`
                            <div className="arow">
                              <input className="ainp" type="password" placeholder="Nouveau mot de passe" value=${newPassword} onInput=${(event) => setNewPassword(event.target.value)} />
                              <button className="aok" onClick=${submitPassword}>Changer</button>
                            </div>
                          `
                        : html`<div className="mini">Ce compte passe par Google. Le mot de passe se gere en dehors de l'application.</div>`}
                      ${passwordMessage ? html`<div className="mini">${passwordMessage}</div>` : null}
                    </div>

                    ${accountMessage ? html`<div className="mini">${accountMessage}</div>` : null}

                    <div className="settings-inline-actions">
                      <button className="clrbtn" onClick=${onLogout}>Deconnexion</button>
                      <button className="ghost-btn" disabled>Supprimer le compte</button>
                      <span className="settings-badge soon">Bientot disponible</span>
                    </div>
                  </div>
                `
              : null}
          </div>
        <//>

        <${SectionCard}
          id="foyer"
          title="Foyer"
          subtitle="Creation du foyer, changement de foyer et invitation liee a un membre."
          status="Actif"
          open=${openSections.includes("foyer")}
          onToggle=${toggleSection}
        >
          ${currentFamily
            ? html`
                <div className="settings-group">
                  <div className="settings-row">
                    <span>Nom du foyer</span>
                    <strong>${currentFamily.name}</strong>
                  </div>
                  <div className="settings-row">
                    <span>Code foyer historique</span>
                    <strong>${currentFamily.inviteCode || "..."}</strong>
                  </div>
                </div>

                ${currentRole === "admin"
                  ? html`
                      <div className="settings-actions">
                        <div className="miniTitle">Renommer le foyer</div>
                        <div className="arow">
                          <input className="ainp" placeholder="Nom du foyer" value=${rename} onInput=${(event) => setRename(event.target.value)} />
                          <button className="abtn" onClick=${() => onRenameFamily(rename)}>Renommer</button>
                        </div>
                      </div>
                    `
                  : null}

                ${safeFamilies.length > 1
                  ? html`
                      <div className="settings-actions">
                        <div className="miniTitle">Changer de foyer</div>
                        <div className="arow">
                          ${safeFamilies.map(
                            (family) => html`
                              <button key=${family.id} className=${`family-chip ${currentFamily?.id === family.id ? "on" : ""}`} onClick=${() => onSwitchFamily(family.id)}>
                                ${family.name}
                              </button>
                            `,
                          )}
                        </div>
                      </div>
                    `
                  : html`
                      <div className="placeholder-row">
                        <span>Changer de foyer</span>
                        <span className="settings-badge soon">Future multi-foyers</span>
                      </div>
                    `}
              `
            : html`
                <div className="settings-actions">
                  <div className="miniTitle">Creer un foyer</div>
                  <div className="arow">
                    <input className="ainp" placeholder="Nom du foyer" value=${createName} onInput=${(event) => setCreateName(event.target.value)} />
                    <button className="aok" onClick=${() => onCreateFamily(createName)}>Creer</button>
                  </div>
                </div>
                <div className="settings-actions">
                  <div className="miniTitle">Accepter une invitation</div>
                  <div className="arow">
                    <input className="ainp" placeholder="Code d'invitation" value=${joinCode} onInput=${(event) => setJoinCode(event.target.value)} />
                    <button className="aok" onClick=${() => onJoinFamily(joinCode)}>Accepter</button>
                  </div>
                  <div className="mini">Le code rattache ton compte au membre precis qui a ete invite.</div>
                </div>
              `}
        <//>

        <${SectionCard}
          id="people"
          title="Personnes du foyer"
          subtitle="Ajoute ici les personnes qui utilisent l application, ainsi que les enfants et animaux du foyer."
          status="Actif"
          open=${openSections.includes("people")}
          onToggle=${toggleSection}
        >
          ${currentFamily
            ? html`
                <div className="settings-actions">
                  <div className="miniTitle">${editId ? "Modifier un profil du foyer" : "Ajouter au foyer"}</div>
                  ${!editId
                    ? html`
                        <div className="settings-inline-actions">
                          <button className=${`task-choice ${personForm.profileMode === "app_user" ? "on" : ""}`} onClick=${() => startAddFlow("app-user")}>
                            Ajouter une personne utilisatrice de l application
                          </button>
                          <button className=${`task-choice ${personForm.profileMode === "context" && personForm.type === "child" ? "on" : ""}`} onClick=${() => startAddFlow("context-child")}>
                            Ajouter un enfant au foyer
                          </button>
                          <button className=${`task-choice ${personForm.profileMode === "context" && personForm.type === "animal" ? "on" : ""}`} onClick=${() => startAddFlow("context-animal")}>
                            Ajouter un animal au foyer
                          </button>
                        </div>
                      `
                    : null}
                  <div className="mini">
                    ${personForm.profileMode === "app_user"
                      ? "Profil utilisateur de l application : peut recevoir des taches, les valider et etre invite avec un compte."
                      : personForm.type === "animal"
                        ? "Profil animal du foyer : visible seulement dans le calendrier et les evenements."
                        : "Profil enfant du foyer : visible seulement dans le calendrier et les evenements."}
                  </div>
                  <div className="arow">
                    <input className="ainp" placeholder="Nom affiche" value=${personForm.displayName} onInput=${(event) => setPersonForm({ ...personForm, displayName: event.target.value })} />
                    <span className=${`settings-badge ${personForm.profileMode === "context" ? "soon" : ""}`}>
                      ${personForm.profileMode === "app_user" ? "Utilisateur de l application" : personForm.type === "animal" ? "Animal du foyer" : "Enfant du foyer"}
                    </span>
                  </div>
                  ${personForm.profileMode === "app_user"
                    ? html`
                        <div className="arow">
                          <label className="help">
                            <input type="checkbox" checked=${personForm.canCompleteTasks} onChange=${(event) => setPersonForm({ ...personForm, canCompleteTasks: event.target.checked })} />
                            Peut valider les taches
                          </label>
                          <label className="help">
                            <input type="checkbox" checked=${personForm.active} onChange=${(event) => setPersonForm({ ...personForm, active: event.target.checked })} />
                            Profil actif
                          </label>
                        </div>
                      `
                    : html`
                        <div className="arow">
                          <label className="help">
                            <input type="checkbox" checked=${personForm.active} onChange=${(event) => setPersonForm({ ...personForm, active: event.target.checked })} />
                            Profil actif
                          </label>
                        </div>
                      `}
                  <div className="arow">
                    <button className="aok" onClick=${submitPerson}>${editId ? "Mettre a jour" : "Ajouter"}</button>
                    ${editId ? html`<button className="acn" onClick=${resetPersonForm}>Annuler</button>` : null}
                  </div>
                </div>

                <div>
                  ${safePeople.length
                    ? safePeople.map(
                        (person, index) => {
                          const isContextProfile = person.profileMode === "context" || person.type === "child" || person.type === "animal";
                          const linkedAccount = person.linkedAccountId ? safeMemberDirectory[person.linkedAccountId] || null : null;
                          const pendingInvitation = pendingInvitationsByMember[person.id] || null;
                          const roleLabel = linkedAccount?.role === "admin" ? "admin" : "utilisateur";
                          const accountEmail = linkedAccount?.email || pendingInvitation?.email || "";
                          return html`
                          <div className="person-row" key=${person.id}>
                            <div className="ubdg">
                              <div className="ucirc" style=${{ background: person.color || "#8B7355" }}>
                                ${(person.displayName || "?").slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                ${isContextProfile
                                  ? html`<div>${person.displayName || "Sans nom"}</div>`
                                  : html`
                                      <div>${person.displayName || "Sans nom"} - ${roleLabel}</div>
                                      ${accountEmail ? html`<div className="mini">${accountEmail}</div>` : null}
                                    `}
                                ${pendingInvitation && !person.linkedAccountId
                                  ? html`<div style=${{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
                                      <span style=${{ fontFamily: "monospace", fontWeight: "bold", fontSize: "15px", letterSpacing: "2px", background: "var(--surface2, #f0f0f0)", padding: "3px 8px", borderRadius: "6px" }}>${pendingInvitation.code}</span>
                                      <button
                                        className="abtn"
                                        style=${{ fontSize: "11px", padding: "2px 8px" }}
                                        onClick=${() => navigator.clipboard?.writeText(pendingInvitation.code)}
                                      >Copier</button>
                                    </div>`
                                  : null}
                              </div>
                            </div>
                            <div className="member-actions">
                              <button className="mbtn" disabled=${index === 0} onClick=${() => onMovePerson(person.id, -1)}>Monter</button>
                              <button className="mbtn" disabled=${index === safePeople.length - 1} onClick=${() => onMovePerson(person.id, 1)}>Descendre</button>
                              <button className="abtn" onClick=${() => startEdit(person)}>Modifier</button>
                              ${person.profileMode !== "context" && person.type === "adult" && !person.linkedAccountId
                                ? html`<button className="abtn" style=${{ fontSize: "11px" }} onClick=${() => onCreateInvitation(person.id, "")}>Regenerer</button>`
                                : null}
                              <button className="delbtn" onClick=${() => onDeletePerson(person.id)}>X</button>
                            </div>
                          </div>
                        `;
                        },
                      )
                    : html`<div className="empty">Aucune personne du foyer pour le moment.</div>`}
                </div>
              `
            : html`<div className="mini">Les personnes du foyer apparaissent apres la creation ou l'acceptation d'une invitation.</div>`}
        <//>

        <${SectionCard}
          id="notifications"
          title="Notifications"
          subtitle="Rappels, heures calmes et preferences de notification."
          status="Bientot disponible"
          open=${openSections.includes("notifications")}
          onToggle=${toggleSection}
        >
          <${PlaceholderList}
            items=${[
              "Activer ou desactiver les notifications",
              "Rappels de taches",
              "Rappels agenda",
              "Rappels liste de courses",
              "Rappels repas",
              "Heures calmes / nuit",
            ]}
          />
        <//>

        <${SectionCard}
          id="appearance"
          title="Apparence"
          subtitle="Theme de l application et langue."
          status="Actif"
          open=${openSections.includes("appearance")}
          onToggle=${toggleSection}
        >
          <div className="settings-actions">
            <div className="miniTitle">Theme</div>
            <div className="segmented settings-segmented">
              <button className=${`seg-btn ${appearanceMode === "light" ? "on" : ""}`} onClick=${() => setAppearanceMode("light")}>Mode clair</button>
              <button className=${`seg-btn ${appearanceMode === "dark" ? "on" : ""}`} onClick=${() => setAppearanceMode("dark")}>Mode sombre</button>
            </div>
          </div>

          <div className="settings-actions">
            <div className="miniTitle">Langue</div>
            <select className="asel" value=${language} onChange=${(event) => setLanguage(event.target.value)}>
              <option value="fr">Francais</option>
              <option value="en">English</option>
            </select>
          </div>
        <//>

        <${SectionCard}
          id="time"
          title="Date de l application"
          subtitle="Mode normal ou mode simulation pour tester les echeances et les resets."
          status="Actif"
          open=${openSections.includes("time")}
          onToggle=${toggleSection}
        >
          <div className="settings-actions">
            <div className="miniTitle">Mode de temps</div>
            <div className="task-choice-row">
              <button type="button" className=${`task-choice ${appTimeMode === "real" ? "on" : ""}`} onClick=${onUseRealDate}>
                Utiliser date reelle
              </button>
              <button type="button" className=${`task-choice ${appTimeMode === "simulated" ? "on" : ""}`} onClick=${onUseSimulatedDate}>
                Utiliser date simulee
              </button>
            </div>
            <div className="mini">Actuellement : ${currentAppDateLabel || "Date indisponible"}</div>
          </div>

          ${appTimeMode === "simulated"
            ? html`
                <div className="settings-actions">
                  <div className="miniTitle">Date et heure simulees</div>
                  <div className="arow">
                    <input
                      className="ainp"
                      type="date"
                      value=${simulatedDateTime ? simulatedDateTime.slice(0, 10) : ""}
                      onInput=${(event) => onChangeSimulatedDate(event.target.value)}
                    />
                    <input
                      className="ainp"
                      type="time"
                      value=${simulatedDateTime ? simulatedDateTime.slice(11, 16) : ""}
                      onInput=${(event) => onChangeSimulatedTime(event.target.value)}
                    />
                  </div>
                </div>

                <div className="settings-actions">
                  <div className="miniTitle">Avance rapide</div>
                  <div className="task-choice-row">
                    <button type="button" className="task-choice" onClick=${() => onShiftSimulatedDate(1)}>+1 jour</button>
                    <button type="button" className="task-choice" onClick=${() => onShiftSimulatedDate(7)}>+7 jours</button>
                    <button type="button" className="task-choice" onClick=${() => onShiftSimulatedDate(30)}>+30 jours</button>
                    <button type="button" className="task-choice" onClick=${onResetSimulatedDate}>Retour a aujourd hui</button>
                  </div>
                </div>
              `
            : null}
        <//>

        <${SectionCard}
          id="planner"
          title="Planner / Organisation"
          subtitle="Preferences de navigation et d organisation du planner."
          status="Bientot disponible"
          open=${openSections.includes("planner")}
          onToggle=${toggleSection}
        >
          <${PlaceholderList}
            items=${[
              "Vue par defaut jour / semaine",
              "Semaine lundi / dimanche",
              "Ordre des onglets",
              "Ordre d affichage des personnes",
              "Tri par defaut des taches",
            ]}
          />
        <//>

        <${SectionCard}
          id="data"
          title="Donnees"
          subtitle="Synchronisation, import, export et entretien des donnees."
          status="Actif"
          open=${openSections.includes("data")}
          onToggle=${toggleSection}
        >
          <div className="settings-group">
            <div className="settings-row">
              <span>Synchronisation automatique</span>
              <strong>${syncLabel}</strong>
            </div>
          </div>

          <div className="settings-inline-actions">
            <button className="abtn" onClick=${onExportData}>Exporter les donnees</button>
            <button className="abtn" onClick=${onToggleImport}>${showImport ? "Fermer l import" : "Importer des donnees"}</button>
            <button className="clrbtn" onClick=${onClearHistory}>Effacer l historique</button>
            <button className="clrbtn" onClick=${onResetPlanner}>Reinitialiser le planner</button>
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

        <${SectionCard}
          id="support"
          title="Aide / Support"
          subtitle="Contact, suivi produit et informations legales."
          status="Mixte"
          open=${openSections.includes("support")}
          onToggle=${toggleSection}
        >
          <div className="placeholder-row">
            <span>Signaler un bug</span>
            <span className="settings-badge soon">Bientot disponible</span>
          </div>
          <div className="placeholder-row">
            <span>Contacter le support</span>
            <span className="settings-badge soon">Bientot disponible</span>
          </div>
          <div className="placeholder-row">
            <span>Suggerer une fonctionnalite</span>
            <span className="settings-badge soon">Bientot disponible</span>
          </div>
          <div className="placeholder-row">
            <span>Politique de confidentialite</span>
            <span className="settings-badge soon">Bientot disponible</span>
          </div>
          <div className="placeholder-row">
            <span>Conditions d utilisation</span>
            <span className="settings-badge soon">Bientot disponible</span>
          </div>
          <div className="settings-row">
            <span>Version de l application</span>
            <strong>${APP_VERSION}</strong>
          </div>
        <//>
      </div>
    </section>
  `;
}
