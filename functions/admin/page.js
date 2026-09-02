/**
 * HTML de la console d'administration.
 *
 * Converti depuis le design `Admin.dc.html` (projet Claude Design
 * daeee0f6-3d6f-4712-9add-27e9ccd644d8). Le format `.dc.html` n'est pas du HTML
 * servable : il porte des `<sc-if>`, des `<sc-for>` et des liaisons `{{ }}` que
 * la toile interprete. La palette, la typographie et les styles en ligne sont
 * repris tels quels ; la conditionnelle devient du JavaScript de page.
 *
 * Servi par une Cloud Function, donc sans etape de build : un seul document,
 * styles compris, et les donnees arrivent par fetch sur /admin/api/*.
 */

const BRAND_MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="My Rolling Day"><circle cx="48" cy="48" r="34" fill="none" stroke="#B85F4A" stroke-width="3" stroke-linecap="round" stroke-dasharray="4 8" opacity=".55"/><circle cx="48" cy="48" r="22" fill="none" stroke="#B85F4A" stroke-width="3" stroke-linecap="round"/><circle cx="48" cy="14" r="5" fill="#B85F4A"/></svg>`;

// Palette du design, reprise a l'identique.
const CSS = `
:root{
  --bg:oklch(93% 0.015 72); --surf:oklch(99.5% 0.006 65); --surf2:oklch(95% 0.014 72);
  --line:oklch(94.5% 0.01 70); --line2:oklch(91% 0.015 70);
  --fg:oklch(27% 0.05 48); --fg2:oklch(27% 0.05 48 / .7); --fg3:oklch(27% 0.05 48 / .5);
  --a:oklch(58% 0.13 28); --aDark:oklch(38% 0.13 28); --aBtn:oklch(55% 0.13 28);
  --aLt:oklch(58% 0.13 28 / .08); --white:oklch(100% 0 0);
}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:var(--bg)}
body{font-family:"DM Sans",system-ui,sans-serif;color:var(--fg)}
h1,h2,h3{margin:0}
a{color:var(--aDark)} a:hover{color:var(--a)}
input::placeholder,textarea::placeholder{color:oklch(27% 0.05 48 / .35)}
@keyframes mrdFadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.serif{font-family:"Cormorant Garamond",Georgia,serif}
.eyebrow{font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--a)}
.card{background:var(--surf);border:1px solid var(--line);border-radius:18px;padding:20px}
.inp{padding:12px 14px;border:1px solid var(--line2);border-radius:12px;font:15px "DM Sans",sans-serif;
     background:var(--white);color:var(--fg);outline:none;width:100%}
.inp:focus{border-color:var(--a);box-shadow:0 0 0 3px oklch(58% 0.13 28 / .18)}
.btn{background:var(--aBtn);color:var(--white);border:none;border-radius:12px;padding:13px 18px;
     font:600 15px "DM Sans",sans-serif;cursor:pointer;box-shadow:0 4px 14px oklch(58% 0.13 28 / .13)}
.btn:hover{background:oklch(50% 0.13 28)} .btn:disabled{opacity:.55;cursor:default}
.btn-ghost{background:transparent;border:1px solid var(--line2);border-radius:12px;padding:9px 14px;
     font:500 13.5px "DM Sans",sans-serif;color:var(--fg2);cursor:pointer;text-align:left}
.btn-ghost:hover{background:var(--surf2)}
.nav{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:transparent;
     color:var(--fg2);border:none;border-radius:12px;padding:11px 14px;font:500 14.5px "DM Sans",sans-serif;cursor:pointer}
.nav:hover{background:var(--surf2)}
.nav.on{background:var(--aLt);color:var(--aDark);font-weight:600}
table{width:100%;border-collapse:collapse;font-size:14px}
th{text-align:left;font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
   color:var(--fg3);padding:0 10px 10px}
