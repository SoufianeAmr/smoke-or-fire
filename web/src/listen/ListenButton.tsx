// "Listen": the screen's guided voice, with the browser's built-in speech (speechSynthesis), in the app's language.
// It never starts by itself; tap again to stop. Hidden when the browser can't speak; a button that must say why it
// cannot read (`noVoice`) is shown off instead, with its reason.
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { useApp, useT } from "../app/state";
import { SpeakerIcon, StopIcon } from "../components/icons";
import type { Lang } from "../i18n";
import { LOCALE, deviceVoice, onlineVoiceNotice, voiceFor, type DeviceVoice } from "./speech";

// Outlined navy, as the other secondary buttons: red stays for Call 911. White inside, so it also reads on a red screen.
const OUTLINED: CSSProperties = { minHeight: "56px", display: "flex", alignItems: "center", gap: "6px", padding: "0 12px 0 10px", borderRadius: "18px", border: "2px solid #1B2A4A", background: "#FFFFFF", color: "#1B2A4A", fontFamily: "inherit", fontSize: "18px", fontWeight: "700", lineHeight: "1.2", cursor: "pointer" };

// Off: the outline and the words in grey, as the map's buttons that cannot be used; the reason beside it is in full ink.
const OFF: CSSProperties = { borderColor: "#8A8F98", color: "#8A8F98", cursor: "default" };
const REASON: CSSProperties = { margin: "0", fontSize: "18px", fontWeight: "500", lineHeight: "1.4", color: "#4F5561" };

// One voice at a time. A screen can have two Listen buttons (the verdict, and its burn card): starting one stops the
// other, and a button that is not the one reading never cuts the other's sentence (the verdict's own button leaves the
// screen when "Why?" opens).
let reading: { owner: object; stop: () => void } | null = null;

// A voice that works on the device reads first, on every screen. Where the language has only a voice service (the
// words go to a server to be spoken), the first reading says so before anything else: once, for every Listen button,
// until the page is loaded again. Kept here and nowhere else: nothing about it is stored. It counts as said only when
// it was heard to its end, so one cut short (Stop, another button, leaving the screen) is said again.
let toldOnline = false;

/** A short breath between sentences, as a person reading aloud would take. */
const PAUSE_MS = 300;

export const canSpeak = () => typeof window !== "undefined" && !!window.speechSynthesis && typeof window.SpeechSynthesisUtterance === "function";

/** How long a browser is given to list its voices before an empty list is taken as its answer. */
const LISTED_MS = 1000;

/**
 * Whether the language has a voice that works on the device, read again whenever the browser says its voices changed:
 * for a button that is off without one. Some browsers list no voice for their first moments: until the list has
 * changed once, or a second has passed, an empty list is "unknown", not "none". `follow` false: not looked at.
 * The second value settles it at once: a tap has just found no voice.
 */
function useDeviceVoice(lang: Lang, follow: boolean): [DeviceVoice, () => void] {
  const [listed, setListed] = useState(false);
  const [, setChanges] = useState(0); // the list is the browser's own: each change draws the button again
  const settle = useCallback(() => {
    setListed(true);
    setChanges((n) => n + 1);
  }, []);
  useEffect(() => {
    if (!follow) return;
    const synth = window.speechSynthesis;
    // Optional calls: a browser's speech may come without events.
    synth.addEventListener?.("voiceschanged", settle);
    const late = window.setTimeout(settle, LISTED_MS);
    return () => {
      synth.removeEventListener?.("voiceschanged", settle);
      window.clearTimeout(late);
    };
  }, [follow, settle]);
  return [follow ? deviceVoice(window.speechSynthesis.getVoices(), lang, listed) : "unknown", settle];
}

