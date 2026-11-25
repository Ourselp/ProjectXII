# Interface (HUD and menus): how it works, how to change it

Everything a new session needs to work on the interface. The interface is **the client's own UI**: Dofus 3 is built with
Unity UI Toolkit, and its layouts (UXML) and stylesheets (USS) are converted to HTML/CSS at build time, then shown and filled
at runtime. Hand-made parts are limited to what the client builds in C# (its custom controls and the data it fills in).

## Files

| File | Role |
|------|------|
| `tools/extract/uitk.js` | build: UXML → `public/ui/uitk/layouts/<name>.html` (699 layouts + `index.json`), USS → `public/uitk-client.css`, images → `public/ui/uitk/img/`, fonts → `public/ui/uitk/fonts/` (all generated, git-ignored) |
| `tools/extract/unityread.js` | Unity 6 SerializedFile reader (type trees, SerializeReference; parent links come back as `{$rid}`; `readFile().externals` = file table for `m_FileID`) |
| `public/uitk.js` | runtime: the scaled layer, windows (`show/hide/toggle`), HUD widgets (`widget`), drag / resize, context menu (`menu`), fragments, code-built control behaviour, placeholder cleanup |
| `public/uitk-controls.css` | hand CSS for Dofus' code-built controls (window frame, buttons, icons, dividers, gauges, slots, widgets, resize handle, our HUD slots, cosmetics grid) |
| `public/hud.js` | the game's use of it: HUD widgets, menu, every window fill (`FILL[layout]`), random test stats, cosmetics, monster group tooltip, chat, spell bar |
| `public/uitk.html` | gallery of all 699 layouts through the same runtime (`?l=<name>`): first stop to see what the client has |
| `public/index.html` | page: our own `.win` windows (world map, appearance, options, help), hidden HUD parts adopted by widgets (`#chatlog`, `#say`, `#mute`) |

Build: `tools/build_all.sh` (unpacks every `aa/StandaloneWindows64` bundle to `extract/raw_uxml`, exports fonts to `extract/ui_fonts`,
then `node tools/extract/uitk.js`). After changing `uitk.js` only: `node tools/extract/uitk.js` (a few seconds).

## Conversion rules (uitk.js)

- **USS**: properties are numeric `StylePropertyId` (`group << 16 | index`, table `GROUPS` from UnityCsReference 6000.3); value types
  in this build: 1 keyword, 2 float, 3 dimension, 4 colour, 5 resource path, 6 asset, 7 enum, 8 variable, 9 string, 10 function
  (`valueIndex` = StyleValueFunction: 1 `var`…, then an argument count), 11 comma, 12 scalable image. Selector parts: 1 `*`,
  2 type → `[data-t="Type"]`, 3 class, 4 pseudo, 6 `#id`. Pseudo `:root` → `:where(.uitk-root)` (never the page), `:checked` →
  `.is-checked`, `:disabled` → `.is-disabled`.
- **Sheets**: `MergedUSS`, Unity `default`, theme `Standard`, `MediumFont_Standard` are global. The ~370 sheets layouts attach
  (`m_Stylesheets`) hold most layout rules and must stay **scoped** (ids like `#ctr_content` repeat across layouts): class `ss<n>`
  on the element they are attached to, rules emitted as `:where(.ss<n>) sel, sel:where(.ss<n>)`. Fragments carry their scope.
- **Unity → CSS**: every element is a column flexbox (border-box, flex-shrink 1, min size 0); `-unity-text-align` → `text-align` +
  inherited `--uta-v`; sprite border / `-unity-slice-*` → `border-image`; `-unity-background-image-tint-color` → `--u-tint` drawn by
  a `::before` masked with `--u-img` (Dofus has its own `--tint`, hence `--u-`); `picking-mode="Ignore"` → class `pick-ignore`
  (`pointer-events:none` on that element only: without it, 2 789 overlays steal clicks). All urls relative to `public/`
  (a url inside `var()` resolves against the sheet that uses it).
- **Templates**: `TemplateAsset` + `m_Usings`, and controls that load their namesake layout (`EntityMainStats`, prefix match:
  `EquipmentComponentCharacter` → `EquipmentComponent`). `InlineXmlGrid uxml-path=…` → `<template data-item=…>`.
- **Code-built controls** rebuilt from their attributes in `control()`: `WindowFigma` (title bar, icon from `img-url`, close),
  `MagneticDragWindow` (`.mdw`: header shown on hover, resize corner unless a `*-resizable="false"`), `DofusButtonCustom` /
  `DofusToggleButtonCustom` (toggles default to secondary; `icon-type="Image"` → `image-url`, else the named icon),
  `DofusIcon`, `Divider`, `ExtendedProgressBar*` (no `high-value` and value ≤ 1 = a ratio), `Slot`, `SlotGrid`, checkbox, inputs,
  tabs, section / table headers. Icons are sprites looked up by name in `extract/ui_raw`.
- Sprites set only by code (menu icons, characteristic tiles `statBack1-6` / `tx_<stat>`, chevrons…) are copied by the explicit
  list before `let built` in uitk.js: **add to it** when hud.js uses a new client sprite.

## Runtime (uitk.js)

- Layer `#uitk-layer` (class `uitk-root`), zoom = `max(w/1920, h/1080) × 0.9 × localStorage.uiScale` (client PanelSettings:
  reference 1920×1080, shrink; uiScale = Options "Taille de l'interface").
