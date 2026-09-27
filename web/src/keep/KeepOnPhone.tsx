// "Keep it on your phone: Add to home screen · Send to someone", the small line under How it works on Check, for
// families setting the app up before fire season.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { useApp, useT } from "../app/state";
import { CloseIcon } from "../components/icons";
import { openInstallPrompt, shareData, shareSms, type Platform } from "./keep";

const LABEL: CSSProperties = { margin: "0", fontSize: "16px", fontWeight: "500", lineHeight: "1.4", color: "#4F5561" };
const LINK: CSSProperties = { flexShrink: "0", minHeight: "56px", display: "inline-flex", alignItems: "center", padding: "0 4px", border: "0", background: "transparent", fontFamily: "inherit", fontSize: "16px", fontWeight: "700", lineHeight: "1.3", color: "#1B2A4A", textDecoration: "underline", textUnderlineOffset: "3px", textAlign: "center", cursor: "pointer" };
const DOT: CSSProperties = { fontSize: "16px", fontWeight: "700", color: "#4F5561" };
const GAP = 8;
/** The dot (about 5 px) and the gaps either side of it. */
const SEPARATOR = 2 * GAP + 8;

/** `offered`: "Add to home screen" is shown (not when the app is open from the home screen). `platform`: whose steps. */
export function KeepOnPhone({ offered, platform }: { offered: boolean; platform: Platform }) {
  const { lang } = useApp();
  const t = useT();
  const [steps, setSteps] = useState(false);
  const sharing = useRef(false);

  // The two links sit on one line with a dot between them when they fit (English, on most phones); otherwise one under
  // the other, with no dot left hanging at the end of a line (French). Measured from the links' own widths (they never
  // shrink, so the layout doesn't change them), before the first paint; again when the font loads, the language
  // changes or the phone turns.
  const row = useRef<HTMLDivElement>(null);
  const add = useRef<HTMLButtonElement>(null);
  const send = useRef<HTMLAnchorElement>(null);
  const [stacked, setStacked] = useState(false);
  useLayoutEffect(() => {
    if (!offered) return;
    const measure = () => {
      if (row.current && add.current && send.current) setStacked(add.current.offsetWidth + send.current.offsetWidth + SEPARATOR > row.current.clientWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const link of [add.current, send.current]) if (link) observer.observe(link);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [offered]);

  // On Android, the browser's install prompt when it offered one; otherwise, or if it fails, the steps. A computer gets
  // both phones' steps even when Chrome offers a prompt there: that would install the app on the computer.
  const onAdd = () => {
    const showSteps = () => setSteps(true);
    if (platform !== "android" || !openInstallPrompt(showSteps)) showSteps();
  };

  // The phone's share sheet when the browser has one; otherwise the link's own sms: address opens a text message.
  const onSend = (event: MouseEvent<HTMLAnchorElement>) => {
    const data = shareData(lang);
    if (typeof navigator.share !== "function" || (typeof navigator.canShare === "function" && !navigator.canShare(data))) return;
    event.preventDefault();
    if (sharing.current) return; // its share sheet is already open
    sharing.current = true;
    navigator
      .share(data)
      .catch((error: unknown) => {
        // Closed without sending: nothing to do. Refused (no app to share to): the text message instead.
        if ((error as { name?: string } | null)?.name !== "AbortError") window.location.href = shareSms(lang);
      })
      .finally(() => {
        sharing.current = false;
      });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
      {offered && <p style={LABEL}>{t("keep.label")}</p>}
      <div ref={row} style={{ alignSelf: "stretch", display: "flex", flexDirection: stacked ? "column" : "row", justifyContent: "center", alignItems: "center", columnGap: `${GAP}px` }}>
        {offered && (
          <>
            <button ref={add} type="button" onClick={onAdd} style={LINK}>{t("keep.add")}</button>
            {!stacked && <span aria-hidden="true" style={DOT}>·</span>}
          </>
        )}
        <a ref={send} href={shareSms(lang)} onClick={onSend} style={LINK}>{t("keep.send")}</a>
      </div>
      {steps && <StepsSheet platform={platform} onClose={() => setSteps(false)} />}
    </div>
  );
}

const CARD: CSSProperties = { background: "#FFFFFF", borderRadius: "18px 18px 0 0", boxShadow: "0 -16px 40px rgba(26, 29, 33, 0.22)", padding: "14px 6px calc(24px + env(safe-area-inset-bottom)) 20px", display: "flex", flexDirection: "column", gap: "12px", textAlign: "left" };
const CLOSE: CSSProperties = { flexShrink: "0", width: "56px", height: "56px", border: "0", background: "transparent", color: "#1A1D21", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
const STEPS: CSSProperties = { margin: "0", paddingRight: "14px", fontSize: "18px", lineHeight: "1.45" };

/**
 * How to add the app to the home screen, when the browser offers no prompt: the iPhone's steps on an iPhone or iPad, the
 * Android steps on Android, and both elsewhere (a computer, setting it up for someone's phone). A modal sheet at the
 * bottom of the screen; Close, Escape or a tap outside closes it.
 */
function StepsSheet({ platform, onClose }: { platform: Platform; onClose: () => void }) {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const shown = platform === "other" ? (["iphone", "android"] as const) : [platform];
  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);
  const close = () => dialog.current?.close();

  return (
    <dialog ref={dialog} className="sheet" aria-labelledby="keep-steps-h" onClose={onClose} onClick={(e) => e.target === e.currentTarget && close()}>
      <div style={CARD}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <h2 id="keep-steps-h" style={{ flexGrow: "1", margin: "0", fontSize: "22px", fontWeight: "700", lineHeight: "1.25", color: "#1A1D21" }}>{t("keep.add")}</h2>
          <button type="button" onClick={close} aria-label={t("tip.close")} style={CLOSE}>
            <CloseIcon size={24} />
          </button>
        </div>
        {shown.map((p) => (
          <p key={p} style={STEPS}>
            {shown.length > 1 && <strong style={{ display: "block" }}>{t(`keep.steps.${p}.label`)}</strong>}
            {t(`keep.steps.${p}`)}
          </p>
        ))}
      </div>
    </dialog>
  );
}
