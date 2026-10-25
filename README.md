# TIME TRAVELER

A five-photograph historical guessing game, built with Next.js App Router, TypeScript, and Tailwind CSS. No account or backend is required.

## Run locally

Requires Node.js 20.9+.

```sh
npm install
npm run prebuild
npm run dev
```

Open http://localhost:3000. `npm run build` produces a portable static site in `out/`. Serve that directory with any static host; `next start` does not serve static-export projects.

Vercel can use its standard `npm run build` command. The prebuild step automatically downloads the versioned, checksum-verified photo release when images are absent from a clean checkout. No API keys or manual photo restoration are required. Bulk images stay outside Git and are included in the exported site. See [photo library deployment](docs/photo-library.md#storage-restoration-and-deployment).

`vercel.json` uses Vercel's static/Other preset, runs the Next.js build and serves the generated `out/` directory. Serving `public/` alone includes photographs but omits `out/index.html`, causing a platform `404 NOT_FOUND` at `/` even when the build succeeds. The static preset avoids confusing `out/` with the `.next/` build metadata expected by Vercel's Next.js server adapter; this game needs no server runtime.

## Checks

```sh
npm run lint
npm test
npm run build
```

## Play

Inspect a photograph, drag the timeline or type a year from 1900–2020, and lock in your answer. Range inputs support arrow keys and Home/End. An exact answer earns 1,000 points; otherwise the score is `Math.round(1000 * Math.exp(-Math.abs(guess - actual) / 18))`. Five rounds total at most 5,000 points. Click a photograph to inspect it, then use Escape to close the view.

Best score, completed-game count, recent photograph IDs, and the current session are stored under `time-traveler-v1` in localStorage. Stored sessions are validated before use. Storage is optional: restricted private browsing still permits play. An interrupted trip can be resumed from the home screen. Recent photographs are deprioritized, and a game never contains duplicates. Unavailable photographs offer retry or a replacement without penalizing the score. Copy results uses the Clipboard API with a selectable-text fallback.

## Archive

All playable photographs are local, optimized WebP files. `src/data/photos.json` contains capture year, creator, source link, license, and reveal fact. See `docs/photo-sources.md` for provenance and rights evidence. New entries need a documented capture year (no ranges), reusable license, intact attribution, a verified fact, and visual inspection for answer-revealing dates. No AI-generated photographs or invented metadata are used. The home print collage crops its previews; game images display in full using `object-fit: contain`.

The active fonts Barlow Condensed, DM Sans, and IBM Plex Mono are self-hosted. Their SIL Open Font Licenses are included in `public/fonts/`.

## Structure

- `src/lib/game.ts`: scoring, selection, guarded submission/progression, replay, results text, and session validation; pure functions tested independently.
- `src/components/time-traveler.tsx`: single-player state, timeline, reveal, dialogs, image recovery, and persistence.
- `src/components/home-screen.tsx`: editorial home composition and authentic photo previews.
- `src/components/results-screen.tsx`: final score, responsive five-photo breakdown, and sharing controls.
- `src/app/globals.css`: responsive editorial design, accessible states, reduced-motion handling.
- `src/data/photos.json`: independent content collection, ready for future themed collections or a shared daily seed.

Future room, daily, leaderboard, and timer features can reuse the scoring and photo types; none is included in V1. All current game state stays on the device.

See `docs/ui-overhaul.md` for the dark cinematic redesign and its verification record.
