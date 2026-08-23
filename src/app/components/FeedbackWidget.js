import { html, useState } from "../lib.js";
import { sendTesterFeedback } from "../providers/client.js";
import { MrdModal } from "./MrdModal.js";

export function FeedbackWidget({ user, currentPage = "" }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | done | error
  const [errorMsg, setErrorMsg] = useState("");

  function handleOpen() {
    setOpen(true);
    setStatus("idle");
    setErrorMsg("");
    setMessage("");
  }

  function handleClose() {
    if (status === "sending") return;
    setOpen(false);
    setMessage("");
    setStatus("idle");
    setErrorMsg("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!message.trim() || status === "sending") return;
    setStatus("sending");
    setErrorMsg("");
    try {
      await sendTesterFeedback({
        message,
        page: currentPage,
        userId: user?.uid || "",
      });
      setStatus("done");
      setTimeout(() => {
        setOpen(false);
        setMessage("");
        setStatus("idle");
      }, 2200);
    } catch (err) {
      setErrorMsg(err?.message || "Erreur lors de l'envoi.");
      setStatus("error");
    }
  }

  return html`
    <div className="fb-root">
      <button
        className="fb-tab"
        onClick=${handleOpen}
        aria-label="Signaler un problème"
        title="Signaler un problème"
      >
        🐛
      </button>

      ${open ? html`
        <${MrdModal} isOpen=${true} onClose=${handleClose} className="fb-panel">

            <div className="fb-panel-head">
              <span className="fb-panel-title">Signaler un problème</span>
              <button className="fb-panel-close" onClick=${handleClose} aria-label="Fermer">✕</button>
            </div>

            ${currentPage ? html`
              <div className="fb-panel-meta">📍 ${currentPage}</div>
            ` : null}

            <form onSubmit=${handleSubmit}>
              <textarea
                className="fb-panel-textarea"
                placeholder="Décris le problème : ce que tu faisais, ce qui s'est passé, ce qui était attendu…"
                value=${message}
                onInput=${(e) => setMessage(e.target.value)}
                rows="5"
                disabled=${status === "sending" || status === "done"}
                autofocus
              />

              ${status === "error" ? html`
                <div className="fb-panel-error">${errorMsg}</div>
              ` : null}

              ${status === "done" ? html`
                <div className="fb-panel-success">✓ Merci, c'est bien envoyé !</div>
              ` : null}

              <button
                type="submit"
                className="fb-panel-send"
                disabled=${!message.trim() || status === "sending" || status === "done"}
              >
                ${status === "sending" ? "Envoi en cours…"
                  : status === "done" ? "Envoyé ✓"
                  : "Envoyer"}
              </button>
            </form>
        <//>
      ` : null}
    </div>
  `;
}
