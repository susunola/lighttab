# 1.23.4 — grab the calendar anywhere

- Fix: even in free-canvas mode the calendar could only be dragged by its 24px hover handle. A month
  grid is almost entirely day cells, and cells were on the "don't start a drag here" list (the same
  list every other widget escapes through its empty padding), so grabbing the calendar the way you
  grab any other widget did nothing. A drag may now start on a day cell.
- That needed the click/drag separation the card dragger already had and the block dragger did not:
  * the click that follows a drag is now suppressed (capture phase, so it beats the calendar's own
    handler), otherwise letting go after a drag would pop the day detail open;
  * a day-cell press no longer calls `preventDefault()`, which was swallowing the click outright;
  * a day-cell press is no longer pointer-captured. Capture retargets the following click to the
    dragged block, so the click never reached the cell and the day popover could not open at all.
    Move/up handlers now live on the document, so a drag that leaves the layout box still tracks.
- Verified by measurement in the real-MV3 suite: a plain click on a day cell still arrives (and does
  not move the block), and a drag from that same cell moves the calendar without firing a click.
  Also confirmed all seven blocks (clock, calendar, todo, movie, search, grid, and the calendar via a
  cell) still drag after the listener move.

# 1.23.3 — the free canvas actually works

- Fix: with the movie card in the **left column** (the default) the page runs an integrated grid
  layout, and that layout turns free-canvas dragging off for *every* widget — so nothing on the
  page could be dragged, and the drag handles were never even revealed. Moving the movie card to
  **Above search** switches to the free canvas, but that path was broken in three ways, each a CSS
  cascade accident in which a later movie-calendar rule outweighed the canvas one:
  * the movie block stayed in the flow (`position: relative`) instead of being positioned like
    every other block, because the two rules tie on specificity and the movie one is later;
  * its card lost the 320px cap, so it swelled to fill the 640px box — and since the block's width
    is *measured from the flow* and then pinned as an inline width, an uncapped card also stretched
    the draggable block and pushed the icon grid below the fold;
  * the w-top stack is designed to drop its card chrome entirely, but the movie re-added a panel
    visibly wider than the card inside it.
- Settings → Widgets now says plainly that the movie card's placement picks the layout engine,
  instead of leaving users to guess why nothing drags.
- The real-MV3 suite now measures this: in free-canvas mode the movie block must leave the flow,
  stay capped, keep the icon grid on screen, and the calendar must actually move when dragged.

# 1.23.2 — the shortcut dialog names a site for you

- The *Add shortcut* dialog now fills **Name** as you type the URL (`https://fast.com/zh/cn/` →
  `Fast`, `www.` dropped) — the same host derivation bulk add and bookmark import already used, so
  all three entry points name a site identically. It yields the moment you type a name of your own,
  and never runs while editing, so a name you chose is never overwritten. Emptying the Name re-arms it.
- "Add current tab" keeps locking in the tab's real title, which beats anything derived from a host.
- smoke and the real-MV3 suite now cover the behaviour end to end: the auto-fill itself, the
  user-name-wins rule, re-arming after clearing, and that editing leaves the stored name alone.

# 1.23.1 — updates apply themselves

- Fix: a published update could sit unused until the browser restarted, which made upgrading look
  like it required an uninstall + reinstall. Chrome only installs a pending update while the
  extension is considered idle, and an open extension page counts as "in use" — LightTab overrides
  the new-tab page, so in normal use it is never idle. `js/background.js` now applies a downloaded
  update as soon as it is ready (`chrome.runtime.onUpdateAvailable` → `chrome.runtime.reload()`).
  Nothing is lost: user state is written to storage as it changes.
  *Takes effect from 1.23.1 onward* — the build that is already installed has no such handler, so
  that one first hop still needs a manual **Update** (or a restart).
- Add `docs/RELEASING.md`: the release + update runbook — the five version sites, packaging, why
  updates are not instant, how to force one without reinstalling, and the unpacked-vs-store
  extension-ID trap.
- README: document how updating works; drop the stale "not published yet" install note.
- smoke: `node --check` `js/background.js` too, and assert the update handler stays wired.

# 1.23.0 — subscribe to published calendars

- Subscribe to read-only iCalendar feeds from *Settings → Calendar*: paste a published link (Apple
  iCloud, Google secret iCal address, Outlook ICS, or any `https://` / `webcal://` URL).
