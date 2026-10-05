// "Protect your home" (/protect): what a person can do at home now. ECCC's air quality band for the spot that was
// checked; four icon tiles of Health Canada's advice, each sentence and its source one tap away; and a switch, "I have
// asthma or COPD", that shows ECCC's message for the at-risk population and is kept on this device only (atRisk.ts).
// What the screen says comes from view.ts; no advice is written in this file.
import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router";
import { useApp } from "../app/state";
import { ReplayBanner } from "../components/ReplayBanner";
import { Screen } from "../components/Screen";
import { CLEAR_OF_BAR, Sticky911 } from "../components/Sticky911";
import { TopBar } from "../components/TopBar";
import { ChevronDownIcon, ChevronUpIcon, DoorOpenIcon, ExternalIcon } from "../components/icons";
import { forgetAtRisk, readAtRisk, saveAtRisk } from "./atRisk";
import { GaugeIcon, TileIcon } from "./icons";
import { useOnDeviceVoice } from "./onDeviceVoice";
import { protectView, type ProtectView, type QuoteView, type SourceView, type TileView } from "./view";
import "./protect.css";

/** Opened, a panel scrolls clear of the 911 bar; one taller than the room there starts under what opened it. */
function useScrolledIntoView(open: boolean) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) panel.current?.scrollIntoView({ block: "nearest" });
  }, [open]);
  return panel;
}

/** Who published the page, its title, its date modified and where it is: a link to the page itself. */
function Source({ source }: { source: SourceView }) {
  return (
    <a className="protect-source press" href={source.url} target="_blank" rel="noopener noreferrer">
      <span className="protect-source-text">
        <span className="protect-source-line">{source.by}</span>
        <span className="protect-source-line">{source.title}</span>
        <span className="protect-source-meta">
          <span className="protect-source-line">{source.dated}</span>
          <span className="protect-source-line">{source.host}</span>
        </span>
      </span>
      <ExternalIcon size={24} />
    </a>
  );
}

