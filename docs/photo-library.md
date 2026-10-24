# Historical photo library

The existing game, styling, fonts, scoring and five-round mode are preserved. The library is a static catalog and CDN-served image derivatives. It needs no database, paid service, player account or runtime provider key. The hosting audience is unchanged.

## Current release — 25 October 2026

The playable collection contains **277 photographs: 251 newly approved imports and the original 26 curated records**. The importer discovered 2,593 candidates. Of those, 817 are rejected and 1,525 remain in review; neither group is playable. Six perceptual duplicates were detected automatically, with further repetitive scenes removed during visual review. Counts and distributions are available in `data/photo-library/report.json`.

The 5,000-image target has **not** been reached. Exact-date, rights and suitability verification eliminated or held most candidates. Library of Congress returned an access challenge; Smithsonian and Europeana keys are unavailable. These restrictions were not bypassed. Imports remain resumable toward the larger target. The current imported collection covers every decade from the 1900s through the 2010s, but is still weighted toward Europe and the 1960s–1970s. India is represented in the retained curated collection; no new India candidate passed this batch. Prioritize underrepresented regions, earlier decades and technology in subsequent review batches.

The compact current manifest is approximately 42KB uncompressed. The 251 imported records occupy 11 separately requested chunks. Bulk image files are served as static assets, not bundled into application JavaScript. The full review audit is in `data/photo-library/visual-review-batch.json`.

Validation includes all published chunk/year mappings and local image files, date and license policy, 5,000-record selection simulations, saved-game recovery and scoring. Browser checks exercised a complete five-round game, copied results, replay, keyboard/direct year controls, imported-photo credits, responsive images and a 390px mobile viewport. A deliberately withheld local image produced the existing retry/replacement controls, prevented submission, and was replaced without losing accumulated points. Withheld assets were restored afterward.

## Run imports

```sh
npm run photos:import -- --source commons --target 5000 --max-candidates 2000 --max-pages 100 --resume
npm run photos:import -- --source commons --query 'India street intitle:2010 filetype:bitmap' --year 2010 --from 1900 --to 2020 --resume
npm run photos:import -- --source commons --category fashion --from 1930 --to 1980 --dry-run
npm run photos:stats
```

`--target` is the desired **approved total**, including the original 26 curated images. It is not a promise to approve a requested number, and it never overrides verification. `--max-candidates` and `--max-pages` bound each import job. `--category` narrows discovery by subject. `--query` permits archive-specific searches. `--year` is an additional cross-check for a year-specific query; it never supplies a missing capture date. `--from` and `--to` filter the actual documented capture date. Sources can be comma-separated: `commons,loc,smithsonian,europeana`.

Dry-run prints the discovery plan and makes zero requests. Resume reuses cached metadata and downloaded bytes, skips known source IDs and finished queries, and continues provider cursors. Each candidate is atomically saved before the cursor advances. An interrupted page can safely be replayed. The catalog has a single-writer lock; stale locks from stopped processes are detected on the next run. Do not edit the catalog while a job is active.

The default query plan varies countries, subjects, years and the Fortepan historical collection. Search matches are discovery candidates only: a photograph is never dated from the search term, category year, filename alone, upload timestamp or digitization timestamp.

`--max-per-creator-year` defaults to 20 downloaded assets per creator, year and category. Further concentrated candidates enter review without more downloads. This reduces repeat-shoot domination; visual review still removes related scenes that pass the hash.

## Verification and approval

Every source candidate passes through:

1. **Metadata:** retain original source identifiers, capture field, rights field, creator, source URL, description and categories. Raw relevant evidence is saved alongside the normalized record.
2. **Dates:** require an exact year or calendar date. Approximation, ranges, uncertain language, impossible ISO dates, conflicting filename years and differing year-specific discovery evidence go to review. Object manufacture dates are not capture dates.
3. **Rights:** accept only matched CC BY / CC BY-SA license names and canonical Creative Commons URLs, or explicit CC0/public-domain statements with canonical URLs. “No known restrictions” does not automatically mean public domain. Unclear rights remain unavailable for gameplay.
4. **Quality:** require a real decoded JPEG/PNG/WebP/TIFF, single frame, a source at least 1,000px on the long side and 600px on the short side, aspect ratio 0.55–2.3, and a non-blank image. Downloads have byte and pixel ceilings. Text/document/illustration/graphic-content signals are filtered.
5. **Duplicates:** source ID, exact file SHA-256 and a 64-bit difference perceptual hash. Eight hash bands narrow similarity comparisons; Hamming distance ≤6 is a conservative duplicate candidate. Existing curated photographs are included. Visual review also rejects similar photographs that a hash misses.
6. **Screening:** optional local macOS Vision OCR flags visible years, date-like strings, recognizable watermarks and large text regions. Images are decoded to JPEG before OCR because native WebP handling can silently produce empty results. OCR is an aid, not proof that no date or watermark exists.
7. **Visual review:** inspect the image for answer-revealing dates, watermarks, graphics, poor quality, unsuitable content and repetitive scenes. **New records remain in review until this gate is completed.** A lower approved count is preferable to silently publishing uncertain or uninspected photos.

```sh
npm run photos:screen
npm run photos:review -- --sheet 0
# Open the printed contact sheet and its adjacent JSON evidence file.
# Inspect full derivatives whenever small details, dates or flags are uncertain.
npm run photos:review -- --action approve --ids commons-123,commons-456 --reviewer 'Your name'
npm run photos:review -- --action reject --ids commons-789 --reviewer 'Your name' --reason 'Visible year printed in image'
npm run photos:validate
npm run photos:validate -- --online
npm run photos:publish
```

