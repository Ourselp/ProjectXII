# Dofus 3 extraction (Unity client)

The current Dofus client (Unity 6000.3.16f1, IL2CPP, tested on 3.7.14.18) stores everything under
`<install>/Dofus_Data/StreamingAssets/Content/`:

| Folder | Content | Format |
|---|---|---|
| `Data/` | game tables (items, monsters, subareas, breeds…) | UnityFS bundles, `MonoBehaviour` with `[SerializeReference]` data |
| `I18n/fr.bin` | all texts | custom: `u32 count` at offset 3, then `count × (u32 id, u32 offset)`, strings = 7-bit varint length + UTF-8 |
| `Map/Data/` | 15 884 maps (`map_<id>`), grouped arbitrarily into `mapdata_assets_world_N.bundle` | `MonoBehaviour` + `SerializeReference` |
| `Map/Textures/1x/` | map sprites, named by gfxId, pivot = centre, 1 px = 1 unit | Sprite / Texture2D |
| `Characters/Bones/` | animation rigs: `bone_1-*` = player (`1-movement` walk/run/swim, `1-static` idle…), `bone_<gfxId>` = animated map element (zaap…), others = monsters/NPCs | `TextAsset` animations + mesh skin |
| `Characters/Skins/` | body parts per look (`skin_80` = Iop male body, `skin_2124` = an Iop head, hats, capes…) | mesh skin + atlas |
| `Audio/Banks/Desktop/` | music, ambience, sounds | FMOD Studio `.bank` (FSB5 Vorbis inside) |

Bundles are not encrypted, but the Unity version is stripped from them: always pass `--unity-version 6000.3.16f1`.

## Build

Everything in `public/` except the code (`index.html`, `*.js`) is generated and git-ignored (~3.5 GB):
`maps/`, `gfx/`, `rigs/`, `skins/`, `audio/`, `data/`.

```bash
tools/build_all.sh        # Git Bash, repo root; DOFUS3=<install dir> to override the default location
npx http-server public -p 8123
```

