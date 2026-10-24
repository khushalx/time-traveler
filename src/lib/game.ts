export const ROUND_COUNT = 5;
export const MIN_YEAR = 1900;
export const MAX_YEAR = 2020;
export const RECENT_LIMIT = 250;

export type Photo = {
  id: string;
  src: string;
  year: number;
  title: string;
  fact: string;
  sourceUrl: string;
  creator: string;
  license: string;
  licenseUrl?: string;
  category: string;
  width: number;
  height: number;
  thumbnailSrc?: string;
  srcSet?: string;
  sourceName?: string;
  region?: string;
  location?: string;
  difficulty?: "easy" | "medium" | "hard";
  quality?: number;
  dateEvidence?: string;
  yearConfidence?: "verified";
  modifications?: string;
};
export type PhotoChoice = Pick<Photo, "id"> &
  Partial<
    Pick<Photo, "year" | "category" | "region" | "difficulty" | "quality">
  >;
export type Answer = {
  photoId: string;
  guess: number;
  actual: number;
  points: number;
};
export type Game = {
  photoIds: string[];
  answers: Answer[];
  guess: number;
  phase: "guess" | "reveal" | "results";
};
export type Progress = {
  version: 1;
  best: number;
  played: number;
  recent: string[];
  game: Game | null;
};
export const EMPTY_PROGRESS: Progress = {
  version: 1,
  best: 0,
  played: 0,
  recent: [],
  game: null,
};

export function scoreGuess(guess: number, actual: number) {
  return Math.round(1000 * Math.exp(-Math.abs(guess - actual) / 18));
}
export function totalScore(answers: Answer[]) {
  return answers.reduce((sum, a) => sum + a.points, 0);
}
export function clampYear(year: number) {
  return Math.max(
    MIN_YEAR,
    Math.min(MAX_YEAR, Math.round(Number.isFinite(year) ? year : 1960)),
  );
}

export function selectPhotos(
  photos: PhotoChoice[],
  recent: string[],
  random = Math.random,
): string[] {
  const seen = new Set(recent);
  const distinct = [...new Map(photos.map((p) => [p.id, p])).values()];
  const fresh = distinct.filter((p) => !seen.has(p.id));
  const selected: PhotoChoice[] = [];
  while (fresh.length && selected.length < ROUND_COUNT) {
    // Prefer a new subject, decade, region and difficulty when supplied. Apply
    // a soft quality preference without starving smaller archive collections.
    const weight = (p: PhotoChoice) => {
      const count = (key: "category" | "region" | "difficulty") =>
        p[key] && p[key] !== "Unspecified"
          ? selected.filter((s) => s[key] === p[key]).length
          : 0;
      const decadeCount = p.year
        ? selected.filter(
            (s) =>
              s.year && Math.floor(s.year / 10) === Math.floor(p.year! / 10),
          ).length
        : 0;
      return (
        (0.7 + Math.max(0, Math.min(1, p.quality ?? 0.8)) * 0.3) /
        ((1 + 5 * count("category")) *
          (1 + 4 * decadeCount) *
          (1 + 2 * count("region")) *
          (1 + count("difficulty")))
      );
    };
    let pool = fresh;
    // Hard guard against five of one subject whenever another is available.
    if (
      selected.length === ROUND_COUNT - 1 &&
      selected.every((p) => p.category && p.category === selected[0].category)
    ) {
      const varied = fresh.filter((p) => p.category !== selected[0].category);
      if (varied.length) pool = varied;
    }
    const weights = pool.map(weight);
    let target =
      Math.max(0, Math.min(0.999999999, random())) *
      weights.reduce((a, b) => a + b, 0);
    let chosen = pool[pool.length - 1];
    for (let i = 0; i < pool.length; i++) {
      target -= weights[i];
      if (target < 0) {
        chosen = pool[i];
        break;
      }
    }
    selected.push(chosen);
    fresh.splice(fresh.indexOf(chosen), 1);
  }
  // If the archive is nearly exhausted, use the least recently seen photographs first.
  const old = distinct
    .filter((p) => recent.includes(p.id))
    .map((p) => p.id)
    .sort((a, b) => recent.indexOf(a) - recent.indexOf(b));
  return [...selected.map((p) => p.id), ...old].slice(0, ROUND_COUNT);
}
export function newGame(photos: Photo[], recent: string[]): Game {
  return {
    photoIds: selectPhotos(photos, recent),
    answers: [],
    guess: 1960,
    phase: "guess",
  };
}

