<p align="center">
  <img src="assets/logo.png" alt="LightTab" width="120" height="120">
</p>

<h1 align="center">LightTab</h1>

<p align="center">
  A minimal, calm, fast new-tab page for Chrome.<br>
  <b>Local-first by default · zero tracking · optional cloud sync</b>
</p>

<p align="center">
  <img alt="Manifest V3" src="https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-7C3AED">
  <img alt="Dependencies" src="https://img.shields.io/badge/dependencies-0-10a37f">
  <img alt="Languages" src="https://img.shields.io/badge/UI-English%20%2F%20%E4%B8%AD%E6%96%87-A78BFA">
</p>

---

Live clock and greeting (with the Chinese lunar calendar), a local month view, one-box search,
an AI prompt launcher, a grouped icon grid, to-dos and wallpapers — all of it stored in your own
browser. The required API permission is `storage`; the manifest also declares three search-suggestion
hosts and content scripts for supported AI sites. Search suggestions are on by default and can be
disabled. Online sync, wallpaper and weather features are optional. A startup loopback probe checks
whether WorkBuddy is running on this computer; it does not contact a remote service.

## Features

- **Clock & greeting** — live time, date and a time-of-day greeting, plus the Chinese lunar calendar (sexagenary year, zodiac, leap months, 1900–2100, computed entirely on-device). The clock can sit in the left column or lifted above the search box as a large centred time line (phone-launcher style), switches between 24-hour and 12-hour (AM/PM · 上午/下午) formats, can show seconds, and offers three face fonts (modern / serif / mono) — all in *Settings → General*
- **Bilingual UI (English / 中文)** — switch the whole interface in *Settings → General → Language*. Greetings, dates, the lunar line, calendar, engine names, menus and messages all follow. Persisted locally, applied instantly, no reload
- **Calendar widget** — local month view with lunar-day labels and month navigation. Chinese statutory holidays carry a small 休/Off corner badge (调休 make-up workdays get 班/Work), and a quiet line under the grid counts down to the next holiday (2026 official schedule, refreshed yearly). It can also subscribe to **read-only iCalendar feeds** (*Settings → Calendar*): paste a published link from Apple iCloud, Google (secret iCal address) or Outlook, and each feed's events show as a coloured dot on the month grid — click a day for a popover with times, titles and locations. Recurring rules, `TZID`, all-day events and `EXDATE` are all expanded on-device; nothing is ever written back to the source calendar
- **Countdown widget** (opt-in, off by default) — a ticking off-work countdown (click the time to change it; weekends and after-hours show a relaxed state) plus up to 5 custom countdown days ("name · N days left"), all computed locally
- **Pomodoro widget** (opt-in, off by default) — 25 min focus / 5 min break cycles with start/pause/reset, auto-switching phases with a toast, and cycle dots (4 focus sessions = one set). Session-only state, nothing persisted
- **One-box search** — URL shortcuts (bare domains with paths work, e.g. `github.com/susunola`), 6 search engines, 2 AI chats (Doubao, ChatGPT) and a WorkBuddy deep link. Live suggestions from Baidu / Google / Bing (fetched directly — three scoped `host_permissions` entries; switchable off in Settings). Tab / Shift+Tab in the search box cycles engines; a pure arithmetic expression (e.g. `128 × 3.5`) shows an inline result row — Enter copies it, no `eval()` involved; the last 10 searches are kept locally (`lt.history`) and resurface below the box — deletable one by one or cleared at once. When WorkBuddy Desktop is running it is shown live in the engine list via a local loopback probe (no extra permissions)
- **AI prompt launcher** (press `/`) — pick a template, type your content, and send the same prompt to several targets at once. The prompt text never travels in the URL (it goes through a nonce channel in extension mode, with a short-lived storage pointer that survives param-stripping redirects like doubao.com → dola.com); the content script waits out placeholder inputs, verifies the send actually happened, and falls back to clipboard + an on-page notice if the target page blocks auto-fill
- **Icon grid** — drag to reorder (hold a tile over another to group them into an iOS-style folder with a 2×2 mini-icon tile, an inline-renamable popup and drag-out to ungroup; folders auto-dissolve below 2 items), groups, and a built-in brand-icon library so no favicon is ever fetched from a third party. Tile size (48–80px) and corner radius (20–50%) are adjustable in *Settings → General* — folder mini-grids and the ＋ tile scale along. The ＋ dialog fills its Name from whatever URL you type (`https://fast.com/zh/cn/` → `Fast`) unless you have typed a name yourself, and can prefill name + URL from the browser's current tab (optional `tabs` permission, requested on click)
- **Free canvas layout** — on wide screens every widget and card can be dragged anywhere; cards snap to a grid and swap places with whatever is already there. Grab a widget by its hover handle or by any non-control part of its surface — the calendar's month grid included. The movie card's placement (*Settings → Widgets*) selects the engine: **Left column** tucks it into the icon grid, **Above search** switches to the free canvas where dragging is available (the switch takes effect immediately, no reload; it does need a window wider than 1024px). Dragging a widget that cannot move explains which of the two conditions is missing, and offers a one-click way to switch
- **To-dos**, **6 curated gradient wallpapers**, custom image upload, and an optional Bing daily wallpaper library (with per-image favorites and a favorites-only filter)
- **Weather widget** (opt-in, off by default) — current temperature, condition, today's high/low and humidity for a city you pick in Settings, powered by Open-Meteo (no API key, CORS-open). Expandable to a 7-day forecast with a hi/lo temperature trend sparkline. Cached for 30 minutes; shows the last reading with a "may be outdated" hint when the network fails
- **Minimalism toggles** — the search bar and the clock card can each be hidden entirely in *Settings → General* (the layout closes up; the icon grid rides up when both are off)
- **JSON backup / restore** and one-click Chrome bookmark import (optional permission)
- **Optional cloud sync** — sign in with an email to sync shortcuts, to-dos, settings, wallpaper and templates across devices over HTTPS. Off by default. First-login differences and concurrent edits pause the affected document for a choice; local recovery backups are saved before replacement

