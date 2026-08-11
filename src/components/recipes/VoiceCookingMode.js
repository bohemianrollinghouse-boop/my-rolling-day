import { html, useEffect, useRef, useState } from "../../lib.js";
import { createPortal } from "react-dom";
import { TextToSpeech } from "@capacitor-community/text-to-speech";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { KeepAwake } from "@capacitor-community/keep-awake";
import { Capacitor } from "@capacitor/core";

/* ── Découpage de la préparation en étapes ─────────────────────
   Formats gérés : liste numérotée ("1. …"), paragraphes séparés
   par une ligne vide, sinon une étape par ligne. */
export function parseMethodSteps(method) {
  const text = String(method || "").trim();
  if (!text) return [];
  const numbered = text
    .split(/\n\s*(?=\d+\s*[.)–-]\s+)/)
    .map((chunk) => chunk.replace(/^\d+\s*[.)–-]\s+/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (numbered.length > 1) return numbered;
  const paragraphs = text.split(/\n{2,}/).map((chunk) => chunk.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (paragraphs.length > 1) return paragraphs;
  return text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
}

/* ── Commandes vocales ─────────────────────────────────────────
   Le matching se fait sur le texte normalisé (minuscules, sans
   accents ni apostrophes) : la reconnaissance est approximative,
   on reste tolérant. Les groupes spécifiques (répète, précédent,
   stop) sont testés avant "next" qui contient des mots fréquents. */
const COMMANDS = [
  { action: "repeat", phrases: ["repete", "repette", "repeter", "redis", "relis", "encore une fois"] },
  { action: "prev",   phrases: ["precedent", "precedente", "reviens", "en arriere", "retour"] },
  { action: "stop",   phrases: ["stop", "arrete", "quitte", "termine", "terminer", "fini", "au revoir"] },
  { action: "next",   phrases: ["suivant", "suivante", "cest bon", "c est bon", "ok", "okay", "oque", "continue", "continuer", "vas y", "daccord", "d accord", "next"] },
];

function normalizeTranscript(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchVoiceCommand(transcript) {
  const text = ` ${normalizeTranscript(transcript)} `;
  if (!text.trim()) return null;
  for (const group of COMMANDS) {
    if (group.phrases.some((phrase) => text.includes(` ${phrase} `) || text.trim() === phrase)) return group.action;
  }
  return null;
}

/* ── Choix de la voix française ────────────────────────────────
   On ne remplace la voix système par défaut QUE si une voix
   clairement supérieure est installée : "améliorée"/"premium" sur
   iOS (à télécharger dans Réglages > Accessibilité > Contenu
   énoncé > Voix), neurale/naturelle ailleurs. Surtout ne jamais
   prendre une simple voix fr-FR au hasard : iOS en liste des
   fantaisistes (Eddy, Jacques…) bien pires que le défaut. */
export function pickBestFrenchVoiceIndex(voices) {
  let bestIndex = -1;
  let bestScore = 0;
  (Array.isArray(voices) ? voices : []).forEach((voice, index) => {
    const lang = String(voice?.lang || "").toLowerCase().replace("_", "-");
    if (!lang.startsWith("fr")) return;
    const uri = String(voice?.voiceURI || "").toLowerCase();
    const name = String(voice?.name || "").toLowerCase();
    let quality = 0;
    if (uri.includes("premium") || name.includes("premium")) quality = 3;
    else if (uri.includes("enhanced") || name.includes("amélioré") || name.includes("ameliore")) quality = 2;
    else if (name.includes("natural") || name.includes("neural")) quality = 1;
    if (!quality) return; // rien de mieux que le défaut système → on n'y touche pas
    const score = quality * 10 + (lang === "fr-fr" ? 5 : 0);
    if (score > bestScore) { bestScore = score; bestIndex = index; }
  });
  return bestIndex;
}

const isNative = Capacitor.isNativePlatform();

/* Reconnaissance web (dev navigateur) : webkitSpeechRecognition. */
function createWebRecognizer() {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.lang = "fr-FR";
  recognition.continuous = true;
  recognition.interimResults = true;
  return recognition;
}

/* ── Son de validation de commande (fin d'écoute) ──────────────
   Deux notes sinusoïdales ascendantes générées en Web Audio :
   pas d'asset à embarquer, volume discret. */
let ackAudioCtx = null;
function playAckChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!ackAudioCtx) ackAudioCtx = new Ctx();
    if (ackAudioCtx.state === "suspended") ackAudioCtx.resume();
    const now = ackAudioCtx.currentTime;
    for (const [freq, start] of [[880, 0], [1318.5, 0.12]]) {
      const osc = ackAudioCtx.createOscillator();
      const gain = ackAudioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.2, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + 0.3);
      osc.connect(gain);
      gain.connect(ackAudioCtx.destination);
      osc.start(now + start);
      osc.stop(now + start + 0.32);
    }
  } catch (_) {}
}

