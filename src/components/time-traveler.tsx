"use client";

/* Local, pre-optimized archive files use native images for controlled contain sizing and offline-friendly loading. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import rawPhotos from "@/data/photos.json";
import { Asterisk, Arrow, Expand, TimeMark } from "./icons";
import { HomeScreen } from "./home-screen";
import { ResultsScreen } from "./results-screen";
import {
  MIN_YEAR,
  MAX_YEAR,
  EMPTY_PROGRESS,
  clampYear,
  beginTrip,
  advanceRound,
  submitGuess,
  parseProgress,
  revealMessage,
  selectPhotos,
  shareResults,
  totalScore,
  type Game,
  type Photo,
  type Progress,
} from "@/lib/game";

const photos = rawPhotos as Photo[];
const STORAGE_KEY = "time-traveler-v1";
const number = (n: number) => n.toLocaleString("en-US");
type Modal = "help" | "credits" | "photo" | null;

function PhotoFrame({
  photo,
  revealed,
  onExpand,
  onUnavailable,
  onReady,
}: {
  photo: Photo;
  revealed: boolean;
  onExpand: () => void;
  onUnavailable: () => void;
  onReady: (id: string | null) => void;
}) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);
  return (
    <div
      className={`photo-frame ${status === "loaded" ? "is-loaded" : ""} ${revealed ? "is-revealed" : ""}`}
      style={{ "--photo-ratio": photo.width / photo.height } as CSSProperties}
    >
      {status === "loading" && (
        <div className="photo-status" role="status">
          <span className="loading-mark" />
          Opening the archive…
        </div>
      )}
      {status === "error" ? (
        <div className="photo-status image-error" role="alert">
          <Asterisk />
          <h2>A small wrinkle in time.</h2>
          <p>This photograph couldn’t be loaded.</p>
          <div>
            <button
              className="text-link"
              onClick={() => {
                setAttempt((a) => a + 1);
                setStatus("loading");
              }}
            >
              Try again
            </button>
            {!revealed && (
              <button className="text-link" onClick={onUnavailable}>
                Try another photo <Arrow />
              </button>
            )}
          </div>
        </div>
      ) : (
        <button
          className="photo-expand-area"
          onClick={onExpand}
          disabled={status !== "loaded"}
          aria-label="Enlarge photograph to inspect the details"
        >
          <img
            key={attempt}
            src={`${photo.src}${attempt ? `?retry=${attempt}` : ""}`}
            alt={
              revealed
                ? photo.title
                : "Historical photograph. Look at the clothing, objects, and surroundings to guess its year."
            }
            width={photo.width}
            height={photo.height}
            onLoad={() => {
              setStatus("loaded");
              onReady(photo.id);
            }}
            onError={() => {
              setStatus("error");
              onReady(null);
            }}
            fetchPriority="high"
            draggable={false}
          />
          {status === "loaded" && (
            <span className="expand-label">
              <Expand />
              <span>Take a closer look</span>
            </span>
          )}
        </button>
      )}
      <input type="hidden" data-photo-status={status} />
    </div>
  );
}

export default function TimeTraveler() {
  const [progress, setProgress] = useState<Progress>(EMPTY_PROGRESS);
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<"home" | "game">("home");
  const [modal, setModal] = useState<Modal>(null);
  const [copied, setCopied] = useState(false);
  const [copyText, setCopyText] = useState(false);
  const [loadedPhotoId, setLoadedPhotoId] = useState<string | null>(null);
  const [yearDraft, setYearDraft] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const game = progress.game;
  const roundIndex = game
    ? game.phase === "reveal"
      ? game.answers.length - 1
      : Math.min(game.answers.length, 4)
    : 0;
  const photo = game
    ? photos.find((p) => p.id === game.photoIds[roundIndex])!
    : null;
  const result = game?.phase === "reveal" ? game.answers.at(-1) : null;
  const score = totalScore(game?.answers ?? []);
  const nextPhotoSrc = photos.find(
    (p) => p.id === game?.photoIds[roundIndex + 1],
  )?.src;

  useEffect(() => {
    let stored: Progress = { ...EMPTY_PROGRESS };
    try {
      stored = parseProgress(localStorage.getItem(STORAGE_KEY), photos);
    } catch {
      /* Storage is optional in private browsing. */
    }
    // The first client effect restores a validated local session after static rendering.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProgress(stored);
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch {
      /* The game remains playable without storage. */
    }
  }, [progress, ready]);
  useEffect(() => {
    if (modal) dialog.current?.showModal();
    else dialog.current?.close();
  }, [modal]);
  useEffect(() => {
    if (screen === "game" && nextPhotoSrc) {
      const image = new Image();
      image.src = nextPhotoSrc;
    }
  }, [screen, nextPhotoSrc]);
  useEffect(() => {
    if (screen === "game") heading.current?.focus({ preventScroll: true });
  }, [screen, game?.phase, roundIndex]);

  function start() {
    setProgress((p) => beginTrip(p, photos));
    setCopied(false);
    setCopyText(false);
    setYearDraft(null);
    setLoadedPhotoId(null);
    setScreen("game");
    window.scrollTo({ top: 0 });
  }
  function updateGame(updater: (g: Game) => Game) {
    setProgress((p) => (p.game ? { ...p, game: updater(p.game) } : p));
  }
  function lock() {
    if (!game || game.phase !== "guess" || !photo) return;
    if (loadedPhotoId !== photo.id) return;
    const guess = clampYear(
      yearDraft !== null && yearDraft.trim() ? Number(yearDraft) : game.guess,
    );
    setYearDraft(null);
    updateGame((g) => submitGuess(g, photo, guess));
    window.scrollTo({ top: 0 });
  }
  function next() {
    if (!game || game.phase !== "reveal") return;
    setLoadedPhotoId(null);
    setProgress(advanceRound);
    window.scrollTo({ top: 0 });
  }
  function replacePhoto() {
    if (!game || game.phase !== "guess") return;
    const replacement = selectPhotos(
      photos.filter((p) => !game.photoIds.includes(p.id)),
      progress.recent,
    )[0];
    if (replacement)
      setProgress((p) => ({
        ...p,
        recent: [...p.recent, replacement].slice(-15),
        game: {
          ...p.game!,
          photoIds: p.game!.photoIds.map((id, i) =>
            i === roundIndex ? replacement : id,
          ),
        },
      }));
  }
  async function copyResults() {
    if (!game) return;
    try {
      await navigator.clipboard.writeText(shareResults(game.answers));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopyText(true);
    }
  }
  const activeGame = game && game.phase !== "results";

  return (
    <div
      className={`site-shell ${screen === "home" ? "home-shell" : "play-shell"}`}
    >
      <header className="site-header">
        <button
          className="brand"
          onClick={() => setScreen("home")}
          aria-label="Time Traveler home"
        >
          <TimeMark />
          <span>TIME TRAVELER</span>
        </button>
        {screen === "game" && game?.phase !== "results" && game && (
          <div className="header-game-status">
            <span className="header-round">
              ROUND <strong>{String(roundIndex + 1).padStart(2, "0")}</strong> /
              05
            </span>
            <span className="header-score">
              <strong>{number(score)}</strong> <span>POINTS</span>
            </span>
          </div>
        )}
        <button className="help-button" onClick={() => setModal("help")}>
          <span>How to play</span>
          <span className="question-mark">?</span>
        </button>
      </header>

      {screen === "home" ? (
        <HomeScreen
          photos={photos}
          ready={ready}
          resume={!!activeGame}
          onStart={start}
          onResume={() => setScreen("game")}
        />
      ) : game?.phase === "results" ? (
        <ResultsScreen
          game={game}
          photos={photos}
          best={progress.best}
          copied={copied}
          copyText={copyText}
          headingRef={heading}
          onStart={start}
          onCopy={copyResults}
        />
      ) : photo && game ? (
        <main className="game-main">
          <PhotoFrame
            key={photo.id}
            photo={photo}
            revealed={game.phase === "reveal"}
            onExpand={() => setModal("photo")}
            onUnavailable={replacePhoto}
            onReady={setLoadedPhotoId}
          />
          <div className="photo-meta">
            <span>
              PHOTOGRAPH {String(roundIndex + 1).padStart(2, "0")} / 05
            </span>
            <span>
              {result ? photo.category : "Look closer. Every detail is a clue."}
            </span>
          </div>
          {result ? (
            <section className="reveal-panel scene-enter" aria-live="polite">
              <div className="reveal-main">
                <div>
                  <span className="eyebrow">IT WAS</span>
                  <h1 ref={heading} tabIndex={-1} className="revealed-year">
                    {photo.year}
                    <span>.</span>
                  </h1>
                </div>
                <div className="reveal-reaction">
                  <h2>{revealMessage(result.guess, photo.year)}</h2>
                  <p>
                    You guessed <strong>{result.guess}</strong>
                  </p>
                  <div className="round-score">
                    +{number(result.points)}
                    <span> POINTS</span>
                  </div>
                </div>
                <button className="primary-button" onClick={next}>
                  {game.answers.length === 5
                    ? "SEE YOUR RESULTS"
                    : "NEXT PHOTO"}
                  <Arrow />
                </button>
              </div>
              <div className="reveal-story">
                <div>
                  <h3>{photo.title}</h3>
                  <p>{photo.fact}</p>
                </div>
                <div className="attribution">
                  <a
                    href={photo.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="source-link"
                  >
                    VIEW ORIGINAL PHOTOGRAPH <Arrow diagonal />
                  </a>
                  <span>
                    {photo.creator} ·{" "}
                    <a
                      href={photo.licenseUrl ?? photo.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {photo.license}
                    </a>
                  </span>
                </div>
              </div>
            </section>
          ) : (
            <section className="guess-panel" ref={controls}>
              <div className="guess-heading">
                <div>
                  <h1 ref={heading} tabIndex={-1}>
                    What year was this taken?
                  </h1>
                </div>
                <div className="year-entry">
                  <button
                    className="year-step"
                    aria-label="One year earlier"
                    onClick={() =>
                      updateGame((g) => ({
                        ...g,
                        guess: clampYear(g.guess - 1),
                      }))
                    }
                    disabled={game.guess === MIN_YEAR}
                  >
                    −
                  </button>
                  <input
                    aria-label="Your year guess"
                    type="number"
                    inputMode="numeric"
                    min={MIN_YEAR}
                    max={MAX_YEAR}
                    value={yearDraft ?? game.guess}
                    onChange={(e) => {
                      setYearDraft(e.target.value);
                      const y = e.target.valueAsNumber;
                      if (y >= MIN_YEAR && y <= MAX_YEAR)
                        updateGame((g) => ({ ...g, guess: clampYear(y) }));
                    }}
                    onBlur={() => {
                      if (yearDraft !== null && yearDraft.trim())
                        updateGame((g) => ({
                          ...g,
                          guess: clampYear(Number(yearDraft)),
                        }));
                      setYearDraft(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        lock();
                      }
                    }}
                    onFocus={(e) => {
                      setYearDraft(String(game.guess));
                      e.target.select();
                    }}
                  />
                  <button
                    className="year-step"
                    aria-label="One year later"
                    onClick={() =>
                      updateGame((g) => ({
                        ...g,
                        guess: clampYear(g.guess + 1),
                      }))
                    }
                    disabled={game.guess === MAX_YEAR}
                  >
                    +
                  </button>
                </div>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  lock();
                }}
              >
                <div
                  className="slider-container"
                  style={
                    {
                      "--position": `${((game.guess - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100}%`,
                    } as CSSProperties
                  }
                >
                  <div className="slider-ruler" />
                  <input
                    className="year-slider"
                    aria-label="Choose the year"
                    aria-valuetext={String(game.guess)}
                    type="range"
                    min={MIN_YEAR}
                    max={MAX_YEAR}
                    step="1"
                    value={game.guess}
                    onChange={(e) =>
                      updateGame((g) => ({
                        ...g,
                        guess: Number(e.target.value),
                      }))
                    }
                  />
                  <div className="slider-labels" aria-hidden="true">
                    {[1900, 1920, 1940, 1960, 1980, 2000, 2020].map((y) => (
                      <span key={y}>{y}</span>
                    ))}
                  </div>
                </div>
                <div className="guess-bottom">
                  <p>
                    Drag the timeline{" "}
                    <span>or type a year. ← → to fine-tune.</span>
                  </p>
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={loadedPhotoId !== photo.id}
                  >
                    LOCK IN YEAR
                    <Arrow />
                  </button>
                </div>
              </form>
            </section>
          )}
        </main>
      ) : null}

      <footer className="site-footer">
        <span>A LITTLE CURIOSITY. A DIFFERENT CENTURY.</span>
        <button className="text-link" onClick={() => setModal("credits")}>
          The photo archive <Arrow diagonal />
        </button>
        <span className="footer-edition">1900 — 2020</span>
      </footer>

      <dialog
        ref={dialog}
        aria-label={
          modal === "photo"
            ? "Inspect photograph"
            : modal === "help"
              ? "How to play Time Traveler"
              : "Photograph credits and sources"
        }
        className={modal === "photo" ? "lightbox-dialog" : "info-dialog"}
        onCancel={() => setModal(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setModal(null);
        }}
        onClose={() => setModal(null)}
      >
        <button
          className="dialog-close"
          aria-label="Close dialog"
          onClick={() => setModal(null)}
        >
          ×
        </button>
        {modal === "help" && (
          <div className="dialog-content">
            <Asterisk />
            <span className="eyebrow">A SHORT FIELD GUIDE</span>
            <h2>
              A little detective work.
              <br />A little time travel.
            </h2>
            <ol className="help-steps">
              <li>
                <span>01</span>
                <div>
                  <h3>Look closer.</h3>
                  <p>
                    Five real photographs. Look for clues in the cars, clothes,
                    architecture, and everyday details.
                  </p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <h3>Find your year.</h3>
                  <p>
                    Slide from 1900 to 2020, tap the year to type, or use your
                    arrow keys. There’s no ticking clock.
                  </p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <h3>Make the leap.</h3>
                  <p>
                    Lock in your guess. The closer you are, the more you earn.
                    An exact year is worth 1,000 points.
                  </p>
                </div>
              </li>
            </ol>
            <button className="primary-button" onClick={() => setModal(null)}>
              Got it. Let’s travel.
              <Arrow />
            </button>
          </div>
        )}
        {modal === "credits" && (
          <div className="dialog-content credits-content">
            <span className="eyebrow">THE PEOPLE BEHIND THE PICTURES</span>
            <h2>
              History, with its
              <br />
              sources intact.
            </h2>
            <p>
              These {photos.length} photographs come from public archives and
              openly licensed collections. Capture years and rights are checked
              against the source records. Every reveal links to the original.
            </p>
            <div className="credit-list">
              {photos.map((p) => (
                <a
                  key={p.id}
                  href={p.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <div>
                    <strong>{p.title}</strong>
                    <span>
                      {p.creator} · {p.license}
                    </span>
                  </div>
                  <span>
                    {p.year}
                    <Arrow diagonal />
                  </span>
                </a>
              ))}
            </div>
            <p className="credits-note">
              Original photographs are preserved without colorization or
              generated details. Images may be resized for the web. Home-page
              prints use cropped previews; game photographs display in full.
            </p>
          </div>
        )}
        {modal === "photo" && photo && (
          <div className="lightbox-content">
            <img
              src={photo.src}
              alt={
                game?.phase === "reveal"
                  ? photo.title
                  : "Enlarged historical photograph for close inspection"
              }
              width={photo.width}
              height={photo.height}
            />
            <p>Take your time. The little details tell the story.</p>
          </div>
        )}
      </dialog>
    </div>
  );
}