- `show(name, fill)`: mounts the layout full-screen (its own styles place it), runs `fill(root)`, centres `.wf` windows, z-order on
  click, draggable title bar, `.wf-close`, Esc (hud.js). `fragment(name)` = a layout's elements to insert in another one.
- `widget(name, fill, place, {scale})`: HUD module, z below windows; position `localStorage['hud:<name>']`, size
  `localStorage['hudsize:<name>']`. Drag by `.mdw-head` (or anywhere when the widget has no header, e.g. XP gauge); resize by
  `.mdw-resize` (width/height, or zoom when `scale`). `/hud` = `resetWidgets()` + reload.
- `controls(root)`: placeholders (Lorem ipsum, `zfef…`, `UN-NOM-VRAIMENT…`, raw keys `ui.xxx` → French for the usual ones
  in `KEYS`, else empty: named keys are not in `I18n/fr.bin`), `MultipleSlots` (first slot shown, others in a drawer opened by
  `#btn_open`).
- `menu(e, [[label, fn, icon, checked]], title)`: context menu with the client's `contextMenu` classes.
- Never let the page scroll (guard on `scroll`).

## HUD (hud.js `setupWidgets`)

| Widget (layout) | What we fill |
|---|---|
| `characterInformations` | life / AP / MP from the test stats; fight-only parts hidden (`ctr_ip`, shield, erosion / threshold masks); resize = scale |
| `actionBar` | `#gd_spellitemotes` becomes `#spellbar`: class spells, keys 1–0, tooltip, click = chat line |
| `bannerMenu` | `#gd_btnUis` becomes `#menu`: `MENU` (client windows) + `MORE` (our windows) + mute, grid filled top to bottom, resizable |
| `chatview` | adopts `#chatlog` and `#say` from index.html, resizable |
| `widgetProgressGauge` | level + ratio; ⋮ = `ui.menu` to follow character / guild / mount XP or honour (`localStorage.gauge`) |

## Windows (hud.js `MENU`, `FILL`)

Opening a client window sets its title from `MENU` (layouts carry placeholders such as "[Inventory]") then runs `FILL[layout]`.

| Menu | Layout | Filled with |
|---|---|---|
| Caractéristiques (C) | `characterSheetUi` | header, XP / energy, PA PM PO; left column = 6 `MainStatItem` tiles (Vitalité, Sagesse, Force, Intelligence, Chance, Agilité: `statBack<n>`, `tx_<stat>`, totals), chevron opens the base / equipment / consumables / bonus breakdown; radar graph (SVG, `EntityStatsGraph` params: 5 axes, rotated 36°, radius 80, 6 rings, icons 20 px out); detailed view = `statTwoColumnsItem` rows; social boxes titled |
| Sorts (S) | `playerSpell` | class tab, `spellList` + one `spellButtonsEntry` per class spell |
| Inventaire (I) | `equipmentStorageUi` | our 3D hero on the pedestal, kamas |
| Cosmétiques | `cosmeticUi` | skins we wear (look.js `cosmetics(slot)`) per category (hat, cape, shield, wings), thumbnail of the hero wearing each (one offscreen WebGL), click = wear / take off (`equip`), left slots show what is worn, 3D preview |
| Encyclopédie (B) | `encyclopediaBase` | tab "Bestiaire" = `bestiaryTab` + `bestiaryTabItem` rows from `monsters.json` (portrait `ui/monsters/<id>.png`, family, archmonster / bounty marks, levels), search, count, detail panel |
| Quêtes, Succès, Métiers, Amis, Guilde, Alliance, Alignement, Montures, Compagnons, Almanax, Recherche de groupe, Préréglages, Guide, Boutique | client layouts | not filled yet: the client fills them from server data (empty states / placeholders cleared) |

**Test character**: `rollStats()` (localStorage `stats`, `/stats` rolls again): level, characteristics with their four parts,
secondary stats, damages, resistances, XP, energy, guild / mount / honour progress.

**Monster group tooltip**: `groupTip(group, event)` (called from game.js on hover): `WorldRpMonstersGroupTooltip` + one
`MonsterTooltipLine` per monster: "Niveau <sum>", XP for the hero (grade XP × (1 + Sagesse / 100)) and the group's base XP,
archmonster / boss / bounty icons. Data: `monsters.json` `mon[id]` = `[name, bone, skins, colours, scale, minLvl, maxLvl,
flags (1 archmonster, 2 boss), [[level, xp] per grade], family]` (tools/extract/monsters.js).

## Known gaps (next steps)

- Windows filled by server data in the client (list above) show their empty layout.
- Encyclopédie: only the bestiary; its filters (level, family, area) and the detail stats / spells / drops are empty.
- Main stats tooltips, spell tooltips in the client's `SpellTooltip` layout, item tooltips: not done.
- Our own windows (world map, appearance, options, help) are still plain HTML, not client layouts.

## Checking a change

`tools/cdp_shot.js <url> <out> <ms,...> "<js>"` drives headless Edge; it works on `file:///…/public/index.html` (no server
needed). The expression runs, then the screenshot is taken: make it `async` and wait for windows to fill. Useful probes:
`document.elementFromPoint` (is something stealing the click?), bounding boxes against the window's (overflow), dispatching
`PointerEvent`s on `.mdw-head` / `.mdw-resize` (drag / resize). Sweep: open every `#menu [data-win]` in turn and screenshot.
