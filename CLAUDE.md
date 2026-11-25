# projectZero

Dofus 3 world rebuilt in the browser from the installed client's assets (local repo only: never add a remote or push).

- `README.md`: what the game does, how to build and run it.
- `docs/extraction.md`: how every asset is extracted from the client, file formats.
- `docs/ui.md`: the interface (HUD widgets, client menus converted from UI Toolkit, how windows are filled, known gaps, how to test).
  Read it before touching `public/hud.js`, `public/uitk*.{js,css}` or `tools/extract/uitk.js`.
- After each change: update the docs above, commit locally.
