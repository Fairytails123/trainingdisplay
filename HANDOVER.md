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

## Session record — 2 August 2026

### Tracker went LIVE + chips moved to their own column

- **Backend live:** prod Apps Script redeployed `@9 → @10` (same `/exec` URL)
  after the owner set `JOTFORM_API_KEY` and approved the one-time
  `script.external_request` OAuth consent. Live `getAll` returns
  `reports.ok:true`; 10 of 11 active dogs matched real JotForm report dates on
  first fetch. Full backend contract: workspace `APPS_SCRIPT.md`.
- **Layout change (owner request):** missed-report chips moved OUT of
  `.dog-row__dates` into their own `.dog-row__reports` column rendered
  immediately LEFT of the dates column (commit `fa02246`) — the shared column
  felt overcrowded. The dates column is back to end/break dates only; the
  reports column collapses entirely when a dog has no chips (clean rows keep
  full notes width). Stacked (≤640px) and compact-density CSS mirrored; chip
  classes/data-attrs unchanged, so D-pad navigation, dismissal and re-render
  focus restore are untouched (45-assertion node suite still green).
- Verified via the local fixture AND a live 1920×1080 headless screenshot
  (real data, including a temporary "ZZ Test Dog" demo row + one live
  dismissal round-trip through `Report_Dismissals`).
- Cache bust: `?v=20260802` (css/js/manifest). **TVs must reload the page
  once** — the 30s poll refreshes data, not code.
- Demo data removed end of session (demo dog deleted + tombstoned; one inert
  audit row left for owner hand-delete). The owner performed 4 real chip
  dismissals the same morning — the dismissal path is production-proven on
  real data. Owner-confirmed behaviour: chip colours (green = today from
  17:00, amber = yesterday, red = 2+ calendar days) and freshness (worst case
  ~5½ min from JotForm submission to chip clearing: 5-min backend cache +
  30s TV poll; dismissals stick within ~30s).

## Session record — 1 August 2026

### Missed training-report tracker (chips on dog cards) + TV-remote delete

Each dog card now flags **missing daily training reports** as small date chips
in the right-aligned dates column ("MISSED REPORTS" item, rendered last so
Training-ends/Break items never jump). Data comes from a new top-level
`reports` field in `getAll` (backend fetches the JotForm EU Training Report
form server-side; see workspace `APPS_SCRIPT.md`).

**Tracker rules (owner-decided):** report required **Mon–Thu** for every
active dog; today counts as missed from **17:00**; a missed date auto-expires
after **14 days** (max 8 chips); a date is never required before the dog's
`createdAt`, after `trainingEndDate`, or inside a break window. Colour by age:
**green** = today, **amber** = yesterday, **red** = 2+ days (new tokens
`--report-*-bg/text`, dark-fill + light same-hue text per the AM slot-card AA
convention; `--amber` promoted from the overflow-warning literal). A chip
disappears as soon as a matching report (or a manual dismissal) arrives.

**Availability contract:** `cachedData.reports === null` (getAll absent or
`ok:false`) ⇒ the tracker renders NOTHING (never fake "missed") and the new
muted footer span `#report-status` shows "Report data unavailable".

