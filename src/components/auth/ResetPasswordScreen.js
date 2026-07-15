import { html, useEffect, useState } from "../../lib.js";
import { confirmReset, verifyResetCode } from "../../firebase/client.js";
import { formatAuthError } from "../../firebase/core.js";

export function ResetPasswordScreen({ oobCode }) {
  const [status, setStatus] = useState("verifying");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!oobCode) {
      setStatus("invalid");
      setError("Lien de réinitialisation invalide.");
      return;
    }
    verifyResetCode(oobCode)
      .then((resolvedEmail) => {
        if (cancelled) return;
        setEmail(resolvedEmail || "");
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(formatAuthError(err));
        setStatus("invalid");
      });
    return () => {
      cancelled = true;
    };
  }, [oobCode]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (String(password || "").length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    try {
      setBusy(true);
      setError("");
      await confirmReset(oobCode, password);
      setStatus("done");
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  if (status === "verifying") {
    return html`
      <div className="auth-screen auth-shell">
        <div className="auth-card">
          <h1 className="auth-title">Vérification du lien…</h1>
        </div>
      </div>
    `;
  }

  if (status === "invalid") {
    return html`
      <div className="auth-screen auth-shell">
        <div className="auth-card">
          <h1 className="auth-title">Lien invalide</h1>
          <div className="error-box">${error}</div>
          <p className="auth-subtitle mini">Redemande un e-mail de réinitialisation depuis l'écran de connexion de l'application.</p>
        </div>
      </div>
    `;
  }

  if (status === "done") {
    return html`
      <div className="auth-screen auth-shell">
        <div className="auth-card">
          <h1 className="auth-title">Mot de passe modifié</h1>
          <p className="auth-subtitle mini">Tu peux maintenant retourner dans l'application My Rolling Day et te connecter avec ton nouveau mot de passe.</p>
        </div>
      </div>
    `;
  }

  return html`
    <div className="auth-screen auth-shell">
      <div className="auth-card">
        <h1 className="auth-title">Choisis un nouveau mot de passe</h1>
        <p className="auth-subtitle mini">${email}</p>

        <form className="auth-form aform" onSubmit=${handleSubmit}>
          <input
            className="auth-input ainp"
            type="password"
            placeholder="Nouveau mot de passe"
            value=${password}
            onInput=${(event) => { setError(""); setPassword(event.target.value); }}
            autocomplete="new-password"
          />
          <input
            className="auth-input ainp"
            type="password"
            placeholder="Confirme le mot de passe"
            value=${confirmPassword}
            onInput=${(event) => { setError(""); setConfirmPassword(event.target.value); }}
            autocomplete="new-password"
          />
          <button className="auth-button auth-button-primary aok" type="submit" disabled=${busy}>
            ${busy ? "Validation..." : "Valider le nouveau mot de passe"}
          </button>
        </form>

        ${error ? html`<div className="error-box">${error}</div>` : null}
      </div>
    </div>
  `;
}
