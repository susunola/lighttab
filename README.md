# LightTab — Minimal New Tab

极简新标签页：时钟问候（含中国农历）、聚合搜索、AI 模板发射台、图标分组网格、待办与壁纸。**本地优先存储**，可选邮箱账号云同步，内置必应每日壁纸库，支持自由画布布局、书签与 JSON 备份。

A minimal, calm, fast new-tab page: live clock & greeting (with Chinese lunar calendar), one-box search, AI prompt launcher, grouped icon grid, to-dos and wallpapers. **Local-first storage**, with optional email-account cloud sync, a built-in Bing daily-wallpaper library, free-canvas layout, bookmark import and JSON backup.

## Features

- **Clock & greeting** — live time, date, time-of-day greeting, plus Chinese lunar calendar (干支纪年 / 生肖 / 闰月, 1900–2100, pure local computation)
- **Bilingual UI (中文 / English)** — switch the whole interface in *Settings → General → Language*; greetings, dates, lunar line, calendar, engine names, menus and messages all follow. Persisted locally, no reload needed
- **Calendar widget** — local month view with lunar-day labels and month navigation (zero network)
- **One-box search** — URL shortcuts (bare domains with paths work, e.g. `github.com/susunola`) + 6 search engines + 2 AI chats (Doubao, ChatGPT) + WorkBuddy deep link
- **AI Prompt Launcher** (press `/`) — pick a template, type your content, send the same prompt to multiple targets at once. Prompt text never travels in the URL (nonce channel in extension mode); if auto-fill fails on the target site, the prompt is copied to your clipboard with an on-page notice
- **Icon grid** — drag-to-reorder, folders/groups, built-in brand-icon library (zero external favicon requests)
- **To-dos** and **6 curated gradient wallpapers** + custom image upload + Bing daily wallpaper library
- **Free canvas** — on wide screens, drag widgets and cards anywhere; cards snap to grid and swap positions
- **Cloud sync (optional)** — email sign-up/login, whole-document last-write-wins sync across devices via a self-hosted backend
- **JSON backup / restore** and one-click Chrome bookmark import (optional permission)

## Privacy / 隐私

**本地优先，默认零网络。** 所有数据（快捷方式、待办、模板、设置、壁纸）只保存在浏览器的 `chrome.storage.local`（纯浏览器预览时退回 `localStorage`）。无跟踪、无分析、无广告。
**Local-first, zero network by default.** All data (shortcuts, to-dos, templates, settings, wallpaper) stays in the browser's `chrome.storage.local` (falls back to `localStorage` in plain-browser preview). No tracking, no analytics, no ads.

仅以下**可选功能**会在你主动使用时发起网络请求（HTTPS，后端为自建服务 `lighttab.atomwangnus.com`）：
The following **optional features** make network requests only when you actively use them (HTTPS, to a self-hosted backend at `lighttab.atomwangnus.com`):

- **云同步 / Cloud sync** — 邮箱注册登录（密码仅存加密哈希），按整文档 LWW（last-write-wins）同步上述数据到自建后端，用于多设备一致。token 只存本地，不参与同步。
  Email sign-up/login (only a password hash is stored server-side); whole-document last-write-wins sync to the self-hosted backend keeps multiple devices consistent. Your token stays local and is never synced.
- **必应壁纸库 / Bing wallpaper library** — 在设置页点击加载时，经后端代理拉取必应每日壁纸的元数据与图片。
  Only when you open the wallpaper library in settings does the extension fetch Bing daily-wallpaper metadata and images via the backend proxy.

可选 `bookmarks` 权限仅在你点击「从书签导入」时请求。
The optional `bookmarks` permission is requested only when you click "import from bookmarks".

## Install

**Chrome Web Store** — 尚未上架（not yet published），请先使用下方开发者模式安装。

**Developer mode**
1. Clone this repo
2. Open `chrome://extensions`
3. Enable **Developer mode** (top-right)
4. **Load unpacked** → select this folder

## Tech

- Chrome Extension Manifest V3
- Pure HTML / CSS / vanilla JS — zero dependencies, zero build step
- `chrome.storage.local` with `localStorage` fallback (for `file://` preview)
- Schema-versioned migrations
- Offline smoke checks: `node scripts/smoke.cjs` (syntax / manifest / version consistency / pure-function assertions)

## Structure

```
lighttab/
├── manifest.json          # MV3 manifest (storage + optional bookmarks)
├── newtab.html            # entry page
├── css/style.css
├── js/
│   ├── app.js             # main logic (storage / clock / search / grid / settings)
│   ├── i18n.js            # zh/en dictionary + t() runtime + [data-i18n] static pass
│   ├── sync.js            # optional cloud sync (email auth + whole-doc LWW)
│   ├── icondb.js          # built-in brand-icon library
│   ├── lunar.js           # Chinese lunar calendar (pure local, zh + en names)
│   └── inject-ai.js       # content script for Doubao / ChatGPT auto-fill
├── scripts/
│   └── smoke.cjs          # offline smoke checks (node scripts/smoke.cjs)
└── icons/                 # 16 / 48 / 128
```

## License

[MIT](./LICENSE)