/** A passage as its page has it: the sentences, the list they introduce, then where they come from. */
function Quote({ quote }: { quote: QuoteView }) {
  return (
    <>
      <blockquote className="protect-quote" data-quote data-source={quote.source.id} cite={quote.source.url}>
        <p>{quote.text}</p>
        {quote.items.length > 0 && (
          <ul>
            {quote.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </blockquote>
      <Source source={quote.source} />
    </>
  );
}

/** The air quality band, in words, with a gauge. A tap shows the reading, who measured it and when, and ECCC's page. */
function Band({ band }: { band: ProtectView["band"] }) {
  const [open, setOpen] = useState(false);
  const panel = useScrolledIntoView(open);
  return (
    <div className="protect-band">
      <button type="button" className="protect-band-toggle press" data-band={band.category ?? "none"} aria-expanded={open} aria-controls="protect-band" onClick={() => setOpen(!open)}>
        <GaugeIcon band={band.category} size={28} />
        <span className="protect-label">{band.label}</span>
        {open ? <ChevronUpIcon size={24} /> : <ChevronDownIcon size={24} />}
      </button>
      {band.note && (
        <p className="protect-note">
          <strong>{band.note.lead}</strong> {band.note.text}
        </p>
      )}
      <div id="protect-band" className="protect-panel" ref={panel} hidden={!open}>
        {band.lines.map((line, i) => (
          <p key={line} className={i > 0 ? "protect-quiet" : undefined}>{line}</p>
        ))}
        <a className="protect-source press" href={band.link.url} target="_blank" rel="noopener noreferrer">
          <span className="protect-source-text">
            <span className="protect-source-line">{band.link.label}</span>
            <span className="protect-source-line">{band.link.host}</span>
          </span>
          <ExternalIcon size={24} />
        </a>
      </div>
    </div>
  );
}

/** One piece of advice: its icon and the opening words of its sentence. A tap shows the whole of it, and its source. */
function Tile({ tile, open, onToggle }: { tile: TileView; open: boolean; onToggle: () => void }) {
  const details = useScrolledIntoView(open);
  return (
    <li className="protect-tile" data-tile={tile.id}>
      <button type="button" className="protect-tile-toggle press" aria-expanded={open} aria-controls={`protect-${tile.id}`} onClick={onToggle}>
        <span className="protect-icon">
          <TileIcon icon={tile.icon} size={32} />
        </span>
        <span className="protect-label">{tile.label}</span>
        <span className="protect-chevron">{open ? <ChevronUpIcon size={24} /> : <ChevronDownIcon size={24} />}</span>
      </button>
      {/* Shown without a tap, so the label is never read without it; opened, the passage below holds it. */}
      {tile.note && !open && (
        <blockquote className="protect-quote protect-tile-note" data-quote data-source={tile.quotes[0].source.id} cite={tile.quotes[0].source.url}>
          <p>{tile.note}</p>
        </blockquote>
      )}
      <div id={`protect-${tile.id}`} className="protect-details" ref={details} hidden={!open}>
        {tile.quotes.map((quote) => (
          <Quote key={quote.text} quote={quote} />
        ))}
      </div>
    </li>
  );
}

export function Protect() {
  const { result, lang } = useApp();
  const [openTile, setOpenTile] = useState<string | null>(null);
  // The switch: as the device has it. `kept` is false when the device refused to keep it. `status`: what happened to
  // the answer when it was switched off or forgotten here, said until the switch is turned on again.
  const [atRisk, setAtRisk] = useState(readAtRisk);
  const [kept, setKept] = useState(true);
  const [status, setStatus] = useState<"forgotten" | "notForgotten" | null>(null);
  const deviceVoice = useOnDeviceVoice(lang);
  // The screen says what to do for the air where the check was made: with no check, there is nothing to show.
  if (!result) return <Navigate to="/" replace />;

  const view = protectView(result, lang);
  const turnOn = () => {
    setKept(saveAtRisk());
    setAtRisk(true);
    setStatus(null);
  };
  const forget = () => {
    // Nothing is claimed that the device did not do: an entry it would not remove is said to be still there.
    const removed = forgetAtRisk();
    setAtRisk(false);
    setStatus(removed || !kept ? "forgotten" : "notForgotten");
  };
  const say = view.atRisk;

  return (
    <Screen>
      <ReplayBanner />
      {/* Listen: with a voice that works on this device whenever there is one, whatever the switch says, so the voice
          it reads with tells nothing. The at-risk line is read only by such a voice; with none, Listen says what it
          says with the switch off, word for word, and the message stays on the screen. */}
      <TopBar back={-1} listen={atRisk && deviceVoice ? view.voice.on : view.voice.off} listenOnDevice={deviceVoice} />
      <main className="protect-main" data-tone={view.band.tone} style={{ padding: `8px 16px ${CLEAR_OF_BAR}` }}>
        <h1 className="protect-title">{view.title}</h1>
        {view.notice && (
          // The fire is close: official instructions come before any advice about staying in.
          <div className="protect-notice">
            <p>{view.notice.text}</p>
            {/* Told to leave: a button with a door and its words, as on the verdict and on Call 911 now. */}
            <Link to="/leave" className="press protect-notice-link">
              <DoorOpenIcon size={24} />
              <span>{view.notice.link}</span>
            </Link>
          </div>
        )}
        <Band band={view.band} />
        <p className="protect-intro">{view.intro}</p>
        <ul className="protect-tiles" aria-label={view.tilesName}>
          {view.tiles.map((tile) => (
            <Tile key={tile.id} tile={tile} open={openTile === tile.id} onToggle={() => setOpenTile(openTile === tile.id ? null : tile.id)} />
          ))}
        </ul>
        <div className="protect-atrisk">
          <button type="button" role="switch" aria-checked={atRisk} aria-labelledby="protect-atrisk-label" className="protect-switch" onClick={atRisk ? forget : turnOn}>
            <span id="protect-atrisk-label" className="protect-label">{say.label}</span>
            <span className="protect-switch-state">
              <span className="protect-switch-word">{atRisk ? say.yes : say.no}</span>
              <span className="protect-switch-track" aria-hidden="true">
                <span className="protect-switch-knob" />
              </span>
            </span>
          </button>
          {!atRisk && <p className="protect-help protect-quiet">{say.help}</p>}
          {atRisk && (
            <div className="protect-message">
              {say.message ? (
                <>
                  <p className="protect-kicker">
                    <strong className="protect-kicker-band">{say.band}</strong>
                    <span className="protect-quiet">{say.kicker}</span>
                  </p>
                  <blockquote className="protect-quote" data-quote data-source={say.source.id} cite={say.source.url}>
                    <p>{say.message}</p>
                  </blockquote>
                  {say.note && (
                    <p className="protect-note">
                      <strong>{say.note.lead}</strong> {say.note.text}
                    </p>
                  )}
                </>
              ) : (
                <p>{say.noReading}</p>
              )}
              <blockquote className="protect-quote" data-quote data-source={say.source.id} cite={say.source.url}>
                <p>{say.doctor}</p>
              </blockquote>
              <Source source={say.source} />
              <div className="protect-kept-row">
                <p className="protect-kept protect-quiet">{kept ? say.saved : say.notSaved}</p>
                <button type="button" className="protect-forget press" onClick={forget}>{say.forget}</button>
              </div>
            </div>
          )}
          {/* Said to a screen reader as it changes; it stays until the switch is turned on again. */}
          <p className="protect-status" role="status">{status ? say[status] : ""}</p>
        </div>
      </main>
      <Sticky911 />
    </Screen>
  );
}
