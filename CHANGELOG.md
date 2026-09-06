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
