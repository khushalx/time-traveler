import test from "node:test";
import { readFileSync, statSync } from "node:fs";
import assert from "node:assert/strict";
import {
  clampYear,
  EMPTY_PROGRESS,
  parseProgress,
  revealMessage,
  scoreGuess,
  selectPhotos,
  shareResults,
  totalScore,
  type Photo,
} from "./game.ts";

const photos: Photo[] = Array.from({ length: 25 }, (_, i) => ({
  id: `photo-${i}`,
  src: `/photos/${i}.webp`,
  year: 1900 + i,
  title: `Photo ${i}`,
  fact: "Fact",
  sourceUrl: "https://example.org",
  creator: "Archive",
  license: "Public domain",
  category: "Everyday life",
  width: 1000,
  height: 750,
}));

test("the curated archive contains 20+ complete, unique entries and real local WebP files", () => {
  const bank = JSON.parse(
    readFileSync(new URL("../data/photos.json", import.meta.url), "utf8"),
  ) as Photo[];
  assert.ok(bank.length >= 20);
  assert.equal(new Set(bank.map((p) => p.id)).size, bank.length);
  for (const p of bank) {
    for (const key of [
      "id",
      "src",
      "title",
      "fact",
      "sourceUrl",
      "creator",
      "license",
      "category",
    ] as const)
      assert.ok(p[key].length > 0, `${p.id}: missing ${key}`);
    assert.ok(Number.isInteger(p.year) && p.year >= 1900 && p.year <= 2020);
    assert.equal(new URL(p.sourceUrl).protocol, "https:");
    assert.ok(p.width >= 600 && p.height >= 500);
    const asset = new URL(`../../public${p.src}`, import.meta.url);
    assert.ok(
      statSync(asset).size > 10000,
      `${p.id}: image is unexpectedly small`,
    );
    const header = readFileSync(asset).subarray(0, 12);
    assert.equal(header.subarray(0, 4).toString(), "RIFF");
    assert.equal(header.subarray(8, 12).toString(), "WEBP");
  }
});

test("scoring uses the exact exponential curve, is symmetric, and awards 1000 only for an exact year", () => {
  assert.equal(scoreGuess(1960, 1960), 1000);
  for (let distance = 1; distance <= 120; distance++) {
    assert.equal(
      scoreGuess(1900, 1900 + distance),
      Math.round(1000 * Math.exp(-distance / 18)),
    );
    assert.equal(
      scoreGuess(1900, 1900 + distance),
      scoreGuess(1900 + distance, 1900),
    );
    assert.ok(scoreGuess(1900, 1900 + distance) < 1000);
  }
  assert.equal(
    totalScore(
      Array.from({ length: 5 }, () => ({
        photoId: "x",
        guess: 1960,
        actual: 1960,
        points: 1000,
      })),
    ),
    5000,
  );
});
test("five distinct photos avoid recent rounds, then choose the oldest seen", () => {
  const selected = selectPhotos(
    photos,
    photos.slice(0, 15).map((p) => p.id),
  );
  assert.equal(selected.length, 5);
  assert.equal(new Set(selected).size, 5);
  assert.ok(
    selected.every((id) => !photos.slice(0, 15).some((p) => p.id === id)),
  );
  const recent = photos.map((p) => p.id);
  assert.deepEqual(selectPhotos(photos, recent), recent.slice(0, 5));
});
test("year input is finite and bounded", () => {
  assert.equal(clampYear(1800), 1900);
  assert.equal(clampYear(2200), 2020);
  assert.equal(clampYear(NaN), 1960);
  assert.equal(clampYear(1984.7), 1985);
});
test("reveals distinguish exact, near, early, and late guesses", () => {
  assert.equal(revealMessage(1945, 1945), "Right on the money.");
  assert.equal(revealMessage(1944, 1945), "Only 1 year away.");
  assert.equal(revealMessage(1942, 1945), "Only 3 years away.");
  assert.equal(revealMessage(1927, 1945), "You were 18 years too early.");
  assert.equal(revealMessage(1963, 1945), "You were 18 years too late.");
});
test("saved partial game restores with validated scores and order", () => {
  const game = {
    photoIds: photos.slice(0, 5).map((p) => p.id),
    answers: [
      {
        photoId: "photo-0",
        guess: 1910,
        actual: 1900,
        points: scoreGuess(1910, 1900),
      },
    ],
    guess: 1910,
    phase: "reveal",
  };
  const saved = {
    version: 1,
    best: 1234,
    played: 2,
    recent: game.photoIds,
    game,
  };
  assert.deepEqual(parseProgress(JSON.stringify(saved), photos), saved);
});
test("corrupt, outdated, removed, and tampered sessions recover without crashing", () => {
  for (const raw of [
    null,
    "not json",
    "null",
    JSON.stringify({ version: 999 }),
    JSON.stringify({ ...EMPTY_PROGRESS, best: 99999 }),
  ])
    assert.deepEqual(parseProgress(raw, photos), EMPTY_PROGRESS);
  const base = {
    ...EMPTY_PROGRESS,
    best: 1200,
    game: {
      photoIds: photos.slice(0, 5).map((p) => p.id),
      answers: [{ photoId: "photo-0", guess: 1900, actual: 1900, points: 999 }],
      guess: 1900,
      phase: "reveal",
    },
  };
  const restored = parseProgress(JSON.stringify(base), photos);
  assert.equal(restored.game, null);
  assert.equal(restored.best, 1200);
  base.game.photoIds[0] = "removed";
  assert.equal(parseProgress(JSON.stringify(base), photos).game, null);
});
test("results sharing includes score and every answer", () => {
  const answers = Array.from({ length: 5 }, (_, i) => ({
    photoId: `photo-${i}`,
    guess: 1900 + i,
    actual: 1900 + i,
    points: 1000,
  }));
  const text = shareResults(answers);
  assert.match(text, /5,000 \/ 5,000 points/);
  assert.match(text, /5\. 1904 → 1904 · 1000 pts/);
});