/**
 * `sentences` are read in order, one utterance each, with a pause between them, by a voice that works on the device
 * when the language has one; else by a voice service, after saying so (once). `onDevice`: read only by a voice that
 * works on the device; with none, nothing is said, not even that.
 * `noVoice`: for a screen that promises nothing it shows is sent anywhere. The button then reads only on the device
 * too, and while the language has no voice there (or the browser cannot speak at all) it is off and says why: these
 * words are shown with it and are its description for a screen reader. Off, it can still take the focus, so the
 * reason is read with it; pressing it does nothing.
 * `label` names the button for a screen reader where a screen has a second one: "Listen: is burning allowed today?".
 * `text`: the words on the button while it is not reading, where they are not "Listen" ("Hear it").
 * `hiddenWithoutVoice`: the button reads only on the device too, and is there only while the language has a voice
 * that works there: with none, or before the browser has listed its voices, there is no button at all.
 */
export function ListenButton({ sentences, style, onDevice = false, label, noVoice, text, hiddenWithoutVoice = false }: { sentences: string[]; style?: CSSProperties; onDevice?: boolean; label?: { play: string; stop: string }; noVoice?: string; text?: string; hiddenWithoutVoice?: boolean }) {
  const { lang } = useApp();
  const t = useT();
  const [supported] = useState(canSpeak);
  const [speaking, setSpeaking] = useState(false);
  const run = useRef(0); // the current reading; events from a stopped one are ignored
  const pause = useRef<number | undefined>(undefined);
  const current = useRef<SpeechSynthesisUtterance | null>(null); // held so Chrome can't collect it before its end event

  const says = noVoice !== undefined; // this button says why when it cannot read
  const [device, noneFound] = useDeviceVoice(lang, supported && (says || hiddenWithoutVoice));
  const reason = useId();
  // Never off while it reads: Stop must work, and the voice reading is the device's.
  const off = says && (!supported || (device === "none" && !speaking));

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

  if (!supported && !says) return null;
  // Never taken away while it reads: Stop must work.
  if (hiddenWithoutVoice && device !== "found" && !speaking) return null;

  const listen = () => {
    if (speaking) return stop();
    if (off || sentences.length === 0) return;
    const synth = window.speechSynthesis;
    // The voice first: a button with no voice it may use says nothing, and stops nobody else's reading. One that
    // says why is then off: the device's voice went without the browser saying so.
    const plan = voiceFor(synth.getVoices(), lang, onDevice || says || hiddenWithoutVoice);
    if (!plan) return says || hiddenWithoutVoice ? noneFound() : undefined;
    if (reading && reading.owner !== owner) reading.stop();
    reading = { owner, stop };
    synth.cancel();
    const id = ++run.current;
    // Only a voice service for this language: the reading starts by saying so, unless that was already heard.
    const notice = plan.online && !toldOnline ? onlineVoiceNotice(lang) : [];
    const lines = [...notice, ...sentences];
    const say = (i: number) => {
      if (run.current !== id) return;
      if (i >= lines.length) {
        if (reading?.owner === owner) reading = null;
        setSpeaking(false);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(lines[i]);
      utterance.lang = LOCALE[lang];
      utterance.voice = plan.voice;
      // Calm and warm: a little slower than normal, a little higher.
      utterance.rate = 0.92;
      utterance.pitch = 1.05;
      utterance.volume = 1;
      // Next sentence after a pause; one that fails is skipped. Some browsers send both error and end: act once.
      let settled = false;
      const next = (heard: boolean) => {
        if (settled || run.current !== id) return;
        settled = true;
        if (heard && i === notice.length - 1) toldOnline = true; // the notice was heard to its end
        pause.current = window.setTimeout(() => say(i + 1), PAUSE_MS);
      };
      utterance.onend = () => next(true);
      utterance.onerror = () => next(false);
      current.current = utterance;
      synth.speak(utterance);
    };
    say(0); // the first sentence starts inside the tap, as iOS requires
    setSpeaking(true);
  };

  return (
    <>
      <button type="button" onClick={listen} className={off ? undefined : "press"} aria-disabled={off || undefined} aria-describedby={off ? reason : undefined} aria-label={label && (speaking ? label.stop : label.play)} style={{ ...OUTLINED, ...style, ...(off ? OFF : null) }}>
        {speaking ? <StopIcon size={22} /> : <SpeakerIcon size={24} />}
        {speaking ? t("listen.stop") : text ?? t("listen.play")}
      </button>
      {off && <p id={reason} className="listen-off" style={REASON}>{noVoice}</p>}
    </>
  );
}
