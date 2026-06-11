# Fairy Tails Training Display — Handover

Read-only TV dashboard (vanilla HTML/CSS/JS, no build, no service worker)
deployed via GitHub Pages from `master`:
https://fairytails123.github.io/trainingdisplay/

Fetches `?action=getAll` from the same Apps Script/Google Sheet as the planner
every 30s (`API_URL` in `js/display.js`). **Cache-busting:** bump the
`?v=YYYYMMDD[x]` query on `css/display.css`, `js/display.js` and
`manifest.json` in `index.html` whenever those files change — TVs hold caches
for hours.

---

## Session record — 11 June 2026

### Blue rebrand (colours only — no data logic touched)

Old orange `#FF6F00` family replaced with the Fairy Tails blues: `--ft-blue
#31ADD3` (accents/headings on dark — never under small white text, fails AA),
`--ft-blue-strong #0077B6` (fills carrying small white text, AA), navy header
gradient with cyan keyline, navy-tinted dark surfaces. Manifest theme/background
updated and cache-busted; PWA icons regenerated in blue (shared artwork with
the planner).

### Squashed-names fix + fit-to-screen

The reported "names being squashed" had three causes, all fixed:

1. Rows are children of a height-capped flex column and were **compressing**
   (`flex-shrink` default) until `overflow: hidden` clipped names mid-glyph —
   rows now have `flex-shrink: 0`.
2. The info column was a fixed 200px — it now sizes to the name
   (`min-width: 200px`, capped `clamp(240px, 26vw, 480px)`), so longer names
   extend right into previously blank space, and the name font scales with the
   screen (`clamp(1.3rem, 1.6vw, 1.9rem)`). A ≥1600px media query raises
   notes/slot/equipment type for big TVs.
3. The week pill stretched full-width and rendered as an empty "Wk" for dogs
   whose sheet value is an empty string — both fixed.

**Hard product rule: the display must NEVER scroll — every dog stays on the
visible screen.** `fitToScreen()` in `js/display.js` runs after every render
and on resize: if the list is taller than the viewport it scales the whole
schedule proportionally via `zoom` (readability floor 0.4); the container is
`overflow-y: hidden`. An auto-scroll cycle was explicitly rejected by the user
— do not reintroduce scrolling, paging, or carousels.

Verified with 1920×1080 headless-Chrome screenshots against live data
(before/after): previously four dogs' names were clipped mid-letter; now all
twelve dogs render complete on one screen.

### Rollback

`backup/pre-redesign-2026-06-11` pins the pre-redesign code:

    git push origin backup/pre-redesign-2026-06-11:master --force
