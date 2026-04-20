import { html } from "../../lib.js";

export function HistoryView({ history = [], users = [], onClearHistory }) {
  const safeUsers = Array.isArray(users) ? users : [];
  const safeHistory = Array.isArray(history) ? history : [];

  const columns = safeUsers.map((user) => ({
    ...user,
    entries: safeHistory.filter((entry) => entry.user === user.id),
  }));

  return html`
    <section>
      <div className="sh">
        <span className="st">Historique</span>
        <button className="clrbtn" onClick=${onClearHistory}>Effacer</button>
      </div>

      ${columns.length
        ? html`
            <div className="history-columns">
              ${columns.map(
                (column) => html`
                  <section className="history-column" key=${column.id}>
                    <div className="history-column-head">
                      <div className="ubdg">
                        <div className="ucirc" style=${{ background: column.color || "#8B7355" }}>
                          ${column.shortId || column.id}
                        </div>
                        <span>${column.label || "Personne"}</span>
                      </div>
                    </div>

                    <div className="history-column-body">
                      ${column.entries.length
                        ? column.entries.map(
                            (entry) => html`
                              <article className="history-card" key=${entry.id}>
                                <div className="history-card-top">
                                  <span className="history-icon">${entry.icon || "*"}</span>
                                  <span className="history-text">${entry.text || "Tâche"}</span>
                                </div>
                                <div className="history-meta">
                                  <span>${entry.date || ""}</span>
                                  <span>${entry.time || ""}</span>
                                </div>
                              </article>
                            `,
                          )
                        : html`<div className="empty">Rien pour le moment</div>`}
                    </div>
                  </section>
                `,
              )}
            </div>
          `
        : html`<div className="empty">Rien encore</div>`}
    </section>
  `;
}
