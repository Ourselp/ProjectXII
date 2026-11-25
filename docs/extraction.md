# Dofus 3 extraction (Unity client)

The current Dofus client (Unity 6000.3.16f1, IL2CPP, tested on 3.7.14.18) stores everything under
`<install>/Dofus_Data/StreamingAssets/Content/`:

| Folder | Content | Format |
|---|---|---|
| `Data/` | game tables (items, monsters, subareas, breeds…) | UnityFS bundles, `MonoBehaviour` with `[SerializeReference]` data |
| `I18n/fr.bin` | all texts | custom: `u32 count` at offset 3, then `count × (u32 id, u32 offset)`, strings = 7-bit varint length + UTF-8 |
| `Map/Data/` | 17 785 maps (`map_<id>`), grouped arbitrarily into `mapdata_assets_world_N.bundle` | `MonoBehaviour` + `SerializeReference` |
| `Map/Textures/1x/` | map sprites, named by gfxId, pivot = centre, 1 px = 1 unit | Sprite / Texture2D |
| `Characters/Bones/` | animation rigs: `bone_1-*` = player (`1-movement` walk/run, `1-static` idle…) | `TextAsset` animations + mesh skin |
| `Characters/Skins/` | body parts per look (`skin_80` = Iop male body, `skin_2124` = an Iop head) | mesh skin + atlas |
| `Audio/Banks/` | sounds and music | FMOD `.bank` (not extracted yet) |

Bundles are not encrypted, but the Unity version is stripped from them: always pass `--unity-version 6000.3.16f1`.

## Tools

- `tools/bin/` (git-ignored, re-download it):
  - [AssetStudioModCLI](https://github.com/aelurum/AssetStudioMod/releases) v0.20.0 `net472_win32_64`: unpacks bundles (`-m extract`) and exports images (`-m export -t sprite|tex2d`).
  - [vgmstream-cli](https://github.com/vgmstream/vgmstream/releases) (for the `.bank` sounds later).
- `tools/extract/unityread.js`: our own SerializedFile reader driven by the embedded type trees. It decodes
  `ManagedReferencesRegistry` (SerializeReference), which AssetStudio leaves empty. No decompilation of the game is needed.
  It needs `commonstrings.txt` (Unity's built-in string table, read from `UnityPlayer.dll`).

## Steps (Git Bash, from the repo root)

```bash
C="<install>/Dofus_Data/StreamingAssets/Content"; A=tools/bin/assetstudio/AssetStudioModCLI.exe; V="--unity-version 6000.3.16f1"
$A "$C/Data"     -m extract -o extract/raw_data          # 1. tables
node tools/extract/data.js "$C/.."                        #    -> extract/data/*.json + i18n_fr.json
$A "$C/Map/Data" -m extract -o extract/raw_maps          # 2. maps (4 GB unpacked)
node tools/extract/astrub_maps.js 95                      #    subarea 95 = Cité d'Astrub -> extract/maps/
$A "$C/Map/Textures/1x" -m export -t sprite $V -g none -o extract/mapgfx   # 3. map sprites (64k PNG)
node tools/extract/maps_build.js                          #    -> public/maps/*.json + public/gfx/*.png
mkdir -p extract/char_in && cp "$C"/Characters/Skins/skins_assets_skin_{80,2124}.bundle "$C"/Characters/Bones/bones_assets_bone_1-{movement,static}.bundle extract/char_in/
$A extract/char_in -m extract -o extract/raw_char                          # 4. character
$A extract/char_in -m export -t tex2d $V -g none -o extract/char_tex
node tools/extract/character.js iop 80 2124               #    -> public/char/iop.json + atlases
```

Other class: look in `extract/data/BreedsDataRoot.json` (`maleLook "{1|80||55}"` = bone 1, skin 80, scale 55%)
and `HeadsDataRoot.json` (`skins`) for the head. Colours = `maleColors`.

## Formats worked out

**Maps** (`map_<id>`): `background/middleground/foregroundMapElements` = groups of elements
`{gfxId, position (y up), scale, rotation, color}`. Colour = ARGB tint, `0x80` = neutral. Each group has a `materialIndex` into
`<layer>MaterialData.shaderData`. Only `ShaderBlendingParameters` (Unity BlendMode enum) is applied; wind, distortion,
dissolve and emissive are ignored. Staging targets (shown by events) and refraction are skipped.
Middleground groups are sorted by `cellId`, which is the depth order. Cells: 14 × 40 Dofus 2 grid, 86 × 43,
centre of cell `c` = `(-559 + (col + row%2/2)·86, 430 − row·21.5)` (fitted, not read from the client).

**Character animations** (`TextAsset`): `u16 frames, u16 nodes, u16 labels, u16 ?`, labels (`u16 frame, u8 len, chars`, align 4),
`frames × u32 offset`, then per frame a list of slot updates (deltas from the previous frame):
`u16 slot, u8 flags, u8 ?` + `0x20`: `i16 ?, i16 node (index in exposedNodeNames, -1 = hidden), u32 ?`
+ `0x04`: `u32` multiplicative colour (RGBA, `0x7f` = 1) + `0x08`: `u32` additive colour + `0x10`: 6 floats `a b tx c d ty`.
Slots are drawn in slot order. Flags `0x40/0x80` (only in swim animations) are not decoded.
Stored directions are 0, 1, 2, 5, 6; 3, 4, 7 are mirrors of 1, 0, 5.

**Skins**: each part (`BrasD_1`…) = mesh chunks into `vertices`/`triangles`, UVs into the atlas (bottom-up).
Vertex `pos.z` = colour zone (`ColorGray_N_*`): the grey texture is multiplied by colour N of the look.
