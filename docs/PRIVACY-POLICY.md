# LightTab — Privacy Policy (draft for your website / store listing)

> Replace the bracketed placeholders (`<…>`) with your contact details. This mirrors what the
> extension actually does; keep it updated whenever behaviour changes. The in-app policy page is
> `privacy.html` — keep both in sync.

## 1. The short version

LightTab is **local-first**: your shortcuts, to-dos, settings, wallpapers and templates live in
your browser (`chrome.storage.local`, or `localStorage` when previewed from a local file). By
default **no data leaves your device**, and LightTab has **no tracking, no analytics and no ads**.

## 2. What is collected, and when

| When | What | Where it goes |
|---|---|---|
| Always (default) | Your local content and settings | Your browser only |
| You type a search query | The query + your chosen engine's URL | Directly to that search engine, when you submit |
| Search suggestions are enabled | The keystrokes you type | Directly to your chosen engine's suggestion endpoint (Baidu / Google / Bing). Off by default? **No — on by default; you can disable it in Settings → General.** |
| You enable the optional online wallpaper library | Requests for wallpaper metadata/images | To the LightTab service `lighttab.atomwangnus.com` |
| You enable the optional weather widget | Your city name + coordinates + weather requests | Open-Meteo (`api.open-meteo.com`, `geocoding-api.open-meteo.com`) |
| You subscribe to a calendar (*Settings → Calendar*) | An anonymous read-only `GET` of the one published ICS link you pasted | To that calendar's own host (e.g. `*.icloud.com`, `*.google.com`, `*.outlook.com`). No cookies, no credentials, no write access |
| You enable optional cloud sync | Email address, a password hash (never the password itself), and your synced documents | `lighttab.atomwangnus.com` over HTTPS |
| You enable "Record errors locally" | Error **messages** only (no URLs, no stacks, no network) | Stored on your device; you can export the file yourself |

Nothing else is transmitted. There is no telemetry, no fingerprinting, no cookies, and no third-party
advertising.

## 3. Permissions

- **Required**: `storage` — keeps your local data.
- **Optional** (requested only when you click the feature):
  - `bookmarks` — "Import from bookmarks".
  - `tabs` — "Add current tab" (reads the active tab's title/URL once).
- **Content scripts**: only `doubao.com`, `dola.com` and `chatgpt.com`, and only when you open one
  of those AI chats from LightTab's prompt launcher (URL contains `lt_auto=1`), to auto-fill and
  send the prompt you typed. They are not active otherwise.
- **Host permissions**: the three search-suggestion endpoints (Baidu / Google / Bing). No page
  content is read.
- **Optional host permissions**: the calendar-feed hosts (`*.icloud.com`, `*.google.com`,
  `*.googleusercontent.com`, `*.outlook.com`, `*.office.com`, `*.live.com`,
  `*.calendar.yahoo.com`, `*.fastmail.com`, `*.nextcloud.com`). They are declared as *optional* so
  the install prompt never asks for them; each one is requested only when you subscribe to a feed on
  that host, and only a read-only `GET` of the URL you pasted is ever made. If you never open
  *Settings → Calendar*, they are never requested.
- **Calendar feed URLs never leave the device.** A published calendar link is an unguessable
  capability, so it is deliberately excluded from cloud sync and from JSON exports; it is stored
  under its own local key (`lt.calendars`). Fetched events are cached locally under `lt.calcache`
  and are not synced either.

## 4. Cloud sync (optional)

- Enabling sync requires an email and password. The server stores only a **hash** of your password
  and verifies your email before syncing.
- Sync is whole-document, last-write-wins over HTTPS. Your authentication token stays on your
  device and is never synced.
- To delete your data: clearing the extension removes local data; contact
  `<support@example.com>` to delete your account/cloud data (server-side deletion endpoint is
  planned — until then we can delete on request).

## 5. Data retention & deletion

- Local: uninstalling the extension or clearing site data removes it.
- Diagnostics (optional): stored locally, capped at 100 messages, deleted with the rest.
- Backups you export are files you control.

## 6. Children

LightTab is not directed at children and does not knowingly collect personal information from
children.

## 7. Changes & contact

Changes will be noted in the extension's changelog. Questions: `<support@example.com>`.


AI 最近任务默认关闭，仅在启用后保存在本机（最多 10 条，可清空）。选中文字右键入口仅将内容保存为本地草稿，用户发射后才交给选定服务。发射状态记录不包含提示词，过期后在新标签页启动时清理。诊断导出仅保留错误类别和时间，不包含原始错误文本。
