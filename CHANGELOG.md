# 1.24.2 — bundled SEA holidays

- Calendar widget on by default.
- Ships one removable subscription: 港新马印泰假期 (HK/SG/MY/ID/TH, 2026–2028, Simplified Chinese).
- Deleting it is sticky on this device (`lt.caldropped`). First launch of 1.24.2 replaces the default feed list with this single ICS.

# 1.24.0 — calendar page, AI context menu, sync backups

- Calendar grows into its own page (Settings / navigation → **Calendar**): month, week and year
  views, an upcoming-events side list, and personal calendar management — add your own calendars,
  import `.ics` files with a preview banner, export, rename, recolor and delete them.
- New **LightTab · AI** right-click context menu sends the current selection to your chosen AI
  site; temporary selection/delivery storage entries are swept after 30 minutes by the background
  worker.
- Sync backups: export, restore and delete cloud backup snapshots from Settings → Sync.
- Search engine manager: add custom engines and restore the built-in list.
- Weather now paints into a dedicated `#clock-weather` element next to the clock instead of being
  appended to the date line.
- Daily wallpaper rotation picks a random pool entry (previously always the head); the picker takes
  an injectable `rand` for tests.
