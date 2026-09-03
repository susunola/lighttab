# LightTab — Minimal New Tab

极简新标签页：时钟问候（含中国农历）、聚合搜索、AI 模板发射台、图标分组网格、待办与壁纸。**本地存储零上传**，支持书签与 JSON 备份。

A minimal, calm, fast new-tab page: live clock & greeting (with Chinese lunar calendar), one-box search, AI prompt launcher, grouped icon grid, to-dos and wallpapers. **100% local, zero data upload**, with bookmark import and JSON backup.

## Features

- **Clock & greeting** — live time, date, time-of-day greeting, plus Chinese lunar calendar (干支纪年 / 生肖 / 闰月, 1900–2100, pure local computation)
- **One-box search** — URL shortcuts + 6 search engines + 2 AI chats (Doubao, ChatGPT) + WorkBuddy deep link
- **AI Prompt Launcher** (press `/`) — pick a template, type your content, send the same prompt to multiple targets at once. Prompt text never travels in the URL (nonce channel in extension mode)
- **Icon grid** — drag-to-reorder, folders/groups, built-in brand-icon library (zero external favicon requests)
- **To-dos** and **6 curated gradient wallpapers** + custom image upload
- **JSON backup / restore** and one-click Chrome bookmark import (optional permission)

## Privacy

- Single permission: `storage` — everything is saved in your browser only
- No network requests, no tracking, no analytics, no account
- Optional `bookmarks` permission is requested only when you import bookmarks

## Install

**Chrome Web Store** — [link](https://chromewebstore.google.com/) (coming soon)

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

## Structure

```
lighttab/
├── manifest.json          # MV3 manifest (storage + optional bookmarks)
├── newtab.html            # entry page
├── css/style.css
├── js/
│   ├── app.js             # main logic (storage / clock / search / grid / settings)
│   ├── icondb.js          # built-in brand-icon library
│   ├── lunar.js           # Chinese lunar calendar (pure local)
│   └── inject-ai.js       # content script for Doubao / ChatGPT auto-fill
└── icons/                 # 16 / 48 / 128
```

## License

[MIT](./LICENSE)
