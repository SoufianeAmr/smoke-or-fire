// "Listen": reads the screen's own strings aloud with the browser's built-in speech (speechSynthesis), in the app's
// language. It never starts by itself; tap again to stop. Hidden when the browser can't speak.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useApp, useT } from "../app/state";
import { SpeakerIcon, StopIcon } from "../components/icons";
import { LOCALE, pickVoice } from "./speech";

// Outlined navy, as the other secondary buttons: red stays for Call 911. White inside, so it also reads on a red screen.
const OUTLINED: CSSProperties = { minHeight: "56px", display: "flex", alignItems: "center", gap: "6px", padding: "0 12px 0 10px", borderRadius: "18px", border: "2px solid #1B2A4A", background: "#FFFFFF", color: "#1B2A4A", fontFamily: "inherit", fontSize: "18px", fontWeight: "700", lineHeight: "1.2", cursor: "pointer" };

export const canSpeak = () => typeof window !== "undefined" && !!window.speechSynthesis && typeof window.SpeechSynthesisUtterance === "function";

/** `parts` are read in order, one utterance each (a long single utterance can stop partway in some browsers). */
export function ListenButton({ parts, style }: { parts: string[]; style?: CSSProperties }) {
  const { lang } = useApp();
  const t = useT();
  const [supported] = useState(canSpeak);
  const [speaking, setSpeaking] = useState(false);
  const run = useRef(0); // the current reading; events from a stopped one are ignored

  const stop = useCallback(() => {
    run.current++;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);
  // Leaving the screen or switching language stops the reading: what was queued is for the old screen or language.
  useEffect(() => (supported ? stop : undefined), [supported, stop, lang]);
  // Some browsers load their voices on first ask.
  useEffect(() => { if (supported) window.speechSynthesis.getVoices(); }, [supported]);
  // Tapping Call 911 (or any phone number) stops the reading, so it never talks over a call; so does leaving the
  // page for the dialer or another tab.
  useEffect(() => {
    if (!speaking) return;
    const onClick = (e: MouseEvent) => { if (e.target instanceof Element && e.target.closest('a[href^="tel:"]')) stop(); };
    const onHidden = () => { if (document.visibilityState === "hidden") stop(); };
    document.addEventListener("click", onClick, true);
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", stop);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", stop);
    };
  }, [speaking, stop]);

  if (!supported) return null;

  const listen = () => {
    if (speaking) return stop();
    const synth = window.speechSynthesis;
    synth.cancel();
    const id = ++run.current;
    const done = () => { if (run.current === id) setSpeaking(false); };
    const voice = pickVoice(synth.getVoices(), lang);
    parts.forEach((text, i) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = LOCALE[lang];
      utterance.voice = voice;
      utterance.rate = 0.9;
      utterance.volume = 1;
      // Only the last part settles the button: after a part fails, the browser still reads the rest.
      if (i === parts.length - 1) utterance.onend = utterance.onerror = done;
      synth.speak(utterance);
    });
    setSpeaking(true);
  };

  return (
    <button type="button" onClick={listen} className="press" style={{ ...OUTLINED, ...style }}>
      {speaking ? <StopIcon size={22} /> : <SpeakerIcon size={24} />}
      {t(speaking ? "listen.stop" : "listen.play")}
    </button>
  );
}