## Privacy

- Required API permission: `storage`; three search-suggestion host permissions and AI content-script matches are also declared in the manifest
- No tracking, no analytics, no ads
- **Search suggestions** (on by default, switchable in *Settings → General*) — what you type is sent directly to your chosen search engine (Baidu / Google / Bing) to fetch suggestions; turning it off keeps keystrokes local until you press Enter. Additional online features:
  - **Cloud sync** — email sign-up/login over HTTPS to `lighttab.atomwangnus.com`. First-login differences and revision conflicts require choosing the device or cloud copy. Unaffected documents continue syncing. Your token stays local and is excluded from sync and recovery exports; data is not end-to-end encrypted
  - **Bing daily wallpaper library** — when you open it in settings, metadata and images are fetched via the backend proxy at `lighttab.atomwangnus.com`
  - **Weather widget** — off by default; only after you enable it and set a city does the page fetch forecasts directly from `api.open-meteo.com` (and city geocoding from `geocoding-api.open-meteo.com`) over HTTPS. No account, no API key, no other data leaves the browser
  - **Calendar subscriptions** — off by default. Subscribe only if you paste a published ICS link yourself; the page then does an anonymous, read-only `GET` of that one URL (no cookies, no credentials, 15 s timeout, 2 MB cap, at most 8 feeds). The hosts are declared as `optional_host_permissions` and requested at subscribe time, so the install prompt never asks for them. Feed URLs are **never uploaded** — they stay in local storage and are excluded from cloud sync and exports, because a published calendar link works as an unguessable key to that calendar
