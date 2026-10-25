export const ROUND_COUNT = 5;
export const GAME_MODES = {
  classic: { name: "Classic", rounds: 5 },
  tour: { name: "Grand Tour", rounds: 12 },
} as const;
export type GameMode = keyof typeof GAME_MODES;
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
  mode?: GameMode;
  photoIds: string[];
  answers: Answer[];
  guess: number;
  phase: "guess" | "reveal" | "results";
};
export type Progress = {
  version: 1;
  best: number;
  tourBest?: number;
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
  roundCount = ROUND_COUNT,
): string[] {
  const distinct = [...new Map(photos.map((p) => [p.id, p])).values()];
  const selected: PhotoChoice[] = [];
  const recentOrder = new Map(recent.map((id, i) => [id, i]));
  const decade = (p: PhotoChoice) => Math.floor((p.year ?? 1960) / 10);
  const pick = <T,>(items: T[]) =>
    items[Math.floor(Math.max(0, Math.min(0.999999999, random())) * items.length)];
  let remaining = [...distinct];
  while (remaining.length && selected.length < roundCount) {
    let pool = remaining;
    // Pick an era first, then a year, then a photograph. Large collections
    // (e.g. 45 photos from 1975) must not buy a larger share of the timeline.
    const decades = [...new Set(pool.map(decade))];
    const count = (d: number) => selected.filter((p) => decade(p) === d).length;
    const least = Math.min(...decades.map(count));
    let eligible = decades.filter((d) => count(d) === least);
    const needsSubject = selected.length === roundCount - 1 &&
      selected.length > 1 &&
      selected.every((p) => p.category && p.category === selected[0].category);
    if (needsSubject) {
      const varied = eligible.filter((d) => pool.some(
        (p) => decade(p) === d && p.category !== selected[0].category,
      ));
      if (varied.length) eligible = varied;
    }
    const chosenDecade = pick(eligible);
    pool = pool.filter((p) => decade(p) === chosenDecade);
    if (needsSubject) {
      const varied = pool.filter((p) => p.category !== selected[0].category);
      if (varied.length) pool = varied;
    }
    const fresh = pool.filter((p) => !recentOrder.has(p.id));
    if (fresh.length) {
      pool = fresh;
      const newYears = pool.filter((p) => !selected.some((s) => s.year === p.year));
      if (newYears.length) pool = newYears;
      const year = pick([...new Set(pool.map((p) => p.year))]);
      pool = pool.filter((p) => p.year === year);
    } else {
      // Revisit the oldest photo in an exhausted era instead of letting the
      // abundant decades take over once the smaller collections are seen.
      pool = [pool.reduce((oldest, p) =>
        recentOrder.get(p.id)! < recentOrder.get(oldest.id)! ? p : oldest,
      )];
    }
    const weights = pool.map((p) => {
      const repeats = (key: "category" | "region" | "difficulty") =>
        p[key] && p[key] !== "Unspecified"
          ? selected.filter((s) => s[key] === p[key]).length : 0;
      return (0.7 + Math.max(0, Math.min(1, p.quality ?? 0.8)) * 0.3) /
        ((1 + 5 * repeats("category")) *
          (1 + 2 * repeats("region")) * (1 + repeats("difficulty")));
    });
    let target = Math.max(0, Math.min(0.999999999, random())) *
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
    remaining = remaining.filter((p) => p.id !== chosen.id);
  }
  return selected.map((p) => p.id);
}
export function gameMode(game: Game): GameMode {
  return game.mode ?? "classic";
}
export function newGame(
  photos: Photo[], recent: string[], mode: GameMode = "classic",
): Game {
  return {
    mode,
    photoIds: selectPhotos(photos, recent, Math.random, GAME_MODES[mode].rounds),
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
  if (game.answers.length === game.photoIds.length) {
    return {
      ...progress,
      ...(gameMode(game) === "tour"
        ? { tourBest: Math.max(progress.tourBest ?? 0, totalScore(game.answers)) }
        : { best: Math.max(progress.best, totalScore(game.answers)) }),
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
  mode: GameMode = "classic",
): Progress {
  const game = newGame(photos, progress.recent, mode);
  return {
    ...progress,
    game,
    recent: [...progress.recent, ...game.photoIds].slice(
      -Math.max(1, Math.min(RECENT_LIMIT, catalogSize - game.photoIds.length)),
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
export function performance(score: number, maximum = 5000) {
  score = score / maximum * 5000;
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
export function shareResults(answers: Answer[], mode: GameMode = "classic") {
  return `TIME TRAVELER · ${GAME_MODES[mode].name}\n${totalScore(answers).toLocaleString("en-US")} / ${(answers.length * 1000).toLocaleString("en-US")} points\n\n${answers.map((a, i) => `${i + 1}. ${a.guess} → ${a.actual} · ${a.points} pts`).join("\n")}\n\nOne photo. One guess. Travel through time.`;
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
      (value.tourBest !== undefined && (!Number.isInteger(value.tourBest) || value.tourBest < 0 || value.tourBest > 12000)) ||
      !Number.isInteger(value.played) ||
      value.played < 0 ||
      !Array.isArray(value.recent)
    )
      return { ...EMPTY_PROGRESS };
    const ids = new Set(photos.map((p) => p.id));
    const clean: Progress = {
      ...EMPTY_PROGRESS,
      best: value.best,
      ...(value.tourBest !== undefined ? { tourBest: value.tourBest } : {}),
      played: value.played,
      recent: value.recent
        .filter((id) => typeof id === "string" && ids.has(id))
        .slice(-RECENT_LIMIT),
    };
    const g = value.game;
    if (!g) return clean;
    if (g.mode !== undefined && g.mode !== "classic" && g.mode !== "tour") return clean;
    const rounds = GAME_MODES[gameMode(g)].rounds;
    if (
      !Array.isArray(g.photoIds) ||
      g.photoIds.length !== rounds ||
      new Set(g.photoIds).size !== rounds ||
      !g.photoIds.every((id) => ids.has(id)) ||
      !["guess", "reveal", "results"].includes(g.phase) ||
      !Number.isInteger(g.guess) ||
      g.guess < MIN_YEAR ||
      g.guess > MAX_YEAR ||
      !Array.isArray(g.answers) ||
      g.answers.length > rounds
    )
      return clean;
    if (
      (g.phase === "guess" && g.answers.length >= rounds) ||
      (g.phase === "reveal" && g.answers.length === 0) ||
      (g.phase === "results" && g.answers.length !== rounds)
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
