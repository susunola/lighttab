# Microsoft Edge Add-ons submission kit (LightTab)

Fill the Edge Add-ons submission from this sheet. The package itself is the same zip as Chrome:
`dist/lighttab-1.24.4-chrome.zip` — no rebuild needed.

## Basics
- **Name**: LightTab – Minimal New Tab
- **Category**: Productivity
- **Version**: 1.24.4 (must match `manifest.json`; bump this line on every release)
- **Logo**: `icons/icon128.png` (128×128)
- **Support email / website**: fill in your Partner Center contact + the GitHub repo URL
  (https://github.com/susunola/lighttab). A **privacy policy URL is required** — privacy.html is in
  the repo; publish it somewhere public (e.g. GitHub Pages) and paste that URL.

## Short description
> A calm new-tab home: live clock, lunar calendar, launcher search, shortcuts and wallpapers. Local-first, zero tracking, offline by default.

(132 chars incl. spaces — fits the limit.)

## Full description
> LightTab turns every new tab into a quiet, personal start page — and keeps your data in your
> browser. No account needed, no tracking, no ads; it works offline out of the box.

- **Clock & date** – 24h/12h, seconds, three clock faces, Chinese lunar calendar (offline, 1900–2100).
- **Calendar page** – month / week / year views, lunar labels, China statutory-holiday badges, and a bundled HK/SG/MY/ID/TH holiday calendar. Subscribe to read-only ICS feeds (iCloud / Google / Outlook) or import .ics files — recurring rules and timezones are handled on-device, nothing is written back.
- **Search box = launcher** – search your saved sites, engine suggestions (Baidu / Google / Bing, switchable off), quick math without eval, local search history.
- **AI prompt launcher** – type once, send to several AI chats at once. Doubao, ChatGPT and DeepSeek auto-fill + auto-send via content script (Enter-first, send verified); WorkBuddy via its desktop app. Auto-send can be switched off; a prompt from any other website can fill but never send by itself.
- **Shortcuts grid** – iOS-style folders, groups, drag to reorder, bulk-add by pasting, brand icons baked in (no external icon requests), one-click bookmark import.
- **Free canvas layout** – on wide screens, drag every widget and the icon grid anywhere; cards snap and swap.
- **Movie of the day** – a curated daily pick, works offline.
- **Wallpapers** – bundled art + your own uploads, optional online library and daily auto-rotate.
- **Weather** – optional current conditions on the clock line, Open-Meteo, no API key.
- **Your style** – dark/light/system themes, custom accent colour, bilingual UI (English / 中文).
- **Data** – export/import JSON, optional cloud sync (off by default), conflict previews and local recovery backups.

> Everything runs locally. The only required permission is `storage`.

## Screenshots
Use the four WebP shots under `docs/screenshots/` (home / calendar / ai-launcher / settings).
Edge accepts PNG/JPG — convert first if the portal rejects WebP:
`cwebp` originals are 1600×1000; `sips -s format png docs/screenshots/home.webp --out home.png` works.

## Permissions & data-safety answers
| Item | Value |
|---|---|
| Required permissions | `storage`, `contextMenus` (selection → AI launcher entry) |
| Optional permissions | `bookmarks` (on click "Import from bookmarks"), `tabs` (on click "Add current tab") |
| `host_permissions` | 4 endpoints only: Baidu / Google / Bing search suggestions + Douban movie metadata |
| `optional_host_permissions` | One HTTPS wildcard (`https://*/*`), requested per-host only when the user pastes a calendar-feed URL; anonymous read-only GET; plaintext http feeds rejected |
| Content scripts | `doubao.com`, `dola.com`, `chatgpt.com`, `chat.openai.com`, `chat.deepseek.com` — active only on pages LightTab itself opens with an `lt_auto=1` launch; they fill/send the prompt the user just typed. Auto-send requires a storage nonce written by the extension. Not active otherwise |
| Remote data (all opt-in) | Cloud sync: email + password hash to `lighttab.atomwangnus.com`. Wallpaper library: same host. Weather: Open-Meteo. None are enabled by default |
| Analytics / cookies | None. No telemetry, no ads, no cookies |
| Data deletion | Local: uninstall clears it. Cloud: account deletion via support email |

## Review notes (preempt likely questions)
- New-tab extension: does **not** change the default search engine, injects no ads, never redirects navigation.
- The broad `optional_host_permissions` wildcard exists because ICS calendar feeds can live on any
  host; the permission is requested per-host at subscribe time, never at install, and only
  anonymous read-only GETs are made.
- The `?lt_auto=1` content-script flow: auto-send is gated on a one-time nonce in extension
  storage; a URL crafted by any other website cannot trigger sending.

## After publishing
- Edge updates do not reach Chrome users and vice versa — upload every release to both stores.
- Verify like Chrome: edge://extensions → Details → version number, then Settings → General bottom
  line in the extension itself.
