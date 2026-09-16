# QURRA — Hifz Lab Mutasyabihat Challenge

A static, self-contained web app. No backend, no build step, no dependencies at
runtime other than a browser. Progress is stored in the visitor's own browser
via `localStorage` — nothing is sent anywhere.

## Deploying to GitHub Pages

1. Create a new GitHub repository (any name — e.g. `hifz-lab-mutasyabihat`).
2. Upload **everything in this folder**, keeping the structure exactly as-is:
   ```
   index.html
   .nojekyll
   css/style.css
   js/app.js
   data/*.js   (8 files)
   ```
3. In the repo: **Settings → Pages → Source → Deploy from a branch**, pick
   `main` (or whichever branch you uploaded to) and `/ (root)`, then Save.
4. GitHub gives you a URL a minute or two later:
   - `https://<your-username>.github.io/<repo-name>/` if the repo is *not*
     named `<your-username>.github.io`
   - `https://<your-username>.github.io/` if it is
5. Open that URL. No further configuration is needed — every path in this
   project is relative, so it works the same whether it's served at the
   domain root or under a repo subpath.

## What's inside

- `index.html` — page shell, loads the data files then the app script
- `css/style.css` — all styling (QURRA design system)
- `js/app.js` — the entire app: navigation, quiz engine, progress tracking
- `data/*.js` — the verified Mutasyabihat datasets, each just a plain
  JavaScript file that sets one `window.QURRA_*` global (no fetch, no JSON
  parsing at runtime, so it works identically opened directly from disk or
  served over HTTPS)

## Local testing

Just open `index.html` directly in a browser (double-click it, or
`file:///path/to/index.html`) — no server required, since nothing here
uses `fetch`.

## Updating the dataset later

Each `data/*.js` file is `window.QURRA_<NAME> = [ ... ];` — a plain JSON
array wrapped in an assignment. To update one, regenerate the JSON and
re-wrap it the same way; the rest of the app doesn't need to change.
