// The dispatch board's own strings: the same rules as the public app's (i18n/strings.test.ts), and two of its own:
// the banner's words, and never a word that tells a call taker not to respond.
import { describe, expect, test } from "vitest";
import { TODO } from "../i18n";
import en from "./en.json";
import fr from "./fr.json";
import { dt } from "./strings";

const BOTH = [...Object.entries(en), ...Object.entries(fr)];
// A ? ! : or ; not preceded by a no-break space (U+00A0) or narrow no-break space (U+202F).
const NO_SPACE_BEFORE_PUNCTUATION = new RegExp(`[^${String.fromCharCode(0xa0, 0x202f)}][?!:;]`);

describe("dispatch strings", () => {
  test("English and French have the same keys, and every string has French", () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
    expect(Object.entries(fr).filter(([, text]) => text === TODO || text.trim() === "").map(([key]) => key)).toEqual([]);
  });

  test("each French string takes the same values as its English one", () => {
    const values = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    // French says "de Moncton" or "d’Edmundston" where English says "of Moncton".
    const same = (a: string[], b: string[]) => a.join() === b.join() || a.join() === b.map((v) => (v === "ofTown" ? "town" : v)).sort().join();
    const differ = Object.keys(en).filter((key) => !same(values(en[key as keyof typeof en]), values(fr[key as keyof typeof fr])));
    expect(differ).toEqual([]);
  });

  test("French has a non-breaking space before ? ! : ; and inside « »", () => {
    const text = (value: string) => value.replace(/\{\w+\}/g, "").replace(/Ctrl\+C/g, "");
    expect(Object.entries(fr).filter(([, value]) => NO_SPACE_BEFORE_PUNCTUATION.test(text(value))).map(([key]) => key)).toEqual([]);
    const nbsp = `[${String.fromCharCode(0xa0, 0x202f)}]`;
    expect(Object.entries(fr).filter(([, value]) => new RegExp(`«(?!${nbsp})|(?<!${nbsp})»`).test(value)).map(([key]) => key)).toEqual([]);
  });

  test("apostrophes are curly, no emoji, never the word safe", () => {
    expect(BOTH.filter(([, text]) => text.includes("'")).map(([key]) => key)).toEqual([]);
    expect(BOTH.filter(([, text]) => /\p{Extended_Pictographic}/u.test(text)).map(([key]) => key)).toEqual([]);
    expect(BOTH.filter(([, text]) => /safe|sécuri/i.test(text)).map(([key]) => key)).toEqual([]);
  });

  test("never tells anyone not to call 911, and never tells a call taker not to respond", () => {
    const dont = /(do not|don’t|never|no need to) call|ne (pas|jamais) appeler|n’appelez (pas|jamais)|9-1-1 for updates/i;
    const noResponse = /(do not|don’t|never|no need to) (respond|dispatch|send|go)|no response|stand down|ne (pas|jamais) (répondre|répartir|envoyer|intervenir)|n’(envoyez|intervenez|répartissez) (pas|jamais)|aucune intervention|inutile d/i;
    expect(BOTH.filter(([, text]) => dont.test(text) || noResponse.test(text)).map(([key]) => key)).toEqual([]);
  });

  test("the banner, word for word", () => {
    expect([dt("en", "banner"), dt("fr", "banner")]).toEqual(["Decision support only. Your dispatch protocol governs.", "Aide à la décision seulement. Votre protocole de répartition prévaut."]);
  });

  // The footer's promise, and what the board says when Listen is off so that the promise holds: a voice service
  // would be sent the caller's town.
  test("nothing about a call is stored or sent, word for word", () => {
    expect([dt("en", "stored"), dt("fr", "stored")]).toEqual([
      "Nothing about a call is stored or sent: the place, the answers and the drafts stay on this screen, and are gone when it closes.",
      `Rien d’un appel n’est conservé ni envoyé${String.fromCharCode(0xa0)}: le lieu, les réponses et les brouillons restent sur cet écran et disparaissent à sa fermeture.`,
    ]);
  });

  test("why Listen is off, word for word: no voice on the device for the language, and nothing goes to a voice service", () => {
    expect([dt("en", "listen.off"), dt("fr", "listen.off")]).toEqual([
      "Listen is off: this browser has no English voice that works on the device, and the board sends nothing to a voice service.",
      `Écouter est désactivé${String.fromCharCode(0xa0)}: ce navigateur n’a pas de voix française qui fonctionne sur l’appareil, et le tableau n’envoie rien à un service vocal.`,
    ]);
  });

  test("the public message and the image say when to call 911, in both languages", () => {
    expect([dt("en", "msg.call"), dt("fr", "msg.call")]).toEqual([
      "If you see flames or smoke from a building or vehicle, call 911.",
      "Si vous voyez des flammes ou de la fumée qui sort d’un bâtiment ou d’un véhicule, appelez le 911.",
    ]);
  });
});
