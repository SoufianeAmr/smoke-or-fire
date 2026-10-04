// "Listen": the screen's guided voice, with the browser's built-in speech (speechSynthesis), in the app's language.
// It never starts by itself; tap again to stop. Hidden when the browser can't speak.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useApp, useT } from "../app/state";
import { SpeakerIcon, StopIcon } from "../components/icons";
import { LOCALE, pickVoice } from "./speech";

// Outlined navy, as the other secondary buttons: red stays for Call 911. White inside, so it also reads on a red screen.
const OUTLINED: CSSProperties = { minHeight: "56px", display: "flex", alignItems: "center", gap: "6px", padding: "0 12px 0 10px", borderRadius: "18px", border: "2px solid #1B2A4A", background: "#FFFFFF", color: "#1B2A4A", fontFamily: "inherit", fontSize: "18px", fontWeight: "700", lineHeight: "1.2", cursor: "pointer" };

// One voice at a time. A screen can have two Listen buttons (the verdict, and its burn card): starting one stops the
// other, and a button that is not the one reading never cuts the other's sentence (the verdict's own button leaves the
// screen when "Why?" opens).
let reading: { owner: object; stop: () => void } | null = null;

/** A short breath between sentences, as a person reading aloud would take. */
const PAUSE_MS = 300;

export const canSpeak = () => typeof window !== "undefined" && !!window.speechSynthesis && typeof window.SpeechSynthesisUtterance === "function";

/**
 * `sentences` are read in order, one utterance each, with a pause between them. `label` names the button for a screen
 * reader where a screen has a second one: "Listen: is burning allowed today?".
 */
export function ListenButton({ sentences, style, label }: { sentences: string[]; style?: CSSProperties; label?: { play: string; stop: string } }) {
  const { lang } = useApp();
  const t = useT();
  const [supported] = useState(canSpeak);
  const [speaking, setSpeaking] = useState(false);
  const run = useRef(0); // the current reading; events from a stopped one are ignored
  const pause = useRef<number | undefined>(undefined);
  const current = useRef<SpeechSynthesisUtterance | null>(null); // held so Chrome can't collect it before its end event

  const owner = useRef({}).current; // this button, to tell whose reading it is
  const stop = useCallback(() => {
    run.current++;
    window.clearTimeout(pause.current);
    if (!reading || reading.owner === owner) {
      window.speechSynthesis.cancel();
      reading = null;
    }
    setSpeaking(false);
  }, [owner]);
  // Leaving the screen, switching language, or the screen changing what it shows (the leave screen's "Change", Check's
  // Live/Replay) stops the reading: it was for what's no longer there. Keyed on the text: screens rebuild the array.
  const script = sentences.join("\n");
  useEffect(() => (supported ? stop : undefined), [supported, stop, lang, script]);
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
    if (sentences.length === 0) return;
    const synth = window.speechSynthesis;
    if (reading && reading.owner !== owner) reading.stop();
    reading = { owner, stop };
    synth.cancel();
    const id = ++run.current;
    const voice = pickVoice(synth.getVoices(), lang);
    const say = (i: number) => {
      if (run.current !== id) return;
      if (i >= sentences.length) {
        if (reading?.owner === owner) reading = null;
        setSpeaking(false);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(sentences[i]);
      utterance.lang = LOCALE[lang];
      utterance.voice = voice;
      // Calm and warm: a little slower than normal, a little higher.
      utterance.rate = 0.92;
      utterance.pitch = 1.05;
      utterance.volume = 1;
      // Next sentence after a pause; one that fails is skipped. Some browsers send both error and end: act once.
      let settled = false;
      utterance.onend = utterance.onerror = () => {
        if (settled || run.current !== id) return;
        settled = true;
        pause.current = window.setTimeout(() => say(i + 1), PAUSE_MS);
      };
      current.current = utterance;
      synth.speak(utterance);
    };
    say(0); // the first sentence starts inside the tap, as iOS requires
    setSpeaking(true);
  };

  return (
    <button type="button" onClick={listen} className="press" aria-label={label && (speaking ? label.stop : label.play)} style={{ ...OUTLINED, ...style }}>
      {speaking ? <StopIcon size={22} /> : <SpeakerIcon size={24} />}
      {t(speaking ? "listen.stop" : "listen.play")}
    </button>
  );
}
