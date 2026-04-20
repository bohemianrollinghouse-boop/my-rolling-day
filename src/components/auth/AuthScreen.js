import { html, useState } from "../../lib.js";

export function AuthScreen({ errorMessage, infoMessage, loading, onEmailLogin, onEmailSignup, onGoogleLogin, onForgotPassword, onJoinWithCode, onGoogleJoin }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({
    displayName: "",
    email: "",
    password: "",
    code: "",
  });

  function submit(event) {
    event.preventDefault();
    if (mode === "join") {
      onJoinWithCode && onJoinWithCode({ ...form, mode: "login" });
    } else if (mode === "join-signup") {
      onJoinWithCode && onJoinWithCode({ ...form, mode: "signup" });
    } else if (mode === "signup") {
      onEmailSignup(form);
    } else {
      onEmailLogin(form);
    }
  }

  const isJoinMode = mode === "join" || mode === "join-signup";

  return html`
    <div className="auth-shell">
      <div className="auth-card">
        <div className="hdr-sub">My Rolling Day</div>
        <h1 className="auth-title">Connexion</h1>
        <p className="mini">Connecte-toi pour retrouver ton planning, ta famille et tes données.</p>
        ${infoMessage ? html`<div className="ncard"><div className="mini">${infoMessage}</div></div>` : null}

        <div className="segmented">
          <button className=${`seg-btn ${mode === "login" ? "on" : ""}`} onClick=${() => setMode("login")}>Se connecter</button>
          <button className=${`seg-btn ${mode === "signup" ? "on" : ""}`} onClick=${() => setMode("signup")}>Créer un compte</button>
          <button className=${`seg-btn ${isJoinMode ? "on" : ""}`} onClick=${() => setMode("join")}>Rejoindre un foyer</button>
        </div>

        <form className="aform" onSubmit=${submit}>
          ${isJoinMode
            ? html`
                <input
                  className="ainp"
                  placeholder="Code d’invitation (ex. : AB12CD34)"
                  value=${form.code}
                  onInput=${(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
                  style=${{ letterSpacing: "2px", fontWeight: "bold" }}
                />
                <div className="segmented" style=${{ marginBottom: "8px" }}>
                  <button type="button" className=${`seg-btn ${mode === "join" ? "on" : ""}`} onClick=${() => setMode("join")}>J’ai déjà un compte</button>
                  <button type="button" className=${`seg-btn ${mode === "join-signup" ? "on" : ""}`} onClick=${() => setMode("join-signup")}>Créer un compte</button>
                </div>
                ${mode === "join-signup"
                  ? html`<input
                      className="ainp"
                      placeholder="Ton prénom ou pseudo"
                      value=${form.displayName}
                      onInput=${(event) => setForm({ ...form, displayName: event.target.value })}
                    />`
                  : null}
              `
            : mode === "signup"
              ? html`
                  <input
                    className="ainp"
                    placeholder="Ton prénom ou pseudo"
                    value=${form.displayName}
                    onInput=${(event) => setForm({ ...form, displayName: event.target.value })}
                  />
                `
              : null}

          ${!isJoinMode || mode === "join" || mode === "join-signup"
            ? html`
                <input
                  className="ainp"
                  type="email"
                  placeholder="Email"
                  value=${form.email}
                  onInput=${(event) => setForm({ ...form, email: event.target.value })}
                />
                <input
                  className="ainp"
                  type="password"
                  placeholder="Mot de passe"
                  value=${form.password}
                  onInput=${(event) => setForm({ ...form, password: event.target.value })}
                />
              `
            : null}

          <button className="aok" type="submit" disabled=${loading}>
            ${loading
              ? "Patiente..."
              : isJoinMode
                ? "Se connecter et rejoindre"
                : mode === "signup"
                  ? "Créer mon compte"
                  : "Se connecter"}
          </button>
          ${mode === "login"
            ? html`<button
                type="button"
                style=${{ marginTop: "6px", fontSize: "13px", color: "var(--accent, #666)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                onClick=${() => onForgotPassword && onForgotPassword(form.email)}
                disabled=${loading}
              >Mot de passe oublié ?</button>`
            : null}
        </form>

        <button className="google-btn" onClick=${() => isJoinMode && form.code ? onGoogleJoin && onGoogleJoin(form.code) : onGoogleLogin && onGoogleLogin()} disabled=${loading}>
          ${isJoinMode ? "Google et rejoindre" : "Continuer avec Google"}
        </button>

        ${errorMessage ? html`<div className="error-box">${errorMessage}</div>` : null}
      </div>
    </div>
  `;
}
