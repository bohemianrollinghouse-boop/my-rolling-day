import { DEFAULT_MEMBER_COLOR } from "../../config/constants.js";
import { html } from "../../lib.js";
import { getCurrentAppDate, pad2 } from "../../utils/date.js";

function dayLabel(dateStr) {
  const today = getCurrentAppDate();
  const todayKey = `${pad2(today.getDate())}/${pad2(today.getMonth() + 1)}/${today.getFullYear()}`;
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = `${pad2(yesterday.getDate())}/${pad2(yesterday.getMonth() + 1)}/${yesterday.getFullYear()}`;
  if (dateStr === todayKey) return "Aujourd'hui";
  if (dateStr === yesterdayKey) return "Hier";
  return dateStr || "Date inconnue";
}

function groupByDay(entries) {
  const groups = [];
  entries.forEach((entry) => {
    const last = groups[groups.length - 1];
    if (last && last.date === entry.date) {
      last.entries.push(entry);
    } else {
      groups.push({ date: entry.date, entries: [entry] });
    }
  });
  return groups;
}

function groupByUser(entries, safeUsers) {
  const byUser = new Map();
  entries.forEach((entry) => {
    if (!byUser.has(entry.user)) byUser.set(entry.user, []);
    byUser.get(entry.user).push(entry);
  });
  return Array.from(byUser.entries()).map(([userId, userEntries]) => {
    const user = safeUsers.find((candidate) => candidate.id === userId);
    return {
      id: userId,
      label: user?.label || "Personne",
      shortId: user?.shortId || userId,
      color: user?.color || DEFAULT_MEMBER_COLOR,
      entries: userEntries,
    };
  });
}

export function HistoryView({ history = [], users = [], onClearHistory }) {
  const safeUsers = Array.isArray(users) ? users : [];
  const safeHistory = Array.isArray(history) ? history : [];

  const days = groupByDay(safeHistory).map((group) => ({
    date: group.date,
    people: groupByUser(group.entries, safeUsers),
  }));

  return html`
    <section>
      <div className="sh">
        <span className="st">Historique</span>
        <button className="clrbtn" onClick=${onClearHistory}>Effacer</button>
      </div>

      ${days.length
        ? html`
            <div className="history-feed">
              ${days.map(
                (day) => html`
                  <section className="history-day" key=${day.date}>
                    <div className="history-day-title">${dayLabel(day.date)}</div>
                    <div className="history-day-cards">
                      ${day.people.map(
                        (person) => html`
                          <div className="history-person-card" key=${person.id}>
                            <div className="history-column-head">
                              <div className="ubdg">
                                <div className="ucirc" style=${{ background: person.color }}>
                                  ${person.shortId}
                                </div>
                                <span>${person.label}</span>
                              </div>
                            </div>
                            <div className="history-column-body">
                              ${person.entries.map(
                                (entry) => html`
                                  <div className="history-entry" key=${entry.id}>
                                    <div className="history-entry-line">
                                      ${entry.icon
                                        ? html`<span className="history-entry-icon">${entry.icon}</span>`
                                        : null}
                                      <span className="history-entry-text">${entry.text || "Tâche"}</span>
                                    </div>
                                    <div className="history-entry-meta">${entry.time || ""}</div>
                                  </div>
                                `,
                              )}
                            </div>
                          </div>
                        `,
                      )}
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
