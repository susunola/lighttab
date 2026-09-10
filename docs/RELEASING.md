# Releasing & updating LightTab

How a new version gets built, uploaded, and actually lands on installed browsers.

## 1. Cut the version

The version lives in five places and they must agree — `scripts/smoke.cjs` asserts the manifest one,
so a mismatch fails CI:

| File | What |
|---|---|
| `manifest.json` | `"version"` — the one Chrome and the Web Store compare |
| `js/i18n.js` | `gen.version` — **both** the `zh` and `en` strings |
| `newtab.html` | the `.ver-line` fallback text |
| `js/app.js` | `version:` in `exportPayload()` |
| `scripts/smoke.cjs` | the hard-coded `manifest version is X` assertion |

Then add a `CHANGELOG.md` entry at the top (newest first) and update `README.md` if user-facing
behaviour changed.

## 2. Package

```bash
node scripts/package-release.cjs
```

Runs smoke, builds the single-file preview, stages the runtime files (plus the three bundled assets
under `assets/`), zips to `dist/lighttab-<version>-chrome.zip`, and verifies the archive. The Chrome
Web Store wants the zip with `manifest.json` at its **root** — that is what this produces.

## 3. Upload

Chrome Web Store developer dashboard → the existing item → **Package → Upload new package**.
Upload to the **same item** every time: the extension ID is owned by the item, and a new item means
a new ID, which no existing install can ever update to.

Uploading is not publishing. The new version stays in review until the dashboard shows it as
**Published**; nothing can update before that.

## 4. Why an update doesn't appear immediately

Two independent delays, both by design:

**a) Chrome polls.** By default it checks for extension updates **on startup and every few hours**.
There is no push. A freshly published version is simply not seen until the next poll.

**b) Updates only install while the extension is idle** — and an open extension page counts as
"in use". From Chrome's update-lifecycle documentation:

> A critical aspect of the update process is that an update is only installed when the extension is
> considered idle. […] any open extension pages, such as side panel, popup, or an options page,
> prevents the extension from being considered idle.

This is the interesting one for LightTab, because it **overrides the new-tab page**
(`chrome_url_overrides.newtab`). The extension *is* the new tab, so in normal use one of its pages is
always open and it never goes idle: the update gets downloaded and then sits there until the browser
restarts. That is exactly the "I have to uninstall and reinstall to upgrade" symptom — reinstalling
bypasses the idle rule and forces a fresh download of the published build.

### What the code does about it

`js/background.js` listens for the update and applies it as soon as it has been downloaded:

```js
chrome.runtime.onUpdateAvailable.addListener(() => { chrome.runtime.reload(); });
```

`onUpdateAvailable` fires only once the new version is already on disk, so this is not a network
check — it just skips the "wait until idle" step that LightTab can never satisfy. Every user setting
is written to `chrome.storage` as it changes, so the reload cannot lose data; the worst case is a
half-typed search being cleared, once per release.

### Forcing it (for testing your own release)

Don't reinstall — that wipes local storage unless cloud sync is on. Instead:

1. `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Update**

That makes Chrome fetch the latest published version of every installed extension immediately.
Restarting the browser does the same thing.

If that still shows the old version, the store copy has not finished publishing — check the
dashboard, not the browser.

## 5. Verify the update landed

- `chrome://extensions` → **Details** on LightTab → the version number.
- LightTab itself: **Settings → General**, the version line at the bottom.
- The dashboard: **Analytics → Users → Daily users by item** shows how many installs are on the
  newest version.

## 6. Testing locally vs the installed copy

An **unpacked** extension (`Load unpacked`) is a *different extension* from the store one:

- it gets its ID from the folder path, so two checkouts = two extensions = two separate storages;
- it never receives updates — reload it from `chrome://extensions`;
- the store copy keeps updating independently, which makes it look like an update "didn't work"
  when you were actually looking at the unpacked one.

Two ways to avoid that confusion:

- Paste the item's **public key** (developer dashboard → the item → *Public key*) into
  `manifest.json` as `"key"`. The unpacked build then derives the **same ID** as the store item and
  shares its storage, so dev builds and the installed extension are the same extension.
  The key must match the published one, otherwise the store rejects the upload — so only add it once
  you have the real value.
- Or keep exactly one LightTab in `chrome://extensions` while testing a release.

## 7. Pre-flight

```bash
node --check js/app.js          # and the rest of js/
node scripts/smoke.cjs          # CI runs this
node scripts/check-extension.cjs      # real MV3 install + runtime behaviour
node scripts/check-upgrade.cjs        # 1.18.0 → current, data preserved
node scripts/check-sync.cjs           # sync safety
```

These need `playwright`; run them with `NODE_PATH` pointing at an install if the repo has no
`node_modules`.
