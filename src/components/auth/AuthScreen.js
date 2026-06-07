import { html, useEffect, useState } from "../../lib.js";

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

export function AuthScreen({
  initialPage = "welcome",
  errorMessage = "",
  loading = false,
  onEmailLogin,
  onEmailSignup,
  onGoogleLogin,
  onForgotPassword,
}) {
  const [page, setPage] = useState(initialPage || "welcome");
  const [form, setForm] = useState({ email: "", password: "" });
  const [clientError, setClientError] = useState("");

  useEffect(() => {
    setPage(initialPage || "welcome");
    setClientError("");
  }, [initialPage]);

  function setField(key) {
    return (event) => {
      setClientError("");
      setForm((current) => ({ ...current, [key]: event.target.value }));
    };
  }

  function switchPage(nextPage) {
    setClientError("");
    setPage(nextPage);
  }

  function validateAuthForm() {
    if (!isValidEmail(form.email)) {
      return "Entre une adresse e-mail valide.";
    }
    if (String(form.password || "").length < 6) {
      return "Le mot de passe doit contenir au moins 6 caracteres.";
    }
    return "";
  }

  function submitLogin(event) {
    event.preventDefault();
    const validationMessage = validateAuthForm();
    if (validationMessage) {
      setClientError(validationMessage);
      return;
    }
    onEmailLogin?.(form);
  }

  function submitSignup(event) {
    event.preventDefault();
    const validationMessage = validateAuthForm();
    if (validationMessage) {
      setClientError(validationMessage);
      return;
    }
    onEmailSignup?.(form);
  }

  const visibleError = clientError || errorMessage;

  if (page === "welcome") {
    return html`
      <div className="auth-screen auth-shell">
        <div className="auth-welcome-card">
          <div className="auth-welcome-brand">
            <div className="auth-welcome-logo">
              <img src="./src/assets/brand/mark.svg" width="96" height="96" alt="My Rolling Day" style=${{ display: "block" }} />
            </div>
            <div className="auth-welcome-appname">My Rolling Day</div>
            <h1 className="auth-welcome-title-cocon">
              Le quotidien<br/>
              <em className="auth-welcome-em">en douceur.</em>
            </h1>
            <p className="auth-welcome-sub">Repas, courses, tâches et calendrier — partagés avec ton foyer.</p>
          </div>

          ${visibleError ? html`<div className="error-box">${visibleError}</div>` : null}

          <div className="auth-welcome-actions">
            <button className="auth-button auth-button-primary auth-cta-primary" onClick=${() => switchPage("signup")}>
              Créer un compte
            </button>
            <button className="auth-button auth-button-secondary auth-cta-secondary" onClick=${() => switchPage("login")}>
              J'ai déjà un compte
            </button>
            <div className="auth-divider"><span>ou</span></div>
            <button className="google-btn auth-button auth-button-secondary" onClick=${() => onGoogleLogin?.()} disabled=${loading}>
              <svg width="18" height="18" viewBox="0 0 24 24" style=${{ flexShrink: 0 }}>
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Continuer avec Google
            </button>
          </div>
        </div>
      </div>
    `;
  }

  if (page === "login") {
    return html`
      <div className="auth-screen auth-shell">
        <div className="auth-card">
          <button className="auth-back" onClick=${() => switchPage("welcome")}>← Retour</button>
          <h1 className="auth-title">Content de te revoir</h1>
          <p className="auth-subtitle mini">Connecte-toi pour retrouver ton foyer.</p>

          <form className="auth-form aform" onSubmit=${submitLogin}>
            <input
              className="auth-input ainp"
              type="email"
              placeholder="Email"
              value=${form.email}
              onInput=${setField("email")}
              autocomplete="email"
            />
            <input
              className="auth-input ainp"
              type="password"
              placeholder="Mot de passe"
              value=${form.password}
              onInput=${setField("password")}
              autocomplete="current-password"
            />
            <button className="auth-button auth-button-primary aok" type="submit" disabled=${loading}>
              ${loading ? "Connexion..." : "Se connecter"}
            </button>
            <button
              type="button"
              className="auth-forgot"
              onClick=${() => onForgotPassword?.(form.email)}
              disabled=${loading}
            >
              Mot de passe oublie ?
            </button>
          </form>

          <div className="auth-divider"><span>ou</span></div>
          <button className="google-btn auth-button auth-button-secondary" onClick=${() => onGoogleLogin?.()} disabled=${loading}>
            <svg width="18" height="18" viewBox="0 0 24 24" style=${{ flexShrink: 0 }}>
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continuer avec Google
          </button>

          ${visibleError ? html`<div className="error-box">${visibleError}</div>` : null}

          <p className="auth-switch">
            Pas encore de compte ? <button className="auth-switch-link" onClick=${() => switchPage("signup")}>Creer un compte</button>
          </p>
        </div>
      </div>
    `;
  }

  return html`
    <div className="auth-screen auth-shell">
      <div className="auth-card">
        <button className="auth-back" onClick=${() => switchPage("welcome")}>← Retour</button>
        <h1 className="auth-title">Bienvenue chez nous</h1>
        <p className="auth-subtitle mini">Crée ton compte, puis on configure ton foyer.</p>

        <form className="auth-form aform" onSubmit=${submitSignup}>
          <input
            className="auth-input ainp"
            type="email"
            placeholder="Email"
            value=${form.email}
            onInput=${setField("email")}
            autocomplete="email"
          />
          <input
            className="auth-input ainp"
            type="password"
            placeholder="Mot de passe"
            value=${form.password}
            onInput=${setField("password")}
            autocomplete="new-password"
          />
          <button className="auth-button auth-button-primary aok" type="submit" disabled=${loading}>
            ${loading ? "Creation..." : "Creer mon compte"}
          </button>
        </form>

        <div className="auth-divider"><span>ou</span></div>
        <button className="google-btn auth-button auth-button-secondary" onClick=${() => onGoogleLogin?.()} disabled=${loading}>
          <svg width="18" height="18" viewBox="0 0 24 24" style=${{ flexShrink: 0 }}>
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Continuer avec Google
        </button>

        ${visibleError ? html`<div className="error-box">${visibleError}</div>` : null}

        <p className="auth-switch">
          Deja un compte ? <button className="auth-switch-link" onClick=${() => switchPage("login")}>Se connecter</button>
        </p>
      </div>
    </div>
  `;
}
