/* eslint-disable @next/next/no-img-element */
import type { Ref } from "react";
import {
  performance,
  shareResults,
  totalScore,
  gameMode,
  GAME_MODES,
  type Game,
  type Photo,
} from "@/lib/game";
import { Arrow } from "./icons";

export function ResultsScreen({
  game,
  photos,
  best,
  copied,
  copyText,
  headingRef,
  onStart,
  onChooseMode,
  onCopy,
}: {
  game: Game;
  photos: Photo[];
  best: number;
  copied: boolean;
  copyText: boolean;
  headingRef: Ref<HTMLHeadingElement>;
  onStart: () => void;
  onChooseMode: () => void;
  onCopy: () => void;
}) {
  const score = totalScore(game.answers);
  const mode = gameMode(game);
  const maximum = game.photoIds.length * 1000;
  return (
    <main className="results-main scene-enter">
      <div className="results-heading">
        <p className="eyebrow">{GAME_MODES[mode].name.toUpperCase()} · {game.photoIds.length} PHOTOGRAPHS. ONE JOURNEY.</p>
        <h1 ref={headingRef} tabIndex={-1}>
          YOU’VE BEEN
          <br />
          THROUGH TIME.
        </h1>
        <div className="final-score" aria-label={`${score} out of ${maximum} points`}>
          <span>{score.toLocaleString("en-US")}</span>
          <span>/ {maximum.toLocaleString("en-US")}</span>
        </div>
        <p className="performance-message">{performance(score, maximum)[0]}</p>
        <p className="best-line">
          {GAME_MODES[mode].name} best <strong>{best.toLocaleString("en-US")}</strong>
          <span> / {maximum.toLocaleString("en-US")}</span>
        </p>
      </div>
      <ol className={`round-reel ${mode === "tour" ? "tour-reel" : ""}`} aria-label={`Your ${game.photoIds.length}-round results`}>
        {game.answers.map((a, i) => {
          const p = photos.find((p) => p.id === a.photoId)!;
          return (
            <li className="result-round" key={a.photoId}>
              <div className="result-image">
                <img
                  src={p.thumbnailSrc ?? p.src}
                  alt={p.title}
                  width={p.width}
                  height={p.height}
                  loading="lazy"
                />
                <span>{String(i + 1).padStart(2, "0")}</span>
              </div>
              <div className="result-round-copy">
                <p className="result-title">{p.title}</p>
                <div className="result-years">
                  <span>
                    <span>ACTUAL</span>
                    <strong>{a.actual}</strong>
                  </span>
                  <span>
                    <span>YOUR GUESS</span>
                    <strong>{a.guess}</strong>
                  </span>
                </div>
                <p className="result-points">
                  +{a.points.toLocaleString("en-US")} <span>PTS</span>
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="results-actions">
        <button className="primary-button" onClick={onStart}>
          PLAY AGAIN
          <Arrow />
        </button>
        <button className="secondary-button" onClick={onCopy}>
          {copied ? "COPIED TO CLIPBOARD" : "COPY RESULTS"}
          <svg
            width="20"
            height="20"
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
      <button className="text-link choose-mode-link" onClick={onChooseMode}>Choose another journey</button>
      {copyText && (
        <div className="copy-fallback">
          <label htmlFor="share-text">Select and copy your results:</label>
          <textarea
            id="share-text"
            readOnly
            value={shareResults(game.answers, mode)}
            onFocus={(e) => e.target.select()}
            autoFocus
          />
        </div>
      )}
    </main>
  );
}
