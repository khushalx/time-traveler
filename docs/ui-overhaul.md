# Dark cinematic UI overhaul

## Audit and scope

The previous frontend used a cream/red theme, many 7–11px labels, a small photograph cap, scattered divider treatments, and a table-like results screen. The homepage depended on a full-height centered layout with a small headline and decorative framing. All four screens were implemented in the same client component.

The overhaul keeps the existing Next.js project, routes, dependencies, 26 verified local photographs, source metadata, scoring curve, five-round mechanics, and `time-traveler-v1` storage format. No account system, multiplayer, timer, or new game mode was added.

## Implemented design

- Charcoal backgrounds, warm white text, readable secondary gray, and restrained antique gold actions and scoring.
- Self-hosted Barlow Condensed 700/800, DM Sans 400–700, and IBM Plex Mono 500/600; licenses included with the fonts.
- Two-column editorial homepage on desktop and tablet, stacked on phones, with two existing authentic archive photographs.
- Aspect-ratio-aware gameplay photographs displayed in full, a 1900–2020 native timeline with a large thumb and selected track, visible focus, direct entry, and keyboard adjustment.
- Photo-visible reveal with a large actual year, guessed year, distance, points, historical fact, original source, and license.
- Dominant final score, personal best, and a five-photo reel that becomes a compact list on smaller viewports.
- CSS-only restrained motion with reduced-motion handling. No new runtime dependencies.

Home and results presentations are extracted into small components; the existing game orchestrator retains persistence, preloading, dialogs, and image recovery. Pure guarded transitions prevent queued duplicate submissions or duplicate game completion.

## Verification

Eleven Node tests cover the scoring curve, symmetry, bounds, selection, recent avoidance, storage validation, share text, local photo assets, exact submitted year, wrong-photo and duplicate-submission guards, five-round completion, duplicate completion, and replay preserving the personal best and completed-game count.

The in-app browser was used with embedded document viewports of 375×812, 430×932, 768×1024, 1440×1000, and 1920×1080. Screenshots of home, guessing, reveal, desktop results, and mobile results were inspected. Photo sizing was adjusted to avoid oversized empty image containers; tablet home composition and reveal height were tightened after inspection.

Interaction checks included:

- Direct entry of 1984 followed by a right-arrow timeline change to 1985, with synchronized controls.
- Submitting 1967 on the verified 1967 photo and receiving exactly 1,000 points.
- Mouse dragging at mobile width to 1978 and submitting that exact year against 1966, receiving 513 points.
- Completing all five rounds: 1,000 + 513 + 59 + 211 + 135 = 1,918, with the matching final total and breakdown.
- Refreshing and resuming the same fourth round with 1,572 accumulated points.
- Opening the full photograph and closing it with Escape, returning focus to the photo button.
- Copy results showing its successful clipboard state.
- Replay starting at round one with zero current points; pure transition tests verify personal-best retention.

The existing image retry/replacement flow is retained. Its original failure-injection verification is recorded in `verification.md`; all current local photo assets are also covered by the test suite. No physical touch device was available; mobile layouts were reviewed with the native range control at phone widths.

Final ESLint and all eleven tests pass. Production export is validated during deployment packaging. Temporary viewport-review files are removed from the shipped application.
