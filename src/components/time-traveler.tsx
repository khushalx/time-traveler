"use client";

/* Local, pre-optimized archive files use native images for controlled contain sizing and offline-friendly loading. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import rawPhotos from "@/data/photos.json";
import { Asterisk, Arrow, Expand } from "./icons";
import {
  ROUND_COUNT,
  MIN_YEAR,
  MAX_YEAR,
  EMPTY_PROGRESS,
  clampYear,
  newGame,
  parseProgress,
  performance,
  revealMessage,
  scoreGuess,
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
    <div className={`photo-frame ${status === "loaded" ? "is-loaded" : ""}`}>
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
      <span className="print-corner corner-tl" />
      <span className="print-corner corner-br" />
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
    setProgress((p) => {
      const g = newGame(photos, p.recent);
      return {
        ...p,
        game: g,
        recent: [...p.recent, ...g.photoIds].slice(
          -Math.min(20, photos.length - ROUND_COUNT),
        ),
      };
    });
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
    updateGame((g) => ({
      ...g,
      guess,
      phase: "reveal",
      answers: [
        ...g.answers,
        {
          photoId: photo.id,
          guess,
          actual: photo.year,
          points: scoreGuess(guess, photo.year),
        },
      ],
    }));
  }
  function next() {
    if (!game || game.phase !== "reveal") return;
    if (game.answers.length === ROUND_COUNT) {
      setProgress((p) => ({
        ...p,
        best: Math.max(p.best, score),
        played: p.played + 1,
        game: { ...p.game!, phase: "results" },
      }));
    } else {
      setLoadedPhotoId(null);
      updateGame((g) => ({ ...g, phase: "guess", guess: 1960 }));
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
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
  const cover = [
    photos.find((p) => p.id === "london-1955") ?? photos[0],
    photos.find((p) => p.id === "chicago-1942") ?? photos[1],
    photos.find((p) => p.id === "fashion-1967") ?? photos[2],
  ];

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
          <Asterisk />
          <span>
            TIME TRAVELER<span className="brand-period">™</span>
          </span>
        </button>
        <span className="header-note">A GAME OF THEN & NOW</span>
        <button className="help-button" onClick={() => setModal("help")}>
          <span>How to play</span>
          <span className="question-mark">?</span>
        </button>
      </header>

      {screen === "home" ? (
        <main className="home-main">
          <section className="home-hero" aria-labelledby="home-title">
            <div className="home-copy">
              <div className="eyebrow">
                <span className="red-line" /> THE PAST IS A PLACE. TAKE A GUESS.
              </div>
              <h1 id="home-title">
                TIME
                <br />
                <span>TRAVELER</span>
                <span className="title-star" aria-hidden="true">
                  ✳
                </span>
              </h1>
              <h2>How well do you know the past?</h2>
              <p className="home-description">
                One photo. One guess.
                <br className="mobile-break" /> Travel through time.
              </p>
              <button
                className="primary-button start-button"
                onClick={activeGame ? () => setScreen("game") : start}
                disabled={!ready}
              >
                {activeGame ? "Continue your trip" : "Start playing"}
                <Arrow />
              </button>
              {activeGame && (
                <button className="new-trip-link text-link" onClick={start}>
                  Or start a new trip
                </button>
              )}
              <div className="game-promise">
                <span>5 PHOTOS</span>
                <span className="promise-dot" />
                <span>NO TIME LIMIT</span>
                <span className="promise-dot" />
                <span>JUST YOUR INSTINCT</span>
              </div>
            </div>
            <div
              className="home-archive"
              aria-label="A glimpse into the photographic archive"
            >
              <div className="archive-topline">
                <span>FROM THE ARCHIVE</span>
                <span>
                  VOL. 001 <span className="small-cross">+</span>
                </span>
              </div>
              <div className="photo-collage">
                <figure className="archive-print print-back">
                  <img
                    src={cover[2].src}
                    alt={cover[2].title}
                    width={cover[2].width}
                    height={cover[2].height}
                    loading="eager"
                  />
                  <figcaption>
                    <span>A MOMENT, PRESERVED.</span>
                    <span>03 / TT</span>
                  </figcaption>
                </figure>
                <figure className="archive-print print-main">
                  <img
                    src={cover[0].src}
                    alt={cover[0].title}
                    width={cover[0].width}
                    height={cover[0].height}
                    fetchPriority="high"
                  />
                  <figcaption>
                    <span>EVERY PICTURE HAS A WHEN.</span>
                    <span>01 / TT</span>
                  </figcaption>
                </figure>
                <figure className="archive-print print-front">
                  <img
                    src={cover[1].src}
                    alt={cover[1].title}
                    width={cover[1].width}
                    height={cover[1].height}
                    loading="eager"
                  />
                  <figcaption>
                    <span>WISH YOU WERE THEN.</span>
                    <span>02 / TT</span>
                  </figcaption>
                </figure>
                <div className="archive-stamp">
                  <span>
                    LOOK
                    <br />
                    CLOSER.
                  </span>
                  <Arrow diagonal />
                </div>
              </div>
              <p className="archive-footnote">
                Real photographs. Remarkable little moments.
              </p>
            </div>
          </section>
          <section
            className="home-timeline"
            aria-label="Photographic history from 1900 to 2020"
          >
            <div className="timeline-intro">
              <span>120 YEARS.</span>
              <span>COUNTLESS STORIES.</span>
            </div>
            <div className="era-line">
              <div className="era-ticks" />
              {[1900, 1920, 1940, 1960, 1980, 2000, 2020].map((y) => (
                <span key={y} className={y === 1960 ? "highlight-era" : ""}>
                  {y}
                </span>
              ))}
            </div>
            <span className="timeline-end">
              <Arrow />
            </span>
          </section>
          <div className="home-lower">
            <p>A little curiosity goes a long way. Backwards, mostly.</p>
            <span>{photos.length} PHOTOGRAPHS & COUNTING</span>
          </div>
        </main>
      ) : game?.phase === "results" ? (
        <main className="results-main scene-enter">
          <div className="eyebrow">
            <span className="red-line" /> YOUR TRIP, IN RETROSPECT
          </div>
          <h1 ref={heading} tabIndex={-1}>
            {performance(score)[0]}
          </h1>
          <p className="results-description">{performance(score)[1]}</p>
          <div className="final-score">
            <span>{number(score)}</span>
            <span>/ 5,000</span>
          </div>
          <div className="best-line">
            <span>
              {score > 0 && score >= progress.best
                ? "A PERSONAL BEST"
                : "YOUR PERSONAL BEST"}
            </span>
            <span>
              {number(progress.best)} <span>PTS</span>
            </span>
          </div>
          <div
            className="round-table"
            role="table"
            aria-label="Your five-round results"
          >
            <div className="table-heading" role="row">
              <span role="columnheader">THE PHOTOGRAPH</span>
              <span role="columnheader">YOUR GUESS</span>
              <span role="columnheader">ACTUAL YEAR</span>
              <span role="columnheader">POINTS</span>
            </div>
            {game.answers.map((answer, i) => {
              const p = photos.find((p) => p.id === answer.photoId)!;
              return (
                <div className="table-row" role="row" key={answer.photoId}>
                  <div className="table-photo" role="rowheader">
                    <span className="row-index">0{i + 1}</span>
                    <img
                      src={p.src}
                      alt=""
                      width="72"
                      height="48"
                      loading="lazy"
                    />
                    <span>{p.title}</span>
                  </div>
                  <span role="cell">{answer.guess}</span>
                  <span role="cell" className="actual-table">
                    {answer.actual}
                  </span>
                  <span role="cell">{number(answer.points)}</span>
                </div>
              );
            })}
          </div>
          <div className="results-actions">
            <button className="primary-button" onClick={start}>
              Play again <Arrow />
            </button>
            <button className="secondary-button" onClick={copyResults}>
              {copied ? "Copied to clipboard" : "Copy results"}
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <rect
                  x="8"
                  y="8"
                  width="12"
                  height="13"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path d="M15 4H4v12" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          </div>
          {copyText && (
            <div className="copy-fallback">
              <label htmlFor="share-text">Select and copy your results:</label>
              <textarea
                id="share-text"
                readOnly
                value={shareResults(game.answers)}
                onFocus={(e) => e.target.select()}
                autoFocus
              />
            </div>
          )}
          <p className="results-postscript">
            Same curiosity. A whole different century. Go again?
          </p>
        </main>
      ) : photo && game ? (
        <main className="game-main">
          <div className="game-status">
            <div className="round-label">
              <span>
                ROUND <strong>0{roundIndex + 1}</strong>
                <span className="round-of"> / 05</span>
              </span>
              <div
                className="round-dots"
                aria-label={`Round ${roundIndex + 1} of 5`}
              >
                {Array.from({ length: 5 }, (_, i) => (
                  <span
                    key={i}
                    className={`${i < game.answers.length ? "complete" : ""} ${i === roundIndex ? "current" : ""}`}
                  />
                ))}
              </div>
            </div>
            <div className="total-points">
              <span>TOTAL POINTS</span>
              <strong>
                {number(score).padStart(1, "0")}
                <span> / 5,000</span>
              </strong>
            </div>
          </div>
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
              {game.phase === "reveal"
                ? photo.category.toUpperCase()
                : "THE CLUES ARE IN THE DETAILS."}
            </span>
          </div>
          {result ? (
            <section className="reveal-panel scene-enter" aria-live="polite">
              <div className="reveal-main">
                <div>
                  <span className="eyebrow">THE YEAR WAS</span>
                  <h1 ref={heading} tabIndex={-1} className="revealed-year">
                    {photo.year}
                    <span>.</span>
                  </h1>
                </div>
                <div className="reveal-reaction">
                  <h2>{revealMessage(result.guess, photo.year)}</h2>
                  <p>
                    Your guess: <strong>{result.guess}</strong>
                  </p>
                  <div className="round-score">
                    +{number(result.points)}
                    <span> / 1,000 PTS</span>
                  </div>
                </div>
                <button className="primary-button" onClick={next}>
                  {game.answers.length === 5
                    ? "See your results"
                    : "Next photo"}
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
                  <span className="eyebrow">TRUST YOUR INSTINCT</span>
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
                    Slide through time.<span> Use ← → to fine-tune.</span>
                  </p>
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={loadedPhotoId !== photo.id}
                  >
                    Lock in year
                    <Arrow />
                  </button>
                </div>
              </form>
            </section>
          )}
        </main>
      ) : null}

      <footer className="site-footer">
        <span>FOR THE CURIOUS. FROM THE PAST.</span>
        <button className="text-link" onClick={() => setModal("credits")}>
          The photo archive <Arrow diagonal />
        </button>
        <span className="footer-edition">
          EST. 2026 <span className="small-cross">+</span>
        </span>
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