td{padding:11px 10px;border-top:1px solid var(--line)}
tr.row{cursor:pointer} tr.row:hover td{background:var(--surf2)}
.pill{display:inline-block;padding:3px 9px;border-radius:999px;font-size:11.5px;font-weight:700}
.muted{color:var(--fg3)} .small{font-size:12.5px}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.bars{display:flex;align-items:flex-end;gap:8px;height:120px}
.bar{flex:1;background:var(--aLt);border-radius:6px 6px 0 0;position:relative;min-height:3px}
.bar span{position:absolute;bottom:-20px;left:0;right:0;text-align:center;font-size:10.5px;color:var(--fg3)}
.hidden{display:none!important}
@media(max-width:860px){ aside{display:none} }
`;

const HEAD = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Administration — My Rolling Day</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Cormorant+Garamond:wght@700&display=swap" rel="stylesheet">
<style>${CSS}</style>`;

/** Page de connexion — markup repris du design, a l'identique. */
function loginPage({ error = "" } = {}) {
  return `<!doctype html><html lang="fr"><head>${HEAD}</head><body>
<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
  background:radial-gradient(1200px 600px at 50% -10%, oklch(96% 0.03 22), oklch(93% 0.015 72))">
  <form method="POST" action="/admin/login" style="width:100%;max-width:380px;background:var(--surf);
    border:1px solid var(--line);border-radius:22px;box-shadow:0 14px 34px oklch(27% 0.05 48 / .15);
    padding:36px 32px;display:flex;flex-direction:column;gap:18px;animation:mrdFadeIn .4s ease">
    <div style="display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center">
      <div style="width:52px;height:52px">${BRAND_MARK}</div>
      <div class="serif" style="font-size:32px;font-weight:700;line-height:1.1">My Rolling Day</div>
      <div class="eyebrow">Console d'administration</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px">
      <label for="pwd" style="font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:oklch(27% 0.05 48 / .55)">Mot de passe</label>
      <input id="pwd" name="password" type="password" class="inp" placeholder="••••••••" autocomplete="current-password" autofocus required>
    </div>
    ${error ? `<div class="small" style="color:oklch(45% 0.16 25);text-align:center">${error}</div>` : ""}
    <button type="submit" class="btn">Se connecter</button>
    <div class="small muted" style="text-align:center">Accès réservé à l'équipe My Rolling Day.</div>
  </form>
</div></body></html>`;
}

/** Console. Les vues sont rendues cote client depuis /admin/api/*. */
function consolePage() {
  return `<!doctype html><html lang="fr"><head>${HEAD}</head><body>
<div style="display:flex;min-height:100vh;align-items:stretch">
  <aside style="width:232px;flex:0 0 232px;background:var(--surf);border-right:1px solid var(--line);
    display:flex;flex-direction:column;gap:6px;padding:22px 14px;position:sticky;top:0;height:100vh">
    <div style="display:flex;align-items:center;gap:10px;padding:0 8px 16px">
      <div style="width:30px;height:30px;flex:0 0 30px">${BRAND_MARK}</div>
      <div>
        <div class="serif" style="font-size:19px;font-weight:700;line-height:1.05">My Rolling Day</div>
        <div style="font-size:10px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:var(--a)">Administration</div>
      </div>
    </div>
    <button class="nav on" data-view="dash">📊 Tableau de bord</button>
    <button class="nav" data-view="users">👥 Utilisateurs</button>
    <button class="nav" data-view="recipes">📖 Recettes</button>
    <div style="margin-top:auto;display:flex;flex-direction:column;gap:10px">
      <form method="POST" action="/admin/logout"><button type="submit" class="btn-ghost" style="width:100%">Se déconnecter</button></form>
      <div style="font-size:11.5px;color:oklch(27% 0.05 48 / .4);padding:0 4px">v0.1.0 beta · console interne</div>
    </div>
  </aside>

  <main style="flex:1;min-width:0">
    <div style="padding:28px clamp(16px,4vw,40px) 48px;max-width:1160px;margin:0 auto">
      <div id="view"><p class="muted">Chargement…</p></div>
    </div>
  </main>
</div>
<script>${clientScript()}</script>
</body></html>`;
}