These IDs are command examples, not imported assets. Approval cannot bypass missing date, rights or file checks. Resolving an OCR flag requires a written explanation. Reviews retain reviewer, timestamp, policy version and notes. A missing historical fact stays missing. Supplied reveal descriptions come from the source; no AI-generated dates or historical facts are introduced. Source titles can remain in their original language.

Sheet numbers refer to the current pending queue and shift after approvals; use the printed immutable IDs. `photos:screen` rescreens pending assets. Perceptual hashing and OCR have false positives and false negatives, which is why the visual gate remains necessary. Estimated category, region and difficulty are selection aids inferred from source text, not additional provenance claims. Unknown geography remains `Unspecified`.

## Sources and provider limits

- **Wikimedia Commons:** MediaWiki search + `imageinfo` (`url|size|extmetadata|sha1`), preserving `DateTimeOriginal`, original and description URLs, author and exact license evidence. `DateTime` is ignored for capture dating. Some scans misuse even `DateTimeOriginal`; conflicting context stays in review. [API documentation](https://commons.wikimedia.org/w/api.php), [etiquette](https://www.mediawiki.org/wiki/API:Etiquette).
- **Library of Congress:** JSON photograph search and item/resource records. Exact creation/published statements and rights are retained; collection membership does not imply public domain. Requests are serialized at ≥3.1 seconds per host request, under the documented 20 requests/minute limit. The current environment returned an access challenge; the adapter reports it and stops without bypassing it. [API docs](https://www.loc.gov/apis/), [limits](https://www.loc.gov/apis/json-and-yaml/working-within-limits/).
- **Smithsonian:** optional `SMITHSONIAN_API_KEY` from api.data.gov. Only image-level CC0 media are considered; CC0 metadata alone is insufficient. Object creation dates require review as they may not date the photograph. Missing keys produce a clear error before any request. [Developer information](https://www.si.edu/openaccess/devtools).
- **Europeana:** optional `EUROPEANA_API_KEY` from the provider. The adapter retrieves record-level provider creation statements and image rights; undifferentiated object dates stay in review. [Europeana API information](https://api.europeana.eu/en).

Set optional keys only in the shell environment, never in frontend variables or committed files. No credentials were invented or provisioned. Provider-specific optional adapters have schema normalization and missing-key checks; live keyed integrations cannot be verified without credentials.

All requests use an identifiable `TimeTravelerPhotoLibrary` User-Agent with the project's URL. Set `PHOTO_USER_AGENT` to include your own contact address when operating the importer. Metadata requests are serial with conservative host pacing; images are also fetched serially. Cached GETs, Commons `maxlag=5`, Retry-After, bounded backoff and timeouts are used. Access challenges, denial and exhausted rate limits stop the affected source. There is no scraping fallback or restriction bypass.

## Storage, restoration and deployment

- `data/photo-library/records.json`: persistent candidate catalog, status, evidence, hash, review and failure reasons.
- `data/photo-library/checkpoint.json`: query cursors and source failures.
- `data/photo-library/approved.json`: approved snapshot used for reproducible asset preparation.
- `data/photo-library/report.json`: actual counts and approved distributions by decade, category, region and source.
- `.photo-library/`: ignored API/binary cache, optimized assets, optional OCR executable and review sheets. Back it up to reuse downloads between machines.
- `public/library/manifest.json`: compact gameplay index.
- `public/library/releases/<content-hash>/`: immutable chunks of at most 25 full records, created by `photos:publish`.
- `public/library/images/`: ignored, generated 1,600px WebP derivatives, mobile versions and 320px thumbnails, included in the static deployment archive and served from the site's CDN. Thousands of source image binaries are not committed to Git.

On a fresh checkout:

```sh
npm install
npm run photos:restore
npm run photos:publish
npm run build
```

Restore regenerates derivatives from cached or source bytes and checks their SHA-256 against the approved record. A provider changing an image or an encoder producing different bytes fails explicitly and requires renewed review; it does not silently substitute a changed asset. The build preparation step refuses to ship missing approved derivatives. Keep the cache or deployment archive for an offline backup. No external object-storage credentials or paid backend are required by this static architecture.

`photos:publish` builds local catalog files; publication to the existing website follows the normal Sites deployment workflow. It does not change audience access. License URLs, creator/source credit and resizing information remain available in the existing reveal interface and catalog. CC BY-SA derivatives retain the source license.

## Gameplay and performance

Only the compact index is requested before selection. A game then requests the chunks containing its five records, not the whole catalog or image bank. Chunks are shared and cached by release hash. Images load per round, the next image is preloaded, mobile variants use `srcset`, and results use small thumbnails. The 26 curated photos remain a local fallback if the manifest or a chunk is unavailable. Interrupted imported trips resolve IDs through the current index; the existing storage key/schema and best scores are preserved.

Selection considers the entire index, excludes duplicate IDs and recent images, mixes categories, decades, regions and estimated difficulty, and mildly favors quality. A hard guard prevents five of one category when an alternative exists. When fresh stock is exhausted, the least recently played images return first. Up to 250 recent IDs are kept locally; undersupplied collections degrade gracefully. The original exponential scoring is unchanged.

Tests cover metadata/date/license policy, corrupt/low-resolution assets, perceptual duplicates, retry timing, missing credentials, chunk validation and retry/fallback, original game behavior, and 100 varied games drawn from a synthetic 5,000-record index. Synthetic records are tests only and never counted or published as photographs.
