/* eslint-disable @next/next/no-img-element */
import { GAME_MODES, type GameMode, type Photo } from "@/lib/game";
import { Arrow } from "./icons";

export function HomeScreen({
  photos,
  ready,
  mode,
  resumeMode,
  onModeChange,
  onStart,
  onResume,
}: {
  photos: Photo[];
  ready: boolean;
  mode: GameMode;
  resumeMode?: GameMode;
  onModeChange: (mode: GameMode) => void;
  onStart: () => void;
  onResume: () => void;
}) {
  const main = photos.find((p) => p.id === "london-1955") ?? photos[0];
  const second = photos.find((p) => p.id === "fashion-1967") ?? photos[1];
  const resume = resumeMode === mode;
  return (
    <main className="home-main scene-enter">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-copy">
          <p className="eyebrow">A PHOTOGRAPHIC GUESSING GAME</p>
          <h1 id="home-title">
            HOW WELL
            <br />
            DO YOU KNOW
            <br />
            <span>THE PAST?</span>
          </h1>
          <p className="home-description">
            One photograph. One guess.
            <br />
            Travel through time.
          </p>
          <fieldset className="mode-picker">
            <legend>CHOOSE YOUR JOURNEY</legend>
            {(Object.keys(GAME_MODES) as GameMode[]).map((key) => (
              <label key={key} className={`mode-option ${mode === key ? "is-selected" : ""}`}>
                <input type="radio" name="game-mode" value={key} checked={mode === key} onChange={() => onModeChange(key)} />
                <span><strong>{GAME_MODES[key].name}</strong><small>{GAME_MODES[key].rounds} photos{key === "tour" ? " · 12 decades" : " · a quick escape"}</small></span>
              </label>
            ))}
          </fieldset>
          <div className="home-actions">
            <button
              className="primary-button"
              onClick={resume ? onResume : onStart}
              disabled={!ready}
            >
              {resume ? "CONTINUE YOUR TRIP" : "START PLAYING"}
              <Arrow />
            </button>
            {resume && (
              <button className="text-link" onClick={onStart}>
                Start a new trip
              </button>
            )}
          </div>
          <p className="game-promise">
            <strong>{mode === "tour" ? "A whole century, shuffled." : "A fresh mix of eras."}</strong> No clock. Just your instinct.
          </p>
        </div>
        <div
          className="home-archive"
          aria-label="A curated collection of authentic historical photographs"
        >
          <figure className="archive-photo archive-main">
            <img
              src={main.src}
              alt={main.title}
              width={main.width}
              height={main.height}
              fetchPriority="high"
            />
            <figcaption>
              <span>LONDON, ANOTHER LIFETIME.</span>
              <span>01</span>
            </figcaption>
          </figure>
          <figure className="archive-photo archive-secondary">
            <img
              src={second.src}
              alt={second.title}
              width={second.width}
              height={second.height}
              loading="eager"
            />
            <figcaption>
              <span>EVERYDAY. EXTRAORDINARY.</span>
              <span>02</span>
            </figcaption>
          </figure>
          <p className="archive-collection">
            THE WORLD
            <br />
            <span>BEFORE YOUR TIME.</span>
          </p>
        </div>
      </section>
    </main>
  );
}
