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
