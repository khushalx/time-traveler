# Verification

## Automated checks

- ESLint with Next.js Core Web Vitals and TypeScript rules.
- Production static export with Next.js 16, including TypeScript checking.
- Eight Node tests covering the exact scoring curve, score symmetry, five unique selections, recent-photo avoidance, bounded year input, reveal wording, validated session restoration, invalid/tampered session recovery, results text, and the real archive's metadata and local WebP assets.
- All 26 photographs decoded and visually inspected during curation. Dimensions match the metadata. Dating and rights evidence is in `photo-sources.md`.

## Browser verification

Used the in-app browser with real embedded document viewports at 1440 × 1050, 390 × 844, and 320 × 667, plus the normal preview viewport.

Verified the following interactions:

- Started a game, completed all five rounds, checked score accumulation and the final five-row breakdown, then started another trip.
- Typed 1984, adjusted the range with the right arrow to 1985, and confirmed both controls stayed synchronized.
- Dragged the mobile-width slider and submitted the displayed year.
- Checked the reveal's early/late wording, guessed year, points, and attribution.
- Opened a photograph for inspection and closed it with Escape. Focus returned to the photo button.
- Reloaded an unfinished session and resumed at the same reveal/round.
- Copied the results and confirmed the “Copied to clipboard” state.
- Temporarily moved a local photograph out of the served directory, reloaded the session, and confirmed a clear error, retry/replacement actions, and a disabled submit button. Restored the asset and verified retry recovered normal play without changing the score.
- Reviewed the full photograph, slider, year controls, and primary action at 320px and 390px; reviewed home and gameplay at 1440px. Fixed a wrapping header link and tightened mobile results spacing.

The temporary viewport harness was removed before deployment. Test progress was cleared from the preview's localStorage. Physical touch-device testing was not performed; native range controls, generous hit areas, responsive layouts, and `touch-action` are used.

## Content and deployment notes

The initial archive contains 26 photographs from 1903–2011. The guess range remains the requested 1900–2020. Reaching 50 and filling the latest decade requires more verified assets; no uncertain dates or placeholders were added to reach a count. Images and the three font families are served locally. Future multiplayer, daily, leaderboard, and timer features are intentionally out of scope for V1.