**TV-remote delete (single press, owner choice):** chips are real `<button>`s —
clickable for cursor/air-mouse remotes, plus document-level arrow-key
navigation (focus ring, Enter deletes, Escape blurs, 20s auto-blur so a stray
OK can't delete hours later; focus survives the 30s re-render by dogId|date).
A press optimistically hides the chip (10-min local TTL), POSTs fire-and-forget
`dismissReportDate` (no-cors, text/plain — never add JSON headers), and shows
the `#dismiss-toast` confirmation. Dismissals persist in the Sheet's
`Report_Dismissals` tab (audit log; delete the row to un-dismiss).

**Pure-logic seam + tests:** `computeMissedReports()` takes "now" as data;
`window.__FT_DISPLAY_TEST` (test-only, not a UI contract) exposes it plus
`overrideNow`/`setReports`/`rerender` for DevTools time-travel. Node harness:
`node .claude/report-tracker-test.js` (45 assertions — 17:00 gate, ages,
gates, breaks, expiry, dismiss plumbing). Visual fixture:
`.claude/fixture.html#s=chips|unavailable|clean` (gitignored), verified via
headless-Chrome screenshots.

**createdAt caveat:** the gate uses `createdAt.slice(0,10)` (UTC date) — up to
one day off London-local for dogs created 23:00–01:00 UK; accepted.

Cache bust: CSS, JS and manifest query strings → `?v=20260801`.

## Session record — 26 July 2026

### Single-screen overflow safety

`fitToScreen()` now switches to a compact-density layout if the roster still
overflows at the normal 0.4 zoom floor. The compact mode removes decorative
spacing before sacrificing text; if content still cannot fit, the footer shows
an explicit capacity warning rather than silently clipping rows. The hard
no-scroll/no-paging rule remains unchanged.

Cache bust: CSS, JS and manifest query strings → `?v=20260726`.

**Published and verified:** commit `856a6ec` on `master`; GitHub Pages serves
`?v=20260726`. The shared live data was unchanged across deployment (16 dogs,
22 assignments, 22 tombstones). Apps Script remained at `@9`.

## Session record — 15 July 2026

### Shared Apps Script backend hardened + redeployed (@9) — no display code changed

The Apps Script backend this TV polls (`?action=getAll`, every 30s) had a max-effort
review; three "must-fix" defects were fixed and redeployed to the prod deployment id
(**@8 → @9**). **Nothing in this repo changed — no cache-bust needed.**

Why it matters here: the server-side weekly week-increment (`autoIncrementWeekNumbers()`)
runs from the top of `handleGetAll`, so **this TV's 24/7 30s poll is what advances every
dog's `weekNumber` within ~30s of a new ISO-week** — no planner interaction or installed
trigger needed. The hardening makes that path safe against a malformed `weekNumberSetDate`
(no more `weekNumber = NaN`), stops one bad row from freezing the whole weekly pass, and
flushes buffered writes before releasing the shared write lock.

Source of truth for the fixes + 6 deferred findings: the planner repo's `HANDOVER.md`
(15 July 2026) and workspace-root `APPS_SCRIPT.md` (`@9`).

---

## Session record — 19 June 2026

### Training-date column (end date + break windows) — RIGHT-ALIGNED

The planner now stores three dog date fields (`trainingEndDate`, plus break
windows `break1Start`/`break1End`, `break2Start`/`break2End`, all `YYYY-MM-DD`
strings). The display surfaces them on each dog row.

- **Hard product rule applied:** anything about the training end date or break
  windows is **right-aligned from the viewer's perspective**. New
  `.dog-row__dates` column sits after `.dog-row__content` (which is `flex:1`, so
  the dates block is pushed to the far right edge); `align-items:flex-end` +
  `text-align:right` right-align the contents. Stacked `<=640px` layout keeps it
  right-aligned (full width, top border).
- **`js/display.js`:** `formatDateShort()` → "12 Jan 25" and
  `formatTrainingRange()` → "12 Jan 25 to 16 Jan 25". Both parse the
  `YYYY-MM-DD` string directly (no `Date`) → no off-by-one day across the TV's
  timezone. Values are escaped before `innerHTML`. A dog that has only dates (no
  slots/notes) is no longer dimmed (`hasDates` folded into `isEmpty`).
- The end date is emphasised in brand cyan; break ranges wrap rather than clip
  (the row is `overflow:hidden`), so a long range can never lose its left edge.
- Respects the no-scroll invariant — `fitToScreen()` still scales the whole list.
- **Cache-bust:** `?v=20260619` on `css/display.css`, `js/display.js`,
  `manifest.json` in `index.html`.
- **Verified live 2026-06-19:** a temp dog with dates set rendered the
  right-aligned dates column correctly on the production TV URL (confirmed by the
  user), then was removed (deleted + tombstoned). Dogs without dates show no
  column. Backend save→read→delete round-trip preserved every date exactly.

(Backend: the shared Apps Script auto-adds the new Dogs columns via
`ensureDogColumns_`; redeployed to the prod deployment id. See the planner repo
handover + `APPS_SCRIPT.md` at the workspace root.)

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