/* Délai entre la détection d'un mot-clé et la reprise de la voix. */
const ACK_DELAY_MS = 550;

export function VoiceCookingMode({ recipe, onClose }) {
  const steps = parseMethodSteps(recipe?.method);
  const [stepIndex, setStepIndex] = useState(0);
  // status : init | speaking | listening | ack | done | manual
  const [status, setStatus] = useState("init");
  const [voiceAvailable, setVoiceAvailable] = useState(true);
  const [heard, setHeard] = useState("");

  // sessionRef invalide les callbacks async d'une phase précédente
  // (TTS terminé après fermeture, résultat micro après tap manuel…)
  const sessionRef = useRef(0);
  const statusRef = useRef("init");
  const handledRef = useRef(false);
  const webRecognizerRef = useRef(null);
  const listenersRef = useRef([]);
  const stepIndexRef = useRef(0);
  const voiceAvailableRef = useRef(true);
  const voiceIndexRef = useRef(-1);

  function setPhase(next) {
    statusRef.current = next;
    setStatus(next);
  }

  async function stopListening() {
    handledRef.current = true;
    if (isNative) {
      try { await SpeechRecognition.stop(); } catch (_) {}
    } else if (webRecognizerRef.current) {
      try { webRecognizerRef.current.onend = null; webRecognizerRef.current.stop(); } catch (_) {}
      webRecognizerRef.current = null;
    }
  }

  async function stopSpeaking() {
    try { await TextToSpeech.stop(); } catch (_) {}
  }

  function speakOptions(text) {
    const options = { text, lang: "fr-FR", rate: 0.95, category: "playback" };
    if (voiceIndexRef.current >= 0) options.voice = voiceIndexRef.current;
    return options;
  }

  function handleCommand(action) {
    if (action === "next") {
      const current = stepIndexRef.current;
      if (current >= steps.length - 1) finish();
      else goToStep(current + 1);
    } else if (action === "repeat") {
      goToStep(stepIndexRef.current);
    } else if (action === "prev") {
      goToStep(Math.max(0, stepIndexRef.current - 1));
    } else if (action === "stop") {
      exit();
    }
  }

  function onTranscript(matches) {
    if (handledRef.current || statusRef.current !== "listening") return;
    const list = Array.isArray(matches) ? matches : [matches];
    for (const candidate of list) {
      const action = matchVoiceCommand(candidate);
      if (action) {
        handledRef.current = true;
        setHeard(String(candidate));
        stopListening();
        // Signal de validation : petit carillon + pause avant la voix,
        // pour que la commande ne "coupe" pas brutalement l'écoute.
        setPhase("ack");
        playAckChime();
        const session = sessionRef.current;
        setTimeout(() => {
          if (session === sessionRef.current && statusRef.current === "ack") handleCommand(action);
        }, ACK_DELAY_MS);
        return;
      }
    }
  }

  async function startListening(session) {
    if (session !== sessionRef.current || !voiceAvailableRef.current) return;
    handledRef.current = false;
    setPhase("listening");
    if (isNative) {
      try {
        // partialResults : on réagit dès qu'un mot-clé est reconnu.
        // iOS coupe l'écoute après ~1 min de silence : listeningState
        // "stopped" sans commande matchée → on relance (cf. listener).
        await SpeechRecognition.start({ language: "fr-FR", partialResults: true, popup: false });
      } catch (_) {
        if (session === sessionRef.current && statusRef.current === "listening" && !handledRef.current) {
          setTimeout(() => startListening(session), 800);
        }
      }
    } else {
      const recognition = createWebRecognizer();
      if (!recognition) { setVoiceUnavailable(); return; }
      webRecognizerRef.current = recognition;
      recognition.onresult = (event) => {
        const matches = [];
        for (let i = event.resultIndex; i < event.results.length; i += 1) matches.push(event.results[i][0].transcript);
        onTranscript(matches);
      };
      recognition.onend = () => {
        if (session === sessionRef.current && statusRef.current === "listening" && !handledRef.current) {
          setTimeout(() => { if (session === sessionRef.current && statusRef.current === "listening") startListening(session); }, 400);
        }
      };
      try { recognition.start(); } catch (_) {}
    }
  }

  async function speakThenListen(text, session) {
    await stopListening();
    if (session !== sessionRef.current) return;
    setPhase("speaking");
    try {
      await TextToSpeech.speak(speakOptions(text));
    } catch (_) {}
    if (session !== sessionRef.current) return;
    if (voiceAvailableRef.current) startListening(session);
    else setPhase("manual");
  }

  function setVoiceUnavailable() {
    voiceAvailableRef.current = false;
    setVoiceAvailable(false);
    if (statusRef.current === "listening" || statusRef.current === "init") setPhase("manual");
  }

  function goToStep(index, { announceIntro = false } = {}) {
    const session = ++sessionRef.current;
    stepIndexRef.current = index;
    setStepIndex(index);
    setHeard("");
    const intro = announceIntro
      ? `${recipe?.name || "Recette"}. ${steps.length} étape${steps.length > 1 ? "s" : ""}. `
      : "";
    const suffix = voiceAvailableRef.current ? (index === steps.length - 1 ? " C'est la dernière étape. Dis stop quand tu as terminé." : "") : "";
    speakThenListen(`${intro}Étape ${index + 1}. ${steps[index]}.${suffix}`, session);
  }

  function finish() {
    sessionRef.current += 1;
    setPhase("done");
    stopListening();
    (async () => {
      try { await TextToSpeech.speak(speakOptions("C'était la dernière étape. Bon appétit !")); } catch (_) {}
    })();
  }

  function exit() {
    sessionRef.current += 1;
    stopListening();
    stopSpeaking();
    onClose?.();
  }

  /* ── Démarrage : permissions puis lecture de l'étape 1 ──────── */
  useEffect(() => {
    let cancelled = false;
    KeepAwake.keepAwake().catch(() => {});

    (async () => {
      if (!steps.length) return;
      // Meilleure voix française disponible (améliorée/premium si téléchargée)
      try {
        const { voices } = await TextToSpeech.getSupportedVoices();
        voiceIndexRef.current = pickBestFrenchVoiceIndex(voices);
      } catch (_) {}
      if (isNative) {
        try {
          const { available } = await SpeechRecognition.available();
          if (!available) throw new Error("unavailable");
          const perm = await SpeechRecognition.requestPermissions();
          if (perm.speechRecognition !== "granted") throw new Error("denied");
          const partial = await SpeechRecognition.addListener("partialResults", (data) => onTranscript(data?.matches || []));
          // iOS/Android arrêtent l'écoute d'eux-mêmes (silence ~1 min) :
          // on relance tant qu'aucune commande n'a été reconnue.
          const state = await SpeechRecognition.addListener("listeningState", (data) => {
            if (data?.status === "stopped" && statusRef.current === "listening" && !handledRef.current) {
              const session = sessionRef.current;
              setTimeout(() => { if (session === sessionRef.current && statusRef.current === "listening" && !handledRef.current) startListening(session); }, 500);
            }
          });
          listenersRef.current = [partial, state];
        } catch (_) {
          if (!cancelled) setVoiceUnavailable();
        }
      } else if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) {
        setVoiceUnavailable();
      }
      if (!cancelled) goToStep(0, { announceIntro: true });
    })();

    return () => {
      cancelled = true;
      sessionRef.current += 1;
      stopListening();
      stopSpeaking();
      for (const listener of listenersRef.current) { try { listener.remove(); } catch (_) {} }
      listenersRef.current = [];
      if (isNative) { try { SpeechRecognition.removeAllListeners(); } catch (_) {} }
      KeepAwake.allowSleep().catch(() => {});
    };
  }, []);

  if (!steps.length) {
    return createPortal(html`
      <div className="voice-cook-overlay">
        <div className="voice-cook-empty">
          <div className="voice-cook-empty-emoji">🎙</div>
          <p>Aucune étape de préparation renseignée pour cette recette.</p>
          <button type="button" className="aok" onClick=${exit}>Fermer</button>
        </div>
      </div>
    `, document.body);
  }

  const isDone = status === "done";
  const isVeiled = status === "listening" || status === "ack";
  const statusLabel = isDone
    ? "Recette terminée — bon appétit ! 🎉"
    : status === "speaking"
      ? "Lecture de l'étape…"
      : status === "manual"
        ? "Commandes vocales indisponibles — utilise les boutons"
        : status === "ack"
          ? "Commande reçue ✓"
          : status === "listening"
            ? "Écoute en cours…"
            : "Préparation…";

  /* Voile d'écoute : logo animé du splash (anneau pointillé + cercle
     + point orbital) au centre, sur fond flouté. */
  const listenVeil = html`
    <div className="voice-listen-veil" aria-live="polite">
      <div className="voice-listen-center">
        <div className="voice-listen-mark">
          <svg viewBox="0 0 96 96" width="132" height="132" fill="none">
            <circle className="voice-listen-ring" cx="48" cy="48" r="34" stroke="#B85F4A" stroke-width="3" stroke-linecap="round" stroke-dasharray="4 8" opacity="0.55"/>
            <circle className="voice-listen-inner" cx="48" cy="48" r="22" stroke="#B85F4A" stroke-width="3" stroke-linecap="round"/>
            <circle className="voice-listen-dot" cx="48" cy="14" r="5" fill="#B85F4A"/>
          </svg>
          <span className="voice-listen-mic">${status === "ack" ? "✓" : "🎙"}</span>
        </div>
        <div className="voice-listen-label">${status === "ack" ? "C'est noté !" : "Je t'écoute…"}</div>
        ${status === "ack" && heard
          ? html`<div className="voice-listen-heard">« ${heard} »</div>`
          : html`<div className="voice-listen-hint">« suivant » · « répète » · « précédent » · « stop »</div>`}
      </div>
    </div>
  `;

  return createPortal(html`
    <div className="voice-cook-overlay">
      <header className="voice-cook-header">
        <span className="voice-cook-title">${recipe?.name || "Recette"}</span>
        <button type="button" className="voice-cook-close" onClick=${exit} aria-label="Quitter le mode cuisine">✕</button>
      </header>

      <div className="voice-cook-progress">
        ${steps.map((_, i) => html`<span key=${i} className=${`voice-cook-dot ${i < stepIndex || isDone ? "past" : ""} ${i === stepIndex && !isDone ? "on" : ""}`}></span>`)}
      </div>

      <div className="voice-cook-body">
        <div className="voice-cook-step-count">${isDone ? "Terminé" : `Étape ${stepIndex + 1} / ${steps.length}`}</div>
        <p className="voice-cook-step-text">${isDone ? "Bon appétit ! 🍽" : steps[stepIndex]}</p>
      </div>

      <div className=${`voice-cook-status voice-cook-status--${status}`}>
        <span className="voice-cook-status-icon">${isDone ? "✅" : status === "speaking" ? "🔊" : status === "ack" ? "✓" : status === "manual" ? "⏸" : "🎙"}</span>
        <span>${statusLabel}</span>
      </div>

      ${isVeiled ? listenVeil : null}

      <footer className="voice-cook-controls">
        ${isDone ? html`
          <button type="button" className="voice-cook-btn" onClick=${() => goToStep(steps.length - 1)}>↺ Dernière étape</button>
          <button type="button" className="voice-cook-btn voice-cook-btn--main" onClick=${exit}>Fermer</button>
        ` : html`
          <button type="button" className="voice-cook-btn" disabled=${stepIndex === 0} onClick=${() => goToStep(Math.max(0, stepIndex - 1))}>◀ Précédent</button>
          <button type="button" className="voice-cook-btn" onClick=${() => goToStep(stepIndex)}>🔁 Répéter</button>
          <button type="button" className="voice-cook-btn voice-cook-btn--main" onClick=${() => (stepIndex >= steps.length - 1 ? finish() : goToStep(stepIndex + 1))}>
            ${stepIndex >= steps.length - 1 ? "Terminer ✓" : "Suivant ▶"}
          </button>
        `}
      </footer>
    </div>
  `, document.body);
}
