// Client UI skin: extract/ui_raw (AssetStudio -m export -t sprite,tex2d -g type of aa/StandaloneWindows64/ui*, icons, ornaments…)
// -> extract/ui_raw/index.html (filterable gallery of everything) + public/ui/hud/ (the HUD pieces, flat names).
const fs = require('fs'), path = require('path');
const R = 'extract/ui_raw', O = 'public/ui/hud';
const all = ['Sprite', 'Texture2D'].flatMap(d => fs.existsSync(`${R}/${d}`) ? fs.readdirSync(`${R}/${d}`).map(f => `${d}/${f}`) : []);
fs.writeFileSync(`${R}/index.html`, `<!doctype html><meta charset=utf-8><title>UI skin (${all.length})</title>
<style>body{background:#333;color:#ddd;font:11px sans-serif}div{display:inline-block;width:150px;margin:4px;text-align:center;vertical-align:top;word-break:break-all}
img{max-width:140px;max-height:140px;background:repeating-conic-gradient(#555 0 25%,#444 0 50%) 0 0/16px 16px}</style>
<input id=q placeholder=filter autofocus oninput="for(const d of document.querySelectorAll('div'))d.hidden=!d.title.toLowerCase().includes(this.value.toLowerCase())">
${all.map(f => `<div title="${f}"><img loading=lazy src="${encodeURI(f)}"><br>${f}</div>`).join('')}`);
// HUD pieces: life heart, AP/MP counters, spell bar, timeline, banner, entity gauges, HUD buttons
const HUD = /^(gaugeHeart|hatchHeartt|paCounter|pmCounter|icon_p[avm]\.|tx_(lifePoints|actionPoints|movementPoints|health|spells)|btn_spell_|slotSpell_|bg_spell_icon|bg_lvl_spell|noSpellIcon|background_timeline_|border_(additional_)?turn_timeline|icon_arrow_timeline|timeIndicatorBg|backgroundBanner|borderBanner|BorderBgHeader|entityJauge|icon_hud_|chat\.|xp(_shadow)?\.|experience(_0)?\.|btn_transparent_|title_bar_parchment|window_separator_|btn_close_|bg_tab_|bg_dark\.|bg_modalCover|windowShadow|(character|spells|inventory_equipment|map|palette|btnIcon_gear|btnIcon_question)\.)/;
fs.mkdirSync(O, { recursive: true });
let n = 0;
for (const f of all) {
  const b = path.basename(f);
  if (!HUD.test(b) || b.includes(' #')) continue; // ' #id' = duplicate from another bundle
  if (f.startsWith('Texture2D/') && fs.existsSync(`${R}/Sprite/${b}`)) continue; // Sprite = cropped, Texture2D can be a bigger atlas
  fs.copyFileSync(`${R}/${f}`, `${O}/${b}`); n++;
}
console.log(`ui_skin: ${all.length} images in ${R}/index.html, ${n} HUD pieces -> ${O}`);
