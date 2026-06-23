import { html, useState, useEffect, useRef, useMemo } from "../../lib.js";

// ── Storage ───────────────────────────────────────────────────
const STORE_PFX = "childcare:day:";

function pad(n) { return String(n).padStart(2, "0"); }
function toISO(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function isoToDate(iso) { const [y, m, dd] = iso.split("-").map(Number); return new Date(y, m - 1, dd); }

const fmtLong  = new Intl.DateTimeFormat("fr-FR", { weekday: "long",  day: "numeric", month: "long"    });
const fmtMon   = new Intl.DateTimeFormat("fr-FR", { month: "long",    year: "numeric"                  });
const fmtShort = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric"                   });

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function emptyChild() {
  return { repas: [], sommeil: [], couches: 0, selles: 0, sellesNote: "", obs: "", notes: "" };
}
function emptyDay() {
  return { celian: emptyChild(), iwan: emptyChild(), activites: "", travail: { arrivee: "", depart: "" } };
}
function mergeDay(raw) {
  const base = emptyDay();
  if (!raw) return base;
  base.activites = raw.activites || "";
  base.travail = { arrivee: raw.travail?.arrivee || "", depart: raw.travail?.depart || "" };
  ["celian", "iwan"].forEach(k => {
    const src = raw[k] || {};
    base[k] = { ...emptyChild(), ...src, repas: src.repas || [], sommeil: src.sommeil || [] };
  });
  return base;
}

function lsGet(iso) {
  try { const r = localStorage.getItem(STORE_PFX + iso); return r ? mergeDay(JSON.parse(r)) : emptyDay(); }
  catch { return emptyDay(); }
}
function lsSet(iso, day) {
  try { localStorage.setItem(STORE_PFX + iso, JSON.stringify(day)); } catch {}
}

function minutesBetween(a, b) {
  if (!a || !b) return 0;
  const [h1, m1] = a.split(":").map(Number);
  const [h2, m2] = b.split(":").map(Number);
  let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (diff < 0) diff += 1440;
  return diff;
}

function hLabel(m) {
  if (!m) return "";
  const h = Math.floor(m / 60), mm = m % 60;
  return h ? (h + "h" + (mm ? pad(mm) : "")) : (mm + "min");
}

function durLabel(a, b) { const m = minutesBetween(a, b); return m ? hLabel(m) : ""; }

// ── Component ─────────────────────────────────────────────────
export function ChildcareView() {
  const todayISO = toISO(new Date());
  const [iso, setIso]             = useState(todayISO);
  const [child, setChild]         = useState("celian");
  const [day, setDay]             = useState(() => lsGet(todayISO));
  const [flash, setFlash]         = useState(false);
  const [showRecap, setShowRecap] = useState(false);
  const [showMonth, setShowMonth] = useState(false);
  const [monthData, setMonthData] = useState(null);
  const [copyLbl, setCopyLbl]     = useState("Copier");
  const [cpMonLbl, setCpMonLbl]   = useState("Copier le total");
  const saveRef  = useRef(null);
  const flashRef = useRef(null);

  useEffect(() => { setDay(lsGet(iso)); }, [iso]);

  // Flush on unmount to avoid losing the last debounced save
  useEffect(() => () => {
    if (saveRef.current) clearTimeout(saveRef.current);
  }, []);

  function persist(nextDay, immediate = false) {
    clearTimeout(saveRef.current);
    const run = () => {
      lsSet(iso, nextDay);
      setFlash(true);
      clearTimeout(flashRef.current);
      flashRef.current = setTimeout(() => setFlash(false), 1200);
    };
    if (immediate) { run(); return; }
    saveRef.current = setTimeout(run, 450);
  }

  function patch(fn, immediate = false) {
    setDay(prev => { const next = fn(prev); persist(next, immediate); return next; });
  }

  function patchChild(fn, immediate = false) {
    patch(prev => {
      const c = { ...prev[child], repas: [...(prev[child].repas || [])], sommeil: [...(prev[child].sommeil || [])] };
      fn(c);
      return { ...prev, [child]: c };
    }, immediate);
  }

  function shiftDay(delta) {
    const d = isoToDate(iso); d.setDate(d.getDate() + delta); setIso(toISO(d));
  }

  const dateLabel = useMemo(() => {
    let lbl = cap(fmtLong.format(isoToDate(iso)));
    if (iso === toISO(new Date())) lbl += " · aujourd'hui";
    return lbl;
  }, [iso]);

  const c = day[child];
  const travailMin = minutesBetween(day.travail?.arrivee, day.travail?.depart);
  const sommeilMin = c.sommeil.reduce((s, x) => s + minutesBetween(x.debut, x.fin), 0);

  function buildRecapText() {
    const title = cap(fmtLong.format(isoToDate(iso)));
    function childSection(name, dot, cd) {
      let out = dot + " " + name + "\n";
      const repas = cd.repas.filter(r => r.h || r.t);
      if (repas.length) {
        out += "🍽️ Repas\n" + repas.map(r => "   • " + (r.h ? r.h + " " : "") + (r.t || "")).join("\n") + "\n";
      }
      const dodos = cd.sommeil.filter(s => s.debut || s.fin);
      if (dodos.length) {
        const tot = dodos.reduce((a, s) => a + minutesBetween(s.debut, s.fin), 0);
        out += "😴 Sommeil" + (tot ? " — total " + hLabel(tot) : "") + "\n";
        out += dodos.map(s => "   • " + (s.debut || "?") + " → " + (s.fin || "?") + (durLabel(s.debut, s.fin) ? " (" + durLabel(s.debut, s.fin) + ")" : "")).join("\n") + "\n";
      }
      if (cd.couches || cd.selles || cd.sellesNote) {
        out += "🧷 Couches : " + cd.couches + " · Selles : " + cd.selles + (cd.sellesNote ? " (" + cd.sellesNote + ")" : "") + "\n";
      }
      if (cd.obs)   out += "🩹 Observations : " + cd.obs + "\n";
      if (cd.notes) out += "📝 Notes : " + cd.notes + "\n";
      return out;
    }
    let body = "📅 " + title + "\n";
    if (day.travail?.arrivee || day.travail?.depart) {
      const t = day.travail, m = minutesBetween(t.arrivee, t.depart);
      body += "⏱️ Garde : " + (t.arrivee || "?") + " → " + (t.depart || "?") + (m ? " (" + hLabel(m) + ")" : "") + "\n";
    }
    body += "\n" + childSection("Célian", "🟠", day.celian) + "\n" + childSection("Iwan", "🟢", day.iwan);
    if (day.activites) body += "\n🎨 Notre journée : " + day.activites;
    return body;
  }

  function openMonth() {
    lsSet(iso, day);
    const ym = iso.slice(0, 7);
    const rows = [];
    let totalMin = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith(STORE_PFX + ym)) continue;
        const dayIso = key.slice(STORE_PFX.length);
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        let dd; try { dd = JSON.parse(raw); } catch { continue; }
        const t = dd.travail || {};
        if (!t.arrivee && !t.depart) continue;
        const m = minutesBetween(t.arrivee, t.depart);
        rows.push({ iso: dayIso, arrivee: t.arrivee, depart: t.depart, min: m });
        totalMin += m;
      }
    } catch {}
    rows.sort((a, b) => a.iso < b.iso ? -1 : 1);
    const label = cap(fmtMon.format(isoToDate(iso)));
    setMonthData({ label, rows, totalMin, days: rows.filter(r => r.min > 0).length });
    setShowMonth(true);
  }

  async function doCopy(text, setLbl, origLbl) {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
    }
    setLbl("Copié ✓");
    setTimeout(() => setLbl(origLbl), 1400);
  }

  // ── Sub-renders ───────────────────────────────────────────────
  function renderRepasList() {
    return c.repas.map((item, i) => html`
      <div key=${i} className="cc-line">
        <input type="time" className="cc-time" value=${item.h || ""} aria-label="Heure du repas"
          onInput=${e => patchChild(ch => { ch.repas = ch.repas.map((r, j) => j === i ? { ...r, h: e.currentTarget.value } : r); })} />
        <input type="text" className="cc-txt" placeholder="Ce qu'il/elle a mangé" value=${item.t || ""}
          onInput=${e => patchChild(ch => { ch.repas = ch.repas.map((r, j) => j === i ? { ...r, t: e.currentTarget.value } : r); })} />
        <button type="button" className="cc-rm" aria-label="Supprimer"
          onClick=${() => patchChild(ch => { ch.repas = ch.repas.filter((_, j) => j !== i); }, true)}>×</button>
      </div>
    `);
  }

  function renderSommeilList() {
    return c.sommeil.map((item, i) => {
      const dur = durLabel(item.debut, item.fin);
      return html`
        <div key=${i} className="cc-line">
          <input type="time" className="cc-time" value=${item.debut || ""} aria-label="Début sieste"
            onInput=${e => patchChild(ch => { ch.sommeil = ch.sommeil.map((s, j) => j === i ? { ...s, debut: e.currentTarget.value } : s); })} />
          <span className="cc-dash">→</span>
          <input type="time" className="cc-time" value=${item.fin || ""} aria-label="Fin sieste"
            onInput=${e => patchChild(ch => { ch.sommeil = ch.sommeil.map((s, j) => j === i ? { ...s, fin: e.currentTarget.value } : s); })} />
          ${dur ? html`<span className="cc-dur">${dur}</span>` : null}
          <button type="button" className="cc-rm" aria-label="Supprimer"
            onClick=${() => patchChild(ch => { ch.sommeil = ch.sommeil.filter((_, j) => j !== i); }, true)}>×</button>
        </div>
      `;
    });
  }

  function renderRecap() {
    if (!showRecap) return null;
    const text = buildRecapText();
    return html`
      <div className="cc-overlay" onClick=${() => setShowRecap(false)}>
        <div className="cc-sheet" onClick=${e => e.stopPropagation()}>
          <div className="cc-grip"></div>
          <h2 className="cc-sheet-title">Récap — ${dateLabel.replace(" · aujourd'hui", "")}</h2>
          <pre className="cc-recap-body">${text}</pre>
          <div className="cc-sheet-actions">
            <button type="button" className="cc-btn-close" onClick=${() => setShowRecap(false)}>Fermer</button>
            <button type="button" className="cc-btn-copy"
              onClick=${() => doCopy(text, setCopyLbl, "Copier")}>${copyLbl}</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderMonth() {
    if (!showMonth || !monthData) return null;
    const md = monthData;
    let monthText = "⏱️ Heures travaillées — " + md.label + "\n";
    monthText += "Total : " + (md.totalMin ? hLabel(md.totalMin) : "0h") + " (" + md.days + (md.days > 1 ? " jours" : " jour") + ")\n";
    md.rows.forEach(r => {
      monthText += "• " + cap(fmtShort.format(isoToDate(r.iso))) + " : " + (r.arrivee || "?") + " → " + (r.depart || "?") + (r.min ? " (" + hLabel(r.min) + ")" : "") + "\n";
    });
    return html`
      <div className="cc-overlay" onClick=${() => setShowMonth(false)}>
        <div className="cc-sheet" onClick=${e => e.stopPropagation()}>
          <div className="cc-grip"></div>
          <h2 className="cc-sheet-title">Heures — ${md.label}</h2>
          <div className="cc-month-total">
            <div className="cc-month-cap">Total travaillé</div>
            <span className="cc-month-big">${md.totalMin ? hLabel(md.totalMin) : "0h"}</span>
            <div className="cc-month-sub">${md.days}${md.days > 1 ? " jours" : " jour"} de garde</div>
          </div>
          ${md.rows.length === 0
            ? html`<div className="cc-empty">Aucune heure notée ce mois-ci.<br/>Renseigne tes horaires d'arrivée et de départ.</div>`
            : md.rows.map(r => html`
                <div key=${r.iso} className="cc-mrow">
                  <span className="cc-mrow-d">${cap(fmtShort.format(isoToDate(r.iso)))}</span>
                  <span className="cc-mrow-h">${r.arrivee || "?"} → ${r.depart || "?"}</span>
                  <b>${r.min ? hLabel(r.min) : "—"}</b>
                </div>
              `)
          }
          <div className="cc-sheet-actions" style=${{ marginTop: "16px" }}>
            <button type="button" className="cc-btn-close" onClick=${() => setShowMonth(false)}>Fermer</button>
            <button type="button" className="cc-btn-copy"
              onClick=${() => doCopy(monthText, setCpMonLbl, "Copier le total")}>${cpMonLbl}</button>
          </div>
        </div>
      </div>
    `;
  }

  // ── Main render ───────────────────────────────────────────────
  return html`
    <div className="cc-root">

      <div className="cc-topbar">
        <div className="cc-brand">
          <div className="cc-brand-left">
            <span className="cc-logo-mark">
              <i className="cc-dot cc-dot-celian"></i>
              <i className="cc-dot cc-dot-iwan"></i>
            </span>
            <span className="cc-brand-title">Carnet du jour</span>
          </div>
          <span className=${`cc-saved${flash ? " show" : ""}`}>Enregistré ✓</span>
        </div>
        <div className="cc-datebar">
          <button type="button" className="cc-navbtn" onClick=${() => shiftDay(-1)} aria-label="Jour précédent">‹</button>
          <div className="cc-datelabel">
            <span>${dateLabel}</span>
            <input type="date" className="cc-datepicker" value=${iso} aria-label="Choisir une date"
              onChange=${e => { if (e.currentTarget.value) setIso(e.currentTarget.value); }} />
          </div>
          <button type="button" className="cc-navbtn" onClick=${() => shiftDay(1)} aria-label="Jour suivant">›</button>
        </div>
      </div>

      <div className="cc-scroll">

        <div className="cc-card">
          <div className="cc-sec-h"><span className="cc-ico">⏱️</span> Mes horaires de garde</div>
          <div className="cc-line cc-time-range">
            <input type="time" className="cc-time cc-time-wide" value=${day.travail?.arrivee || ""} aria-label="Arrivée"
              onInput=${e => patch(prev => ({ ...prev, travail: { ...prev.travail, arrivee: e.currentTarget.value } }))} />
            <span className="cc-dash">→</span>
            <input type="time" className="cc-time cc-time-wide" value=${day.travail?.depart || ""} aria-label="Départ"
              onInput=${e => patch(prev => ({ ...prev, travail: { ...prev.travail, depart: e.currentTarget.value } }))} />
          </div>
          ${travailMin ? html`<div className="cc-total">Travaillé : <b>${hLabel(travailMin)}</b></div>` : null}
          <button type="button" className="cc-linkbtn" onClick=${openMonth}>📅 Mes heures du mois</button>
        </div>

        <div className="cc-tabs">
          ${["celian", "iwan"].map(kid => html`
            <button key=${kid} type="button"
              className=${`cc-tab${child === kid ? " active" : ""} cc-tab-${kid}`}
              onClick=${() => setChild(kid)}>
              <span className=${`cc-ava cc-ava-${kid}`}>${kid === "celian" ? "C" : "I"}</span>
              ${kid === "celian" ? "Célian" : "Iwan"}
            </button>
          `)}
        </div>

        <div className=${`cc-card cc-card-child cc-child-${child}`}>
          <div className="cc-childhead">
            <span className=${`cc-childava cc-childava-${child}`}>${child === "celian" ? "C" : "I"}</span>
            <span className="cc-childname">${child === "celian" ? "Célian" : "Iwan"}</span>
          </div>

          <div className="cc-sec">
            <div className="cc-sec-h"><span className="cc-ico">🍽️</span> Repas <span className="cc-hint">heure + ce qu'il/elle a mangé</span></div>
            ${renderRepasList()}
            <button type="button" className=${`cc-addline cc-addline-${child}`}
              onClick=${() => patchChild(ch => { ch.repas = [...ch.repas, { h: "", t: "" }]; }, true)}>
              + Ajouter un repas
            </button>
          </div>

          <div className="cc-sec">
            <div className="cc-sec-h"><span className="cc-ico">😴</span> Sommeil <span className="cc-hint">début → fin</span></div>
            ${renderSommeilList()}
            <button type="button" className=${`cc-addline cc-addline-${child}`}
              onClick=${() => patchChild(ch => { ch.sommeil = [...ch.sommeil, { debut: "", fin: "" }]; }, true)}>
              + Ajouter une sieste
            </button>
            ${sommeilMin ? html`<div className="cc-total">Total dodo : <b>${hLabel(sommeilMin)}</b></div>` : null}
          </div>

          <div className="cc-sec">
            <div className="cc-sec-h"><span className="cc-ico">🧷</span> Couches</div>
            <div className="cc-steppers">
              ${[["couches", "💧 Changes"], ["selles", "💩 Selles"]].map(([key, lbl]) => html`
                <div key=${key} className="cc-stepper">
                  <div className="cc-stepper-lbl">${lbl}</div>
                  <div className="cc-stepper-row">
                    <button type="button" className=${`cc-stepbtn cc-stepbtn-${child}`}
                      onClick=${() => patchChild(ch => { ch[key] = Math.max(0, (ch[key] || 0) - 1); })}>−</button>
                    <span className="cc-stepval">${c[key] || 0}</span>
                    <button type="button" className=${`cc-stepbtn cc-stepbtn-${child}`}
                      onClick=${() => patchChild(ch => { ch[key] = (ch[key] || 0) + 1; })}>+</button>
                  </div>
                </div>
              `)}
            </div>
            <textarea className="cc-ta" placeholder="Aspect des selles, remarque… (facultatif)"
              style=${{ marginTop: "10px" }}
              value=${c.sellesNote || ""}
              onInput=${e => patchChild(ch => { ch.sellesNote = e.currentTarget.value; })}></textarea>
          </div>

          <div className="cc-sec">
            <div className="cc-sec-h"><span className="cc-ico">🩹</span> Observations &amp; petits maux</div>
            <textarea className="cc-ta" placeholder="Bosse, rougeur, dent qui pousse, pleurs, humeur…"
              value=${c.obs || ""}
              onInput=${e => patchChild(ch => { ch.obs = e.currentTarget.value; })}></textarea>
          </div>

          <div className="cc-sec">
            <div className="cc-sec-h"><span className="cc-ico">📝</span> Autres notes</div>
            <textarea className="cc-ta" placeholder="Tout ce qui te semble utile à transmettre"
              value=${c.notes || ""}
              onInput=${e => patchChild(ch => { ch.notes = e.currentTarget.value; })}></textarea>
          </div>
        </div>

        <div className="cc-card" style=${{ marginBottom: "16px" }}>
          <div className="cc-sec-h"><span className="cc-ico">🎨</span> Notre journée <span className="cc-hint">commun aux deux</span></div>
          <textarea className="cc-ta" placeholder="Ce qu'on a fait ensemble : sortie, jeux, balade, comptines…"
            value=${day.activites || ""}
            onInput=${e => patch(prev => ({ ...prev, activites: e.currentTarget.value }))}></textarea>
        </div>

      </div>

      <div className="cc-footer">
        <button type="button" className="cc-cta" onClick=${() => setShowRecap(true)}>
          📋 Voir le récap du jour
        </button>
      </div>

      ${renderRecap()}
      ${renderMonth()}
    </div>
  `;
}