Tools to download into `tools/bin/` (git-ignored):
- [AssetStudioModCLI](https://github.com/aelurum/AssetStudioMod/releases) v0.20.0 `net472_win32_64` → `tools/bin/assetstudio/`: unpacks bundles (`-m extract`), exports images (`-m export -t sprite|tex2d`).
- [vgmstream-cli](https://github.com/vgmstream/vgmstream/releases) win64 → `tools/bin/vgmstream/`: FSB5 subsongs → wav.
- `ffmpeg` on the PATH: wav → ogg.

| Script | Does |
|---|---|
| `tools/extract/unityread.js` | our SerializedFile reader driven by the embedded type trees; decodes `ManagedReferencesRegistry` (SerializeReference), which AssetStudio leaves empty. Needs `commonstrings.txt` (Unity's built-in string table, read from `UnityPlayer.dll`). No decompilation of the game. |
| `data.js`, `i18n.js` | tables → `extract/data/*.json`, French texts → `extract/data/i18n_fr.json` |
| `maps_build.js` | all maps → `public/maps/<id>.json` + `index.json` (`id → [x, y, subArea, worldMap]`), sprites → `public/gfx/` |
| `fmod.js` | FMOD event GUID → waveforms index (`extract/fmod_events.json`) |
| `audio.js` | music/ambience of every map → `public/audio/*.ogg` + `index.json` (event → files) |
| `anim_gfx.js`, `rigs.js` | animated map elements + player rigs → `public/rigs/`, all skins → `public/skins/` |
| `worldmap.js` | world map window → `public/data/world.json`: per world (`MapsInformation.worldMap`), one map per position (first listed in `MapsCoordinatesDataRoot`) |
| `looks.js` | character creator data → `public/data/looks.json` |
| `ui_skin.js` | client UI skin (`aa/StandaloneWindows64/ui*`, `icons_*`, `ornaments_*`… exported to `extract/ui_raw/`, ~9 000 images): filterable gallery `extract/ui_raw/index.html`, HUD pieces (heart gauge, AP/MP counters, spell slots/buttons, timeline, banner, entity gauges, HUD buttons) → `public/ui/hud/` |
| `ui.js` | HUD: class spells (name, icon `Picto/Spells` `sort_<iconId>`, AP, range, description) → `public/data/spells.json`, portraits `Head_<bodySkin>` → `public/ui/` |
| `uitk.js` | client menus: every `aa/StandaloneWindows64` bundle unpacked to `extract/raw_uxml/` (+ fonts → `extract/ui_fonts/`, Lexend): 699 UXML layouts → `public/ui/uitk/layouts/<name>.html`, USS → `public/uitk-client.css`, images → `public/ui/uitk/img/`. Runtime: `public/uitk.js` (+ hand CSS for Dofus' code-built controls: `public/uitk-controls.css`); gallery `public/uitk.html` |

**Menus (Unity UI Toolkit).** Dofus 3's UI is UI Toolkit: `VisualTreeAsset` (UXML) and `StyleSheet` (USS) MonoBehaviours in
`uielements_assets_all` (themes in `tss_assets_all`). Unity 6 serialisation, read with `unityread.js` (SerializeReference tree;
parent links are back-references, kept as `{$rid}`):
- UXML: `m_VisualTree` = tree of `{m_FullTypeName, m_Properties [name, value], m_Classes, m_RuleIndex, m_Children}`; inline styles are
  rules of the `inlineSheet` StyleSheet (`m_RuleIndex`); templates via `m_Usings` (alias → layout) and `TemplateAsset.m_TemplateAlias`.
  Many Dofus controls (`EntityMainStats`, `EquipmentComponentCharacter`…) load the layout named like them: expanded the same way.
  Dofus' Figma controls (`WindowFigma`, `DofusButtonCustom`, `DofusIcon`, `Divider`, `ExtendedProgressBar*`, `Slot`…) build their parts
  in C#: rebuilt from their attributes (`title`, `img-url`, `icon`, `main-style`, `value`…), icons looked up by sprite name.
  `InlineXmlGrid uxml-path=…` = list filled at runtime from that item layout (`<template data-item>`).
- USS: `m_Rules[] = {m_ComplexSelectors[{m_Selectors[{m_Parts[{m_Value, m_Type}], m_PreviousRelationship}]}], m_Properties[{m_Id, m_CustomName, m_Values[{m_ValueType, valueIndex}]}]}`;
  values index the sheet's `floats / dimensions {unit, value} / colors / strings / assets (PPtr) / scalableImages`.
  `m_Id` = StylePropertyId = `group << 16 | index` (UnityCsReference 6000.3 `StylePropertyEnums.cs`, table in `uitk.js`); `-1` = custom `--var`.
  Value types (this build, with ResourcePath): 1 keyword, 2 float, 3 dimension, 4 colour, 5 resource path, 6 asset, 7 enum, 8 variable,
  9 string, 10 function (`valueIndex` = StyleValueFunction: 1 `var`, 3 `linear-gradient`…, then an argument count), 11 comma, 12 scalable image.
  Selector parts: 1 `*`, 2 type (→ `[data-t=…]`), 3 class, 4 pseudo-class, 6 `#name`.
- Unity specifics mapped to CSS: every element a column flexbox (border-box, `flex-shrink: 1`); `-unity-text-align` → `text-align` +
  `--uta-v` (inherited) for the vertical part; sprite borders / `-unity-slice-*` → `border-image`; `-unity-background-image-tint-color`
  → a `::before` with the tint colour masked by the image (`--u-tint`, `--u-img`: Dofus has its own `--tint`); urls all relative to
  `public/` (a url inside `var()` resolves against the sheet that uses it). Scaling: `PanelSettings` reference 1920×1080, shrink, ×0.9.
- Sheets: `MergedUSS` (tss bundle) + Unity's `default` + the `Standard` theme are global; the ~370 sheets that layouts attach to
  their elements (`m_Stylesheets`, where most layout rules are: `#tx_hp{width:106px}`…) apply only to that element's subtree in
  Unity, and ids like `#ctr_content` repeat across layouts, so each is scoped: class `ss<n>` on the element, rules become
  `:where(.ss<n>) sel, sel:where(.ss<n>)` (same specificity). `:root` → `:where(.uitk-root)` (the theme never touches the page).
- HUD widgets = `MagneticDragWindow` layouts (`characterInformations`, `actionBar`, `bannerMenu`, `chatview`, `widgetProgressGauge`…);
  the client fills their grids (`SlotGrid`) and sizes some parts (heart erosion mask) in code.

## Formats worked out

**Maps** (`map_<id>`): `background/middleground/foregroundMapElements` = groups of elements
`{gfxId, position (y up), scale, rotation, color}`. Colour = ARGB tint, `0x80` = neutral. Each group has a `materialIndex` into
`<layer>MaterialData.shaderData`, a list of shader parameter objects. Reproduced: `Blending` (Unity BlendMode enum → GL),
`Rotation` (static offset + sine), `Scale`, `Translation`, `ColorAnimation` (lerp to `finalColor`), `Wind` (sway above `bendStart`,
in cell units of 86 px); `Dissolve` is approximated (alpha × (1 − alphaClip)). Not reproduced (need the game's noise/mask textures):
`Distortion`, `Emissive`, noise variants.
Staging targets (shown by scripted events) and `Refraction` groups are skipped. Shader frequencies are in rad/s (`sin(f·t)`).
Element `displayBehaviour` = `ObjectDisplayBehaviour` (names from il2cpp `global-metadata.dat`): 0 always, 1 hide if effects off,
2 hide if effects on → 2 is fallback art for low quality and is dropped (we draw the effects).
Middleground groups are sorted by `cellId` then `displayOrder` (rank within the cell; animated elements share that rank) = depth
order. Cell `altitude` (px, exported as `alt` when non-zero) raises the actors standing on it. `mapAnimatedElements` are rigs (`bone_<gfxId>`), drawn at their position
playing the rig's default animation.
Cells: 14 × 40 Dofus 2 grid, 86 × 43, centre of cell `c` = `(-559 + (col + row%2/2)·86, 430 − row·21.5)`, i.e. the 1204 × 860 grid
centred on the origin. `mapChangeData` = direction bits (1 E, 2 SE, 4 S, 8 SW, 16 W, 32 NW, 64 N, 128 NE).
Neighbours: `top/bottom/left/rightNeighbourId`, overridden by `MapScrollActionsDataRoot`.
`playlistSet.musicPlaylist/ambiantPlaylist.fmodEventGuid` = FMOD event (Unity `Guid` "N" string; FMOD stores Data1..3 little-endian).

**FMOD banks**: RIFF `FEV `; `LIST PROJ` holds object collections (`EVNT` events, `TMLN` timelines, `WAIT` waveform instruments,
`MUIT` multi instruments, buses…), each object starting with its own GUID; `WAV ` chunks map a waveform GUID to an FSB5 subsong
(`GUID, u32, u16, u32 index @22, u32`); `SND ` holds the FSB5 (stream names in its name table). Rather than decoding every object
type, `fmod.js` follows any known GUID found inside an object (event → timeline → instruments → waveforms).
Events are parameter-driven; `audio.js` picks by name: one music stem group (all stems play together), ambience minus interior/close layers.
`Master.strings.bank` (event paths) uses a compressed string table and is not decoded; not needed.

**Rig animations** (`TextAsset`): `u16 frames, u16 nodes, u16 labels, u16 ?`, labels (`u16 frame, u8 len, chars, NUL`,
then align 4), `frames × u32 offset`, then per frame a list of slot updates (deltas from the previous frame): `u16 slot, u8 flags, u8 ?` +
`0x20|0x01`: one 8-byte block `i16 graphic (index in the rig's own graphics = sprite_N, used if 0x01), i16 node (index in
exposedNodeNames, used if 0x20), u32 ?` (-1 = hidden) + `0x04`: `u32` multiplicative colour (RGBA, `0x7f` = 1) + `0x08`: `u32` additive
colour + `0x10`: 6 floats `a b tx c d ty`. Slots are drawn in slot order. Validated: every frame of the player rigs ends exactly on the
next frame offset. A few map-element transitions (`AnimStateX_to_AnimStateY`) have an extra block and a bogus last offset: cut there.
Stored directions are 0, 1, 2, 5, 6; 3, 4, 7 are mirrors of 1, 0, 5.

**Skins**: each part (`BrasD_1`…) = mesh chunks into `vertices`/`triangles`, UVs into the atlas (bottom-up).
The part's `DisplayListEntry` is a tree in prefix order (`entries` = number of following entries it owns): `symbolId -1` = one geometry
chunk (vertices already in part space); `entries 0` = mount point named `referencedSymbols[symbolId]`, with a transform `rX uX tX / rY uY tY`:
where another skin's part goes (hat `Chapeau_1` and `ChapeauB_1` behind, hair, mask, beard… on the head).
Vertex `pos.z` = colour zone (`ColorGray_N_*`): the grey texture is multiplied by colour N of the look.
Looks: `BreedsDataRoot.maleLook "{1|80||55}"` = bone 1, skin 80, scale 55 %; heads from `HeadsDataRoot.skins`.
Equipment items don't reference their skin in the client data (`appearanceId` = 0 for hats/capes, the server sends looks),
so the creator lists cosmetic skins by the slot their parts fill (`Chapeau_*`, `Cape_*`, `Bouclier_*`, `Aile*`), by id.
