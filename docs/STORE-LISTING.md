# Chrome Web Store listing kit (LightTab)

Work-in-progress copy for the store submission. Replace `<…>` placeholders before uploading.

## Basics
- **Name**: LightTab – Minimal New Tab (kept short: "LightTab")
- **Category**: Productivity
- **Version**: 1.20.0 (must match `manifest.json`)
- **Icon**: `icons/icon128.png` (128×128)

## Short description (≤132 chars)
> A calm new-tab home: live clock, lunar calendar, launcher search, shortcuts, to-dos and wallpapers. Local-first, zero tracking, offline by default.

## Full description (en, primary)
Lead paragraph:
> LightTab turns every new tab into a quiet, personal start page — and keeps your data in your
> browser. No account needed, no tracking, no ads; it works offline out of the box.

Feature bullets (use plain HTML `<li>` in the store editor):

- **Clock & date** – 24h/12h, seconds, three clock faces, Chinese lunar calendar (offline, 1900–2100).
- **Search box = launcher** – search your saved sites, get engine suggestions, run quick math, or jump to an exact shortcut by name.
- **Shortcuts grid** – folders, groups, drag to reorder (mouse *and* touch), bulk-add by pasting, brand icons baked in (no external icon requests).
- **To-dos** – optional due dates shown on the month calendar.
- **Widgets** – weather (optional, Open-Meteo, no key), countdown, pomodoro, movie-of-the-day, quote + wallpaper shuffle.
- **Wallpapers** – bundled gradient art + your own uploads, plus an optional online library you opt into.
- **Your style** – dark/light/system themes, custom accent colour, bilingual UI (English / 中文).
- **Data** – export/import JSON, merge import, optional self-hosted cloud sync (off by default), backup reminders.

Close with:
> Everything runs locally. The only required permission is `storage`.

## Chinese short version (zh, optional)
> 安静的新标签页：时钟、农历、启动器式搜索、快捷方式、待办与壁纸。本地优先、零追踪、默认离线可用。

## Screenshots (5 × 1280×800)
1. Default view (dark): clock left/top + search + grid.
2. Search as launcher: local site row + suggestions + calculator row.
3. Icon folders + group bar.
4. Widgets: to-dos with due dates, weather, countdown, movie.
5. Settings → Wallpaper / General (accent picker, engine manager, data panel).

## Permissions & data-safety form answers
| Item | Value |
|---|---|
| Required permissions | `storage` only |
| Optional permissions | `bookmarks` (on click "Import from bookmarks"), `tabs` (on click "Add current tab") |
| `host_permissions` | 3 suggestion endpoints only: Baidu / Google / Bing suggestions (typing suggests). No page data collected. |
| Content scripts | `doubao.com`, `dola.com`, `chatgpt.com` — only when LightTab opens those AI chats with `?lt_auto=1` from the prompt launcher, to auto-fill/send a prompt. Not active otherwise. |
| Remote data | Cloud sync (opt-in): email + password hash to `lighttab.atomwangnus.com`, whole-doc sync. Bing/Wallhaven/Unsplash wallpaper library & Open-Meteo weather (opt-in). |
| Analytics / cookies | None. No telemetry, no ads, no cookies. |
| Data deletion | Local: uninstall clears it. Cloud: delete account request via email to <support email> (backend deletion endpoint planned). |

## Store policy notes
- New-tab extension: does **not** override search engine, does **not** inject ads, never hijacks.
- If you remove the default search suggestions, zero keystrokes leave the device (except the URL you submit to your chosen engine).

## Support
- <support@example.com> — replace before submission.