function clientScript() {
  return `
const $ = (s, r) => (r || document).querySelector(s);
const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = new Intl.NumberFormat("fr-FR");
const dt = (ms) => ms ? new Date(ms).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—";

async function api(path, options) {
  const res = await fetch("/admin/api" + path, { credentials: "same-origin", ...options });
  if (res.status === 401) { location.href = "/admin"; return null; }
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

function setView(name) {
  document.querySelectorAll(".nav").forEach((b) => b.classList.toggle("on", b.dataset.view === name));
  ({ dash: renderDash, users: renderUsers, recipes: renderRecipes }[name] || renderDash)();
}
document.querySelectorAll(".nav").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));

// ── Tableau de bord ───────────────────────────────────────────────────────
async function renderDash() {
  const el = $("#view");
  el.innerHTML = '<p class="muted">Chargement…</p>';
  const d = await api("/dashboard");
  if (!d) return;
  const max = Math.max(1, ...d.users.signups.map((s) => s.count));
  const total = d.users.signups.reduce((s, b) => s + b.count, 0);
  const plat = d.devices.platforms;
  const pct = (n) => d.devices.total ? Math.round((n / d.devices.total) * 100) : 0;

  el.innerHTML = \`
    <h1 class="serif" style="font-size:30px;font-weight:700">Tableau de bord</h1>
    <p class="muted small" style="margin:4px 0 22px">Vue d'ensemble · \${dt(d.generatedAt)}</p>
    <div class="grid">
      <div class="card">
        <div class="eyebrow">Inscriptions par semaine</div>
        <div class="bars" style="margin:18px 0 26px">
          \${d.users.signups.map((s) => \`<div class="bar" style="height:\${Math.round((s.count / max) * 100)}%"
            title="\${s.count} compte(s)"><span>\${new Date(s.start).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}</span></div>\`).join("")}
        </div>
        <div class="small muted">\${d.users.signups.length} dernières semaines · +\${total} comptes · \${nf.format(d.users.total)} au total</div>
      </div>
      <div class="card">
        <div class="eyebrow">Répartition des appareils</div>
        <div style="margin:16px 0 10px;font-size:26px;font-weight:700">\${nf.format(d.devices.total)}</div>
        <div class="small muted">appareils enregistrés</div>
        <div style="margin-top:14px;display:flex;flex-direction:column;gap:6px">
          \${["ios", "android", "web", "inconnu"].filter((k) => plat[k]).map((k) =>
            \`<div class="small">\${({ ios: "iOS", android: "Android", web: "Web", inconnu: "Inconnu" })[k]} · \${pct(plat[k])} % <span class="muted">(\${plat[k]})</span></div>\`).join("")}
        </div>
      </div>
      <div class="card">
        <div class="eyebrow">Abonnements premium</div>
        <div style="margin:16px 0 6px;font-size:38px;font-weight:700;line-height:1">\${nf.format(d.families.premium)}</div>
        <div class="small muted">foyers · \${Math.round(d.families.premiumShare * 100)} % du parc</div>
        <div class="small muted" style="margin-top:10px">\${nf.format(d.families.total)} foyers au total</div>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="eyebrow">Derniers signalements</div>
      \${d.reports.length ? \`<table style="margin-top:12px"><thead><tr><th>Type</th><th>Message</th><th>Contact</th><th>Date</th></tr></thead><tbody>
        \${d.reports.map((r) => \`<tr><td><span class="pill" style="background:var(--aLt);color:var(--aDark)">\${
          ({ bug: "Bug", feature: "Idée", feedback: "Retour" })[r.kind] || r.kind}</span></td>
          <td>\${esc(r.message).slice(0, 140)}</td><td class="muted small">\${esc(r.email) || "—"}</td>
          <td class="muted small">\${dt(r.createdAt)}</td></tr>\`).join("")}
      </tbody></table>\` : '<p class="muted small" style="margin-top:12px">Aucun signalement.</p>'}
    </div>\`;
}

// ── Utilisateurs ──────────────────────────────────────────────────────────
async function renderUsers(search) {
  const el = $("#view");
  const q = search || "";
  const d = await api("/users?search=" + encodeURIComponent(q));
  if (!d) return;
  el.innerHTML = \`
    <h1 class="serif" style="font-size:30px;font-weight:700">Utilisateurs</h1>
    <p class="muted small" style="margin:4px 0 18px">\${nf.format(d.users.length)} compte(s) affiché(s)</p>
    <input id="q" class="inp" placeholder="Rechercher par nom ou e-mail…" value="\${esc(q)}" style="max-width:360px;margin-bottom:16px">
    <div class="card" style="padding:14px 10px">
      <table><thead><tr><th>Nom</th><th>E-mail</th><th>Inscrit le</th></tr></thead><tbody>
      \${d.users.map((u) => \`<tr class="row" data-uid="\${esc(u.uid)}"><td style="font-weight:600">\${esc(u.displayName) || "—"}</td>
        <td class="muted">\${esc(u.email)}</td><td class="muted small">\${dt(u.createdAt)}</td></tr>\`).join("")}
      </tbody></table>
      \${d.users.length ? "" : '<p class="muted small" style="padding:12px">Aucun résultat.</p>'}
    </div>\`;
  let timer;
  $("#q").addEventListener("input", (e) => {
    clearTimeout(timer);
    const v = e.target.value;
    timer = setTimeout(() => renderUsers(v).then(() => { const i = $("#q"); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } }), 250);
  });
  el.querySelectorAll("tr.row").forEach((tr) => tr.addEventListener("click", () => renderUserDetail(tr.dataset.uid)));
}

async function renderUserDetail(uid) {
  const el = $("#view");
  el.innerHTML = '<p class="muted">Chargement…</p>';
  const d = await api("/users/" + encodeURIComponent(uid));
  if (!d) return;
  if (!d.user) { el.innerHTML = '<p class="muted">Utilisateur introuvable.</p>'; return; }
  el.innerHTML = \`
    <button class="btn-ghost" id="back" style="margin-bottom:16px">← Retour aux utilisateurs</button>
    <h1 class="serif" style="font-size:28px;font-weight:700">\${esc(d.user.displayName) || "Sans nom"}</h1>
    <p class="muted small" style="margin:4px 0 20px">\${esc(d.user.email)} · inscrit le \${dt(d.user.createdAt)} · <code>\${esc(d.user.uid)}</code></p>
    \${d.families.map((f) => \`<div class="card" style="margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <h2 style="font-size:18px;font-weight:700">\${esc(f.name) || "Foyer sans nom"}</h2>
        \${f.premium ? '<span class="pill" style="background:oklch(89% 0.06 22);color:var(--aDark)">Premium</span>' : ""}
      </div>
      <div class="small muted" style="margin-top:4px">créé le \${dt(f.createdAt)}\${f.premiumProductId ? " · " + esc(f.premiumProductId) : ""}</div>
      <div class="grid" style="margin-top:16px">
        <div><div class="eyebrow">Membres du foyer</div><div style="margin-top:8px">\${
          f.members.map((m) => \`<div class="small">\${esc(m.uid)} <span class="muted">\${esc(m.role) || ""}</span></div>\`).join("") || '<span class="muted small">—</span>'}</div></div>
        <div><div class="eyebrow">Personnes</div><div style="margin-top:8px">\${
          f.people.map((p) => \`<div class="small">\${esc(p.name) || p.id}</div>\`).join("") || '<span class="muted small">—</span>'}</div></div>
        <div><div class="eyebrow">Appareils & notifications</div><div style="margin-top:8px">\${
          f.devices.map((x) => \`<div class="small">\${esc(x.platform)} · \${x.notificationsEnabled ? "notifs on" : "notifs off"} <span class="muted">\${dt(x.lastSeenAt)}</span></div>\`).join("") || '<span class="muted small">Aucun appareil</span>'}</div></div>
        <div><div class="eyebrow">Invitations en cours</div><div style="margin-top:8px">\${
          f.invitations.map((i) => \`<div class="small">\${esc(i.code)} <span class="muted">pour \${esc(i.memberName) || "?"}</span></div>\`).join("") || '<span class="muted small">Aucune invitation active.</span>'}</div></div>
      </div>
      <div style="margin-top:16px"><div class="eyebrow">Volume de données du foyer</div>
        <div class="small muted" style="margin-top:8px">\${nf.format(Math.round(f.volume.bytes / 1024))} Ko ·
          \${f.volume.tasks} tâches · \${f.volume.recipes} recettes · \${f.volume.agenda} événements ·
          \${f.volume.lists} listes · \${f.volume.inventory} articles</div></div>
    </div>\`).join("") || '<p class="muted">Cet utilisateur n\\'appartient à aucun foyer.</p>'}\`;
  $("#back").addEventListener("click", () => renderUsers());
}

// ── Recettes ──────────────────────────────────────────────────────────────
async function renderRecipes() {
  const el = $("#view");
  el.innerHTML = '<p class="muted">Chargement…</p>';
  const d = await api("/recipes");
  if (!d) return;
  el.innerHTML = \`
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div><h1 class="serif" style="font-size:30px;font-weight:700">Recettes du catalogue</h1>
        <p class="muted small" style="margin:4px 0 0">\${nf.format(d.recipes.length)} recette(s)</p></div>
      <div style="display:flex;gap:8px"><button class="btn-ghost" id="import">Importer depuis une URL</button></div>
    </div>
    <div class="card" style="margin-top:18px;padding:14px 10px">
      <table><thead><tr><th>Nom</th><th>Catégorie</th><th>Parts</th><th>Durée</th></tr></thead><tbody>
      \${d.recipes.map((r) => \`<tr><td style="font-weight:600">\${esc(r.name)}
        \${r.quick ? '<span class="pill" style="background:var(--aLt);color:var(--aDark);margin-left:6px">Express</span>' : ""}</td>
        <td class="muted">\${esc(r.category) || "—"}</td><td class="muted">\${r.servings || "—"}</td>
        <td class="muted small">\${(Number(r.prepTime) || 0) + (Number(r.cookTime) || 0) || "—"} min</td></tr>\`).join("")}
      </tbody></table>
      \${d.recipes.length ? "" : '<p class="muted small" style="padding:12px">Le catalogue est vide. Importe une première recette depuis une URL.</p>'}
    </div>
    <div id="importBox" class="card hidden" style="margin-top:16px">
      <div class="eyebrow">Importer une recette</div>
      <p class="small muted" style="margin:8px 0 14px">Colle le lien d'une page recette : elle sera extraite puis catégorisée automatiquement, comme dans l'app.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <input id="url" class="inp" placeholder="https://…" style="flex:1;min-width:260px">
        <button class="btn" id="go">Analyser la page</button>
      </div>
      <div id="importMsg" class="small muted" style="margin-top:12px"></div>
    </div>\`;
  $("#import").addEventListener("click", () => $("#importBox").classList.toggle("hidden"));
  $("#go").addEventListener("click", async () => {
    const url = $("#url").value.trim();
    const msg = $("#importMsg");
    if (!url) { msg.textContent = "Colle d'abord un lien."; return; }
    msg.textContent = "Extraction en cours…";
    try {
      const r = await api("/recipes/import", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }),
      });
      msg.textContent = r && r.ok ? "Recette importée : " + r.name : "L'import n'a rien renvoyé.";
      if (r && r.ok) setTimeout(renderRecipes, 800);
    } catch (e) { msg.textContent = "Échec de l'import. Vérifie le lien."; }
  });
}

setView("dash");
`;
}

module.exports = { loginPage, consolePage, CSS, BRAND_MARK };
