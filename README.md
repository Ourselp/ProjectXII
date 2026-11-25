# projectZero

The Dofus 3 world (all 15 884 maps) rebuilt from the installed client's assets: walk around with a customisable character
(any class, sex, head, colours, hat / cape / shield / wings), map music and ambience, animated map elements.

```bash
npm run build   # tools/build_all.sh: generates public/maps, gfx, rigs, skins, audio, data, ui from the client (git-ignored, ~3.5 GB)
npm start       # http://127.0.0.1:8123, served with caching off
```

Nothing is cached for now: the server sends `no-store`, and every module, data file, texture and sound is requested with a
per-page-load `?v=` (index.html imports `game.js?v=<now>`, the other modules reuse that tag; assets use `BUST` from `rig.js`).

## Playing

- Click a cell to move (run if the path is longer than 3 cells). Click beyond a map edge to leave that way: green arrow where the
  map has an exit on that side, forbidden sign where it doesn't.
- HUD (classic layout, skinned with the client's own UI sprites: heart life gauge, AP star, MP diamond, spell slots, menu icons, window frames): place name top left; bottom banner = chat | "Chabou" portrait, life / AP / MP | class spell bar
  (hover for details, keys 1–0) | menu.
- Menu (banner, client menu icons): the client's own windows, converted from its UI Toolkit layouts (draggable by the title, Esc closes):
  Caractéristiques (C, our hero's name / class / AP / MP), Sorts (S, the class spells in the grimoire), Inventaire (I, hero on the pedestal),
  Quêtes (Q), Succès (U), Métiers (J), Encyclopédie (B), Amis (F), Guilde (G), Alliance, Alignement, Montures (D), Compagnons, Almanax,
  Recherche de groupe, Cosmétiques, Préréglages, Guide, Boutique. Most are empty shells: in the client the server fills them.
  Our own windows: Carte du monde (M: click a position to go there), Apparence (A: class, head, colours, equipment),
  Options (O: music / ambience volume, cell grid), Aide (H).
- `uitk.html`: every one of the client's 699 layouts (windows, tooltips, popups, list rows), filterable.
- Chat: Enter to type, `/tp 5,-18` or `/tp <map id>` to teleport.
- The URL keeps the current map (`?map=…&cell=…`); `&look={"breed":9,"gender":1,…}` overrides the character.
  `charview.html` previews the character in every direction.

How the assets are extracted and the formats: [docs/extraction.md](docs/extraction.md).
