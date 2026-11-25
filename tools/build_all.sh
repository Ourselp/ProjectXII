#!/usr/bin/env bash
# Regenerate every game asset in public/ from the installed Dofus 3 client (several GB, ~30-60 min). Git Bash, from the repo root.
#   DOFUS3=<install dir> tools/build_all.sh      (default: %LOCALAPPDATA%/Ankama/Dofus-dofus3)
set -e
D="${DOFUS3:-$LOCALAPPDATA/Ankama/Dofus-dofus3}"; S="$D/Dofus_Data/StreamingAssets"; C="$S/Content"
A=tools/bin/assetstudio/AssetStudioModCLI.exe; V="--unity-version 6000.3.16f1"
[ -x "$A" ] || { echo "missing $A (see docs/extraction.md)"; exit 1; }
mkdir -p extract
[ -d extract/raw_data ] || $A "$C/Data" -m extract -o extract/raw_data
node tools/extract/data.js "$S"                                           # tables + French texts
[ -d extract/raw_maps ] || $A "$C/Map/Data" -m extract -o extract/raw_maps
[ -d extract/mapgfx ]   || $A "$C/Map/Textures/1x" -m export -t sprite $V -g none -o extract/mapgfx
node tools/extract/fmod.js "$C/Audio/Banks/Desktop" extract/fmod_events.json   # sound events -> waveforms
node --max-old-space-size=8000 tools/extract/maps_build.js              # all maps + sprites (+ list of animated elements, sounds)
node tools/extract/anim_gfx.js                                            # animated map elements -> rig list
node tools/extract/npcs.js                                                # NPCs placed through quest objectives + their dialogues (and rig list)
node --max-old-space-size=8000 tools/extract/rigs.js "$C"                # rigs (player, animated elements, monsters, NPCs) and all skins
node tools/extract/monsters.js                                            # monsters per subarea
[ -d extract/wm ] || { mkdir -p extract/wm_in; cp "$C/Picto/Worldmaps/worldmap_assets_.bundle" extract/wm_in/; $A extract/wm_in -m export -t tex2d $V -g none -f assetName_pathID -o extract/wm; $A extract/wm_in -m extract -o extract/raw_wm; }
node tools/extract/worldmap.js "$C"                                       # world map window: positions + illustrated map tiles
node tools/extract/zaaps.js                                               # zaap sprites + destinations
node tools/extract/looks.js                                               # character creator data
[ -d extract/picto ] || { mkdir -p extract/picto_in; cp "$C/Picto/Spells/spell_assets_1x.bundle" "$C/Picto/UI/class_assets_.bundle" extract/picto_in/; $A extract/picto_in -m export -t sprite $V -g type -o extract/picto; }
node tools/extract/ui.js                                                  # HUD: class spells, icons, portraits
[ -d extract/ui_raw ] || { mkdir -p extract/ui_in; cp "$S"/aa/StandaloneWindows64/{ui,icons_,ornaments_,spriteassets_,tss_,figs_}*.bundle extract/ui_in/; $A extract/ui_in -m export -t sprite,tex2d $V -g type -o extract/ui_raw; }
node tools/extract/ui_skin.js                                             # client UI skin: gallery + HUD pieces -> public/ui/hud
[ -d extract/raw_uxml ] || { mkdir -p extract/uxml_in; cp "$S"/aa/StandaloneWindows64/*.bundle extract/uxml_in/; $A extract/uxml_in -m extract -o extract/raw_uxml; }
[ -d extract/ui_fonts ] || { mkdir -p extract/uxml_in; cp "$S"/aa/StandaloneWindows64/*.bundle extract/uxml_in/; $A extract/uxml_in -m export -t font $V -g none -o extract/ui_fonts; }
node tools/extract/uitk.js                                                # client menus (UI Toolkit UXML/USS) -> layouts HTML + uitk-client.css
node tools/extract/audio.js "$C/Audio/Banks/Desktop"                      # map music / ambience -> ogg
