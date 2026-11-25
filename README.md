# projectZero

The Dofus 3 world (all 15 884 maps) rebuilt from the installed client's assets: walk around with a customisable character
(any class, sex, head, colours, hat / cape / shield / wings), map music and ambience, animated map elements.

- Click a cell to move (run if the path is longer than 3 cells); walk onto an edge exit to change map.
- Top right: teleport (`5,-18` or a map id), sound on/off, character panel. `charview.html` previews the character.
- The URL keeps the current map (`?map=…&cell=…`); `&look={"breed":9,"gender":1,…}` overrides the character.

```bash
tools/build_all.sh               # generates public/maps, gfx, rigs, skins, audio, data from the client (git-ignored, ~3.5 GB)
npx http-server public -p 8123   # then open http://127.0.0.1:8123
```

How the assets are extracted and the formats: [docs/extraction.md](docs/extraction.md).