- Events appear as one coloured dot per feed on the month grid; click a day for a detail popover
  with times, titles and locations. The popover is placed by a small collision search so it never
  covers the grid you clicked, the search box, the shortcut area or the movie card.
- Full RFC 5545 reading on-device: line unfolding, TEXT escaping, DATE / DATE-TIME (floating, UTC
  and `TZID` resolved through the browser's own timezone database), `DURATION`, `RRULE`
  (DAILY / WEEKLY / MONTHLY / YEARLY with INTERVAL / COUNT / UNTIL / BYDAY / BYMONTHDAY) and `EXDATE`.
- Permission model unchanged at install time: the feed hosts live in `optional_host_permissions` and
  are requested the first time you subscribe. Anonymous `GET`, `credentials: 'omit'`, 15s timeout,
  2 MB cap, 8 feeds max.
- Feed URLs are deliberately not part of cloud sync — a published calendar link is an unguessable
  capability, so it stays on the device (`lt.calendars`); fetched events are a local-only cache.
- Cached events survive a failed refresh, and each feed reports its own sync state or error.

# 1.22.0 — AI workflow reliability

- Make the AI entry button draggable with position persistence and viewport bounds.
- Name the default wallpaper 暮蓝映梅 / Plum at Blue Hour and add subtle stars.

- Add fill-only mode, remembered targets, task presets, full prompt preview and optional local recent tasks.
- Add template fields, favorites, duplicate, import and export; keep Google template support.
- Preserve existing target drafts and dispatch at most once; scope redirect handoff to the selected target.
- Show individual delivery states, retry unopened targets, and expose manual copy fallback.
- Add selected-text context menu and configurable extension command.
- Add movie source date and reversible not-interested control.
- Add duplicate shortcut warning, sanitized opt-in diagnostics and a release packaging command.
- Live provider coverage remains partial: DeepSeek requires sign-in; Doubao is region-blocked in the current environment; WorkBuddy not-running/not-installed conditions are not yet physically tested.

# Changelog

## 1.21.0 — 2026-09-07

- Refine shortcut layout, single-line labels, light theme and bundled blue-hour wallpaper.
- Add a draggable AI panel with shared templates, localized defaults, multiple targets and retry links.
- Preserve literal prompt text, deduplicate launch targets and guard accidental repeated sends.
- Add cached Douban hot movies with bundled fallback and in-page details.
- Refresh bundled icons and open YouTube in the current tab.
- Improve sync recovery and add browser, upgrade and safety regression coverage.


All notable changes to LightTab are tracked here. Versions follow the Chrome Web Store build.

## [1.20.0] – pre-store release prep

- **Search & launcher**
  - Search box now also matches your saved shortcuts/bookmarks (local, offline): ↑/↓ + Enter opens, exact unique names launch directly.
  - Bulk-add shortcuts by pasting lines ("Name  URL" or bare URL), with URL dedupe and a live preview.
- **To-dos**: optional due dates (M/D chips, overdue highlight, calendar dots); "done" state preserved; merge import never overwrites them.
- **Icons**: dozens of brand icons corrected to official favicons/vectors at high resolution (Gmail/gmail.com, Google Meet/Maps/Translate/Photos, 小鹅通, 慕课网, 极客时间, 腾讯文档, ChatGPT, OpenAI, QQ 邮箱, 企业微信, LeetCode …); engine names escaped; deleted engines can never linger in the dropdown.
- **UI/polish**: custom accent colour; storage-usage meter; reduced-transparency support; light-theme small-text contrast (AA); keyboard shortcut help (`?`) and grid keyboard navigation; touch/pen long-press reorder; modal focus management; movie/quote content expanded.
- **Reliability**: read-time data sanitizers (boot/cloud pull), midnight rollover for calendar & movie, wallpaper "Shuffle" with favorite preservation, launcher-direct fixes, boot guard.
- **Data**: merge-import (URL-dedupe shortcuts), opt-in local backup reminders, sync-panel data management (local reset + honest "cloud delete not available yet"), JSON quota/usage display.
- **Privacy/security**: extension CSP allowlists only the three suggestion hosts; no telemetry; bundled artwork restricted to self-generated assets (store-safety guard in tests).
- **Testing**: expanded offline smoke suite; Playwright E2E scaffold in `tests/e2e/`.

## [1.19.x and earlier]

- Pre-store development history: original clock/lunar/calendar/search/grid/folders/canvas layout/sync/settings feature set. See git history for details.
