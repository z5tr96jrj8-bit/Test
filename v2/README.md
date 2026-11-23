# RL Analysis 2

Video coding tool for football analysts: tag a match live or on video, review the clips, export them for the staff.
Everything stays on your device. Videos are never uploaded.

## Install

No installation and no build: these are plain HTML, CSS and JavaScript files.

- **Online (recommended):** open the `v2/` folder of the site, for example `https://<your-site>/Test/v2/`.
  On iPad, tap **Share → Add to Home Screen**. After a first opening, the app also works **offline**.
- **On a computer, without a site:** in this folder, run `python3 -m http.server`, then open `http://localhost:8000`.
  Opening `index.html` by double-clicking does **not** work, because browsers block JavaScript modules on `file://`.

Version 1 (the site root) is not changed. Each version keeps its own data.

## Bring your v1 coding

1. In **v1**: My projects → ⋯ → **Save everything**. This gives a `.json` file.
2. In **v2**: Home → **Import a backup file**, then choose that file.
   On the same device and site, **Copy the v1 data of this device** also works without a file.

The import keeps all matches, tags, projects, playlists and panels. It chooses as active panel the one that
matches your tags, and reuses the videos that v1 already kept on the device.

## Use

| To… | Do |
|---|---|
| Code a match | New match → choose the video (or none for live with the clock) → tap the panel buttons |
| Change the result, zone, note | The tag details are under the panel (Coding) or in the Details tab (Analysis) |
| Trim a clip | Tap a clip twice in the timeline, then drag it or pull its yellow edges |
| Split by half | ⋯ → **Kick-off here** and **2nd half starts here** at the right moment in the video |
| Undo / redo | Arrows at the top (up to 100 actions) |
| Edit the panel | Panel → Edit: move, resize, colour, results, clip length, role (goal for / against) |
| Compare a team's matches | Project → **Sort clips**: clips by tag, all matches or one, star the ones to keep |
| Export | Export icon: CSV (Excel), match JSON; video of a clip, a playlist or a montage |
| Back up everything | My projects → ⋯ → **Save everything** (a reminder appears every week) |
| French interface | Home → **Français** |

## Code structure

```
index.html            empty shell
css/                  tokens.css (colours, sizes) + app.css
js/main.js            start-up and navigation
js/core/              util, db (IndexedDB), store (save + undo/redo), migrate (v1 → v2), i18n
js/model/             panel, match (tags, time, rows, score), project
js/video/             player, vault (videos kept on the device), recorder (video export)
js/ui/                one file per screen or component (home, match, pad, timeline, panel editor, sort, dialogs)
js/export/files.js    CSV, JSON, full backup
js/i18n/fr.js         French texts (the keys are the English texts)
sw.js                 offline cache
```