- The optional `bookmarks` permission is requested only at the moment you click "import from bookmarks"; likewise the optional `tabs` permission is requested only when you click "Add current tab" in the shortcut dialog (used once to read the active tab's title + URL)
- **AI launching** sends the selected prompt to the chosen AI service through its page. The content script is declared for Doubao, Dola and ChatGPT. Launching a search or website also contacts the selected destination.
- **WorkBuddy detection** probes `127.0.0.1` ports 18488–18490 on startup to detect the local desktop app.

See [privacy.html](./privacy.html) for the full policy.

### Sync recovery

In **Settings → Sync**, expand the device/cloud previews before choosing a conflicting copy.
The choice applies to that whole document (for example the complete shortcut list), not individual
items. If either copy changes before the choice completes, review the updated preview and choose again.

The latest **3 recovery backups** remain on this browser. They include the five synced data documents
and the schema version, not authentication credentials or search history. Download important backups
before clearing browser data. A displaced cloud conflict is saved together with the other local data,
not as a complete snapshot of the cloud account.

**Restore to device** first backs up current content, then signs out of cloud sync and restores locally.
Sign in again when ready to compare with cloud data. If a recovery backup cannot be saved (for example,
because storage is full), replacement stops; download and delete old recovery backups to free space.
Cloud data deletion still requires a backend implementation and is unavailable in this release.

## Install

**Chrome Web Store** — install the published build from the store listing (updates arrive on their own; see below).

**Developer mode**
1. Clone this repo
2. Open `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select this folder

### Updating

Chrome checks for extension updates on startup and every few hours, and only *installs* one while the extension is idle — an open extension page counts as "in use". LightTab **is** the new-tab page, so it would never qualify and an update could sit unused until a browser restart; `js/background.js` therefore applies a downloaded update as soon as it is ready.

To force a check immediately, open `chrome://extensions`, turn on **Developer mode** and click **Update**. There is no need to reinstall — uninstalling clears local data unless cloud sync is on. A copy loaded with **Load unpacked** is a *separate* extension from the store one: it never auto-updates (reload it from `chrome://extensions`) and it does not share storage. Full release runbook: [docs/RELEASING.md](docs/RELEASING.md).

## Tech

- Chrome Extension Manifest V3
- Plain HTML / CSS / vanilla JS — zero dependencies, zero build step
- `chrome.storage.local` with a `localStorage` fallback (so `file://` preview works)
- Schema-versioned migrations
- i18n is a flat local dictionary plus `[data-i18n]` DOM hooks — no runtime library
- Offline smoke checks: `node scripts/smoke.cjs` (syntax / manifest / version consistency / pure-function assertions)

### Testing

Two layers, both kept out of the runtime (no runtime dependencies):

1. **Offline smoke** — `node scripts/smoke.cjs`: JS syntax, manifest/version consistency,
   pure-function assertions and static DOM/CSS guards. Runs in CI on every push.
2. **Browser E2E (local)** — Playwright drives the page in `file://` preview mode against a
   fresh profile (boot, grid keyboard, modal, to-dos…):

   ```bash
   npm i -D playwright   # first time only; provides both browser and test APIs
   npx playwright install chromium
   npx playwright test -c tests/e2e/playwright.config.js
   ```

   These need a real browser, so they are not part of CI — run them before publishing
   a release. Tests live in `tests/e2e/`.

3. **Real extension installation** — with Playwright and its Chromium installed, run
   `node scripts/check-extension.cjs`. This loads the actual MV3 extension in an isolated profile,
   blocks external requests, checks startup and verifies `chrome.storage.local` persistence after
   reload. It also runs conflict preview, backup download, cloud choice and restoration through the
   real settings UI using a mocked cloud service. Unlike the `file://` tests, this catches installation/CSP
   failures. It does not validate live AI services, the production sync backend or Chrome Web Store approval.

4. **Sync safety scenarios** — `node scripts/check-sync.cjs` (also run by the smoke suite/CI):
   first sign-in, two-device conflicts, stale choices, offline reconnect, deletion, malformed payloads,
   backup quota failures and edits queued during sync. Uses mocked storage and the existing revision API.

## Structure

```
lighttab/
├── manifest.json          # MV3 manifest (storage + optional bookmarks)
├── newtab.html            # entry page
├── privacy.html           # privacy policy
├── css/style.css
├── js/
│   ├── app.js             # main logic (storage / clock / search / grid / settings / drag)
│   ├── i18n.js            # zh + en dictionary, t() runtime, static DOM pass
│   ├── icondb.js          # built-in brand-icon library (simple-icons, CC0)
│   ├── lunar.js           # Chinese lunar calendar, with English name variants
│   ├── holidays.js        # China statutory-holiday table (2026, refreshed yearly)
│   ├── sync.js            # optional cloud sync, explicit conflict choices and local recovery
│   └── inject-ai.js       # content script that auto-fills and sends on Doubao / Dola / ChatGPT
├── scripts/
│   └── smoke.cjs          # offline smoke checks (node scripts/smoke.cjs)
├── tests/
│   └── e2e/               # local Playwright tests (see “Testing” above)
├── assets/                # logo + social preview (and the script that renders them)
└── icons/                 # 16 / 48 / 128
```

## License

[MIT](./LICENSE)
