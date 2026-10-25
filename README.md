# TIME TRAVELER

A historical photograph guessing game with Classic (5 photos) and Grand Tour (12 photos across 12 decades), built with Next.js App Router, TypeScript, and Tailwind CSS. No account or backend is required.

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

Choose Classic for a quick five-photo trip (5,000 points maximum), or Grand Tour for twelve photos across twelve decades in shuffled order (12,000 points maximum). Inspect a photograph, drag the timeline or type a year from 1900–2020, and lock in your answer. Range inputs support arrow keys and Home/End. An exact answer earns 1,000 points; otherwise the score is `Math.round(1000 * Math.exp(-Math.abs(guess - actual) / 18))`. Click a photograph to inspect it, then use Escape to close the view.

Selection samples a decade, then a capture year, then a photograph. Every available decade gets a turn before one repeats, and large collections from a single year do not dominate. Within each era, unseen photos are preferred; if that era is exhausted, its least recently seen photo is reused to preserve coverage. The 277-photo archive has 132 images from the 1960s and 1970s, including 45 from 1975; these records retain their verified dates, but their quantity no longer determines how often players see those years.

Separate Classic and Grand Tour best scores, completed-game count, recent photograph IDs, and the current session are stored under `time-traveler-v1` in localStorage. Existing five-round saves and best scores remain compatible. Stored sessions are validated before use. Storage is optional: restricted private browsing still permits play. An interrupted trip can be resumed from the home screen. A game never contains duplicate photos. Unavailable photographs offer retry or a replacement from the same era when available, without penalizing the score. Copy results uses the Clipboard API with a selectable-text fallback.

## Archive

All playable photographs are local, optimized WebP files. `src/data/photos.json` contains capture year, creator, source link, license, and reveal fact. See `docs/photo-sources.md` for provenance and rights evidence. New entries need a documented capture year (no ranges), reusable license, intact attribution, a verified fact, and visual inspection for answer-revealing dates. No AI-generated photographs or invented metadata are used. The home print collage crops its previews; game images display in full using `object-fit: contain`.

The active fonts Barlow Condensed, DM Sans, and IBM Plex Mono are self-hosted. Their SIL Open Font Licenses are included in `public/fonts/`.

## Structure

- `src/lib/game.ts`: scoring, selection, guarded submission/progression, replay, results text, and session validation; pure functions tested independently.
- `src/components/time-traveler.tsx`: single-player state, timeline, reveal, dialogs, image recovery, and persistence.
- `src/components/home-screen.tsx`: editorial home composition and authentic photo previews.
- `src/components/results-screen.tsx`: mode-specific final score, responsive round breakdown, and sharing controls.
- `src/app/globals.css`: responsive editorial design, accessible states, reduced-motion handling.
- `src/data/photos.json`: independent content collection, ready for future themed collections or a shared daily seed.

Future room, daily, leaderboard, and timer features can reuse the scoring and photo types; none is included in V1. All current game state stays on the device.

See `docs/ui-overhaul.md` for the dark cinematic redesign and its verification record.

## Automatic Wikimedia archive

The library grows through the [Grow the photo archive workflow](https://github.com/khushalx/time-traveler/actions/workflows/photo-library.yml), scheduled daily at 04:17 UTC (09:47 India time). It also supports **Run workflow** in GitHub Actions. No archive API key or manual photo entry is required.

Each run checks up to 400 discovery candidates and publishes at most 40 qualifying photos. All years from 1900–2020 are eligible; sparse years get priority, with rotating subjects and places. Exact source capture dates, compatible licenses, decoded image quality, duplicate checks, and required OCR control automatic acceptance. Uncertain records stay out of play. Automated checks can miss visual or source mistakes; each live record retains its evidence and a separate automatic audit.

New photos are optimized into immutable GitHub Release assets. The game merges a small live index with its existing local archive and loads metadata only for selected rounds. Catalog updates need no Vercel redeploy. A failed sync leaves the previous index usable; a network outage preserves the local archive and saved scores.

```sh
npm run photos:sync -- --dry-run
npm run photos:sync -- --max-new 40 --max-candidates 400 --max-pages 12
```

Local publication requires GitHub CLI write access to this repository and Tesseract OCR (or native Vision on macOS). The scheduled Ubuntu job installs Tesseract and uses its repository-scoped Actions token. See [the photo library documentation](docs/photo-library.md) for the audit, publication, failure and removal procedures.
