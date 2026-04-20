import { html, useEffect, useState } from "../../lib.js";

const EMPTY_PERSON = {
  id: "",
  displayName: "",
  type: "adult",
  linkedAccountId: "",
  canCompleteTasks: true,
  active: true,
};

export function FamilyPanel({
  currentFamily = null,
  families = [],
  currentRole = "",
  userProfile = null,
  people = [],
  peopleRequired = false,
  onCreateFamily,
  onJoinFamily,
  onSwitchFamily,
  onRenameFamily,
  onSaveProfile,
  onAddPerson,
  onUpdatePerson,
  onDeletePerson,
  onMovePerson,
}) {
  const safeFamilies = Array.isArray(families) ? families : [];
  const safePeople = Array.isArray(people) ? people : [];
  const familyCount = safeFamilies.length;
  const peopleCount = safePeople.length;
  const safeCurrentFamily = currentFamily || null;
  const safeUserProfile = userProfile || null;
  const safePeopleRequired = Boolean(peopleRequired);

  const [createName, setCreateName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [rename, setRename] = useState(safeCurrentFamily?.name || "");
  const [profileName, setProfileName] = useState(safeUserProfile?.displayName || "");
  const [personForm, setPersonForm] = useState(EMPTY_PERSON);
  const [editId, setEditId] = useState("");

  useEffect(() => {
    setRename(safeCurrentFamily?.name || "");
  }, [safeCurrentFamily?.id, safeCurrentFamily?.name]);

  useEffect(() => {
    setProfileName(safeUserProfile?.displayName || "");
  }, [safeUserProfile?.displayName]);

  function resetPersonForm() {
    setPersonForm(EMPTY_PERSON);
    setEditId("");
  }

  function submitPerson() {
    if (!personForm.displayName.trim()) return;
    if (editId) {
      onUpdatePerson(editId, {
        displayName: personForm.displayName.trim(),
        type: personForm.type,
        linkedAccountId: personForm.linkedAccountId.trim(),
        canCompleteTasks: Boolean(personForm.canCompleteTasks),
        active: Boolean(personForm.active),
      });
    } else {
      onAddPerson({
        displayName: personForm.displayName.trim(),
        type: personForm.type,
        linkedAccountId: personForm.linkedAccountId.trim(),
        canCompleteTasks: Boolean(personForm.canCompleteTasks),
        active: Boolean(personForm.active),
      });
    }
    resetPersonForm();
  }

  function startEditPerson(person) {
    const safePerson = person || EMPTY_PERSON;
    setEditId(safePerson.id || "");
    setPersonForm({
      id: safePerson.id || "",
      displayName: safePerson.displayName || "",
      type: safePerson.type || "adult",
      linkedAccountId: safePerson.linkedAccountId || "",
      canCompleteTasks: Boolean(safePerson.canCompleteTasks),
      active: safePerson.active !== false,
    });
  }

  return html`
    <section className="family-panel">
      <div className="family-grid">
        <div className="ncard">
          <div className="miniTitle">Compte connecte</div>
          <div className="mini">Ce compte sert uniquement a te connecter a l'application.</div>
          <div className="arow" style=${{ marginTop: "8px" }}>
            <input className="ainp" value=${profileName} onInput=${(event) => setProfileName(event.target.value)} />
            <button className="abtn" onClick=${() => onSaveProfile(profileName)}>Enregistrer</button>
          </div>
          <div className="mini" style=${{ marginTop: "8px" }}>${safeUserProfile?.email || ""}</div>
        </div>

        <div className="ncard">
          <div className="miniTitle">Familles</div>
          ${familyCount > 0
            ? safeFamilies.map(
                (family) => html`
                  <button key=${family.id} className=${`family-chip ${safeCurrentFamily?.id === family.id ? "on" : ""}`} onClick=${() => onSwitchFamily(family.id)}>
                    ${family.name}
                  </button>
                `,
              )
            : html`<div className="mini">Aucune famille pour le moment.</div>`}
        </div>
      </div>

      ${!safeCurrentFamily
        ? html`
            <div className="family-grid">
              <div className="ncard">
                <div className="miniTitle">Creer une famille</div>
                <div className="mini">On demande seulement le nom du foyer.</div>
                <div className="arow" style=${{ marginTop: "8px" }}>
                  <input className="ainp" placeholder="Nom de la famille" value=${createName} onInput=${(event) => setCreateName(event.target.value)} />
                  <button className="aok" onClick=${() => onCreateFamily(createName)}>Creer</button>
                </div>
              </div>
              <div className="ncard">
                <div className="miniTitle">Rejoindre une famille</div>
                <div className="arow" style=${{ marginTop: "8px" }}>
                  <input className="ainp" placeholder="Code invitation" value=${joinCode} onInput=${(event) => setJoinCode(event.target.value)} />
                  <button className="aok" onClick=${() => onJoinFamily(joinCode)}>Rejoindre</button>
                </div>
              </div>
            </div>
          `
        : html`
            <div className="family-grid">
              <div className="ncard">
                <div className="miniTitle">Famille active</div>
                <div className="family-name">${safeCurrentFamily.name || "Famille"}</div>
                <div className="mini">Code invitation : <strong>${safeCurrentFamily.inviteCode || "..."}</strong></div>
                <div className="mini">Mon role d acces : <strong>${currentRole || "membre"}</strong></div>
                ${currentRole === "admin"
                  ? html`
                      <div className="arow" style=${{ marginTop: "10px" }}>
                        <input className="ainp" value=${rename} onInput=${(event) => setRename(event.target.value)} />
                        <button className="abtn" onClick=${() => onRenameFamily(rename)}>Renommer</button>
                      </div>
                    `
                  : null}
              </div>

              <div className="ncard">
                <div className="miniTitle">${safePeopleRequired ? "Configuration du foyer" : "Profils du foyer"}</div>
                <div className="mini">
                  ${safePeopleRequired
                    ? "Ajoute d abord les vraies personnes du foyer. Les comptes de connexion et les profils du foyer sont separes."
                    : "Ces profils servent aux taches, au calendrier, a l historique et a toute l organisation du foyer."}
                </div>

                <div className="aform" style=${{ marginTop: "10px" }}>
                  <div className="arow">
                    <input className="ainp" placeholder="Nom affiche" value=${personForm.displayName} onInput=${(event) => setPersonForm({ ...personForm, displayName: event.target.value })} />
                    <select className="asel compact-select" value=${personForm.type} onChange=${(event) => setPersonForm({ ...personForm, type: event.target.value })}>
                      <option value="adult">Adulte</option>
                      <option value="child">Enfant</option>
                    </select>
                  </div>
                  <div className="arow">
                    <input
                      className="ainp"
                      placeholder="linkedAccountId optionnel"
                      value=${personForm.linkedAccountId}
                      onInput=${(event) => setPersonForm({ ...personForm, linkedAccountId: event.target.value })}
                    />
                  </div>
                  <div className="arow">
                    <label className="help">
                      <input
                        type="checkbox"
                        checked=${personForm.canCompleteTasks}
                        onChange=${(event) => setPersonForm({ ...personForm, canCompleteTasks: event.target.checked })}
                      />
                      Peut valider les taches
                    </label>
                    <label className="help">
                      <input type="checkbox" checked=${personForm.active} onChange=${(event) => setPersonForm({ ...personForm, active: event.target.checked })} />
                      Profil actif
                    </label>
                  </div>
                  <div className="arow">
                    <button className="aok" onClick=${submitPerson}>${editId ? "Mettre a jour" : "Ajouter la personne"}</button>
                    ${editId ? html`<button className="acn" onClick=${resetPersonForm}>Annuler</button>` : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="ncard">
              <div className="miniTitle">Personnes du foyer</div>
              ${peopleCount > 0
                ? safePeople.map(
                    (person, index) => html`
                      <div className="person-row" key=${person.id}>
                        <div className="ubdg">
                          <div className="ucirc" style=${{ background: person.color || "#8B7355" }}>
                            ${(person.displayName || "?").slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div>${person.displayName || "Sans nom"}</div>
                            <div className="mini">
                              ${person.type === "child" ? "Enfant" : "Adulte"} - ${person.active === false ? "Inactif" : "Actif"} -
                              ${person.canCompleteTasks ? "Peut valider" : "Ne valide pas"}
                            </div>
                            ${person.linkedAccountId ? html`<div className="mini">Compte lie : ${person.linkedAccountId}</div>` : null}
                          </div>
                        </div>
                        <div className="member-actions">
                          <button className="mbtn" disabled=${index === 0} onClick=${() => onMovePerson(person.id, -1)}>Monter</button>
                          <button className="mbtn" disabled=${index === peopleCount - 1} onClick=${() => onMovePerson(person.id, 1)}>Descendre</button>
                          <button className="abtn" onClick=${() => startEditPerson(person)}>Modifier</button>
                          <button className="delbtn" onClick=${() => onDeletePerson(person.id)}>X</button>
                        </div>
                      </div>
                    `,
                  )
                : html`<div className="empty">Aucune personne du foyer pour le moment.</div>`}
            </div>
          `}
    </section>
  `;
}
