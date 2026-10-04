// Whether this browser can read aloud without sending what it says anywhere. Some browsers' most natural voices are
// voice services: the words go to a server to be spoken. The at-risk message is only ever read by a voice that works
// on the device itself.
import { useEffect, useState } from "react";
import type { Lang } from "../i18n";
import { canSpeak } from "../listen/ListenButton";
import { pickVoice } from "../listen/speech";

const has = (lang: Lang) => canSpeak() && pickVoice(window.speechSynthesis.getVoices().filter((voice) => voice.localService), lang) !== null;

/** True when the browser has a voice for the language that works on the device. Browsers list their voices late: it follows the list. */
export function useOnDeviceVoice(lang: Lang): boolean {
  const [found, setFound] = useState(() => has(lang));
  useEffect(() => {
    if (!canSpeak()) return;
    const look = () => setFound(has(lang));
    look();
    window.speechSynthesis.addEventListener?.("voiceschanged", look);
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", look);
  }, [lang]);
  return found;
}