/** A state-level guard makes repeated clicks or queued submissions idempotent. */
export function submitGuess(game: Game, photo: Photo, year: number): Game {
  if (game.phase !== "guess" || game.photoIds[game.answers.length] !== photo.id)
    return game;
  const guess = clampYear(year);
  return {
    ...game,
    guess,
    phase: "reveal",
    answers: [
      ...game.answers,
      {
        photoId: photo.id,
        guess,
        actual: photo.year,
        points: scoreGuess(guess, photo.year),
      },
    ],
  };
}

export function advanceRound(progress: Progress): Progress {
  const game = progress.game;
  if (!game || game.phase !== "reveal") return progress;
  if (game.answers.length === ROUND_COUNT) {
    return {
      ...progress,
      best: Math.max(progress.best, totalScore(game.answers)),
      played: progress.played + 1,
      game: { ...game, phase: "results" },
    };
  }
  return { ...progress, game: { ...game, phase: "guess", guess: 1960 } };
}

export function beginTrip(
  progress: Progress,
  photos: Photo[],
  catalogSize = photos.length,
): Progress {
  const game = newGame(photos, progress.recent);
  return {
    ...progress,
    game,
    recent: [...progress.recent, ...game.photoIds].slice(
      -Math.max(1, Math.min(RECENT_LIMIT, catalogSize - ROUND_COUNT)),
    ),
  };
}
export function revealMessage(guess: number, actual: number) {
  const distance = Math.abs(guess - actual);
  if (distance === 0) return "Right on the money.";
  if (distance <= 5)
    return `Only ${distance} ${distance === 1 ? "year" : "years"} away.`;
  return `You were ${distance} years too ${guess < actual ? "early" : "late"}.`;
}
export function performance(score: number) {
  if (score >= 4500)
    return [
      "YOU BELONG IN ANOTHER ERA.",
      "An extraordinary eye for the past. Time travel suits you.",
    ];
  if (score >= 3500)
    return [
      "AN OLD SOUL. A SHARP EYE.",
      "You know your way around the last century.",
    ];
  if (score >= 2000)
    return [
      "A LITTLE LOST IN TIME.",
      "A few detours. A few discoveries. A journey well spent.",
    ];
  return [
    "THE PAST IS FULL OF SURPRISES.",
    "Every photograph is a new place to start. Take another trip.",
  ];
}
export function shareResults(answers: Answer[]) {
  return `TIME TRAVELER\n${totalScore(answers).toLocaleString("en-US")} / 5,000 points\n\n${answers.map((a, i) => `${i + 1}. ${a.guess} → ${a.actual} · ${a.points} pts`).join("\n")}\n\nOne photo. One guess. Travel through time.`;
}

export function parseProgress(
  raw: string | null,
  photos: Pick<Photo, "id" | "year">[],
): Progress {
  if (!raw) return { ...EMPTY_PROGRESS };
  try {
    const value = JSON.parse(raw) as Progress;
    if (
      value.version !== 1 ||
      !Number.isInteger(value.best) ||
      value.best < 0 ||
      value.best > 5000 ||
      !Number.isInteger(value.played) ||
      value.played < 0 ||
      !Array.isArray(value.recent)
    )
      return { ...EMPTY_PROGRESS };
    const ids = new Set(photos.map((p) => p.id));
    const clean: Progress = {
      ...EMPTY_PROGRESS,
      best: value.best,
      played: value.played,
      recent: value.recent
        .filter((id) => typeof id === "string" && ids.has(id))
        .slice(-RECENT_LIMIT),
    };
    const g = value.game;
    if (!g) return clean;
    if (
      !Array.isArray(g.photoIds) ||
      g.photoIds.length !== ROUND_COUNT ||
      new Set(g.photoIds).size !== ROUND_COUNT ||
      !g.photoIds.every((id) => ids.has(id)) ||
      !["guess", "reveal", "results"].includes(g.phase) ||
      !Number.isInteger(g.guess) ||
      g.guess < MIN_YEAR ||
      g.guess > MAX_YEAR ||
      !Array.isArray(g.answers) ||
      g.answers.length > ROUND_COUNT
    )
      return clean;
    if (
      (g.phase === "guess" && g.answers.length >= ROUND_COUNT) ||
      (g.phase === "reveal" && g.answers.length === 0) ||
      (g.phase === "results" && g.answers.length !== ROUND_COUNT)
    )
      return clean;
    if (
      !g.answers.every(
        (a, i) =>
          a.photoId === g.photoIds[i] &&
          Number.isInteger(a.guess) &&
          a.guess >= MIN_YEAR &&
          a.guess <= MAX_YEAR &&
          a.actual === photos.find((p) => p.id === a.photoId)?.year &&
          a.points === scoreGuess(a.guess, a.actual),
      )
    )
      return clean;
    return { ...clean, game: g };
  } catch {
    return { ...EMPTY_PROGRESS };
  }
}
