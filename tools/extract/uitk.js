// Client menus (Unity UI Toolkit) -> HTML/CSS. Needs extract/raw_uxml (AssetStudio -m extract of every aa/StandaloneWindows64 bundle),
// extract/ui_raw (images, see ui_skin.js) and extract/ui_fonts (AssetStudio -m export -t font of the same bundles).
// Out: public/uitk-client.css, public/ui/uitk/{layouts/<name>.html, layouts/index.json, img/, fonts/}; every url relative to public/
// (a url inside var() resolves against the sheet that uses it, so one base for everything).
// USS: StyleSheet MonoBehaviours (MergedUSS = every project sheet, default = Unity's controls, Standard = theme colours);
// UXML: VisualTreeAsset MonoBehaviours (m_VisualTree tree, inline styles in inlineSheet rules, templates in m_Usings).
const fs = require('fs'), path = require('path');
const { readFile } = require('./unityread');
const RAW = 'extract/raw_uxml', OUT = 'public/ui/uitk';

// StylePropertyId = group << 16 | index (UnityCsReference 6000.3, Modules/UIElements/Core/Style/Generated/StylePropertyEnums.cs)
const GROUPS = {
  1: 'color font-size letter-spacing text-shadow -unity-editor-text-rendering-mode -unity-font -unity-font-definition -unity-font-style -unity-material -unity-paragraph-spacing -unity-text-align -unity-text-auto-size -unity-text-generator -unity-text-outline-color -unity-text-outline-width visibility white-space word-spacing',
  2: 'align-content align-items align-self aspect-ratio border-bottom-width border-left-width border-right-width border-top-width bottom display flex-basis flex-direction flex-grow flex-shrink flex-wrap height justify-content left margin-bottom margin-left margin-right margin-top max-height max-width min-height min-width padding-bottom padding-left padding-right padding-top position right top width',
  3: 'cursor text-overflow -unity-background-image-tint-color -unity-overflow-clip-box -unity-slice-bottom -unity-slice-left -unity-slice-right -unity-slice-scale -unity-slice-top -unity-slice-type -unity-text-overflow-position',
  4: 'all background-position border-color border-radius border-width flex margin padding transition -unity-background-scale-mode -unity-text-outline',
  5: 'rotate scale transform-origin translate',
  6: 'transition-delay transition-duration transition-property transition-timing-function',
  7: 'background-color background-image background-position-x background-position-y background-repeat background-size border-bottom-color border-bottom-left-radius border-bottom-right-radius border-left-color border-right-color border-top-color border-top-left-radius border-top-right-radius filter opacity overflow',
};
const PROP = {}; for (const g in GROUPS) GROUPS[g].split(' ').forEach((n, i) => PROP[g << 16 | i] = n);
const KEYWORDS = ['inherit', 'initial', 'auto', 'unset', 'true', 'false', 'none', 'cover', 'contain'];
const FUNCS = ['unknown', 'var', 'env', 'linear-gradient', 'none', 'custom', 'tint', 'opacity', 'invert', 'grayscale', 'sepia', 'blur', 'contrast', 'hue-rotate', 'material'];
const UNITS = ['', 'px', '%', 's', 'ms', 'deg', 'grad', 'rad', 'turn'];
const LENGTH = /width|height|margin|padding|radius|^(left|right|top|bottom)$|font-size|spacing|flex-basis|translate|transform-origin|slice-(left|right|top|bottom)|outline-width/;
const DROP = /^(all|cursor|-unity-(editor-text-rendering-mode|material|paragraph-spacing|text-generator|text-auto-size|text-overflow-position|overflow-clip-box|slice-type))$/;
const EASE = /^(ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end)$/;

// ---------- every serialized file: objects by pathId (sprites, textures, fonts, font assets, style sheets, layouts)
const files = {}; // cab -> {path, externals, objs: {pathId: {classId, name, value}}}
for (const d of fs.readdirSync(RAW)) for (const f of fs.readdirSync(`${RAW}/${d}`)) {
  if (f.includes('.')) continue;
  const p = `${RAW}/${d}/${f}`, objs = {}, all = [...readFile(p, 213), ...readFile(p, 28), ...readFile(p, 114)];
  for (const o of all) objs[o.pathId] = o;
  files[f] = { externals: readFile(p, -1).externals.map(e => e.split('/').pop()), objs };
}
const deref = (cab, ptr) => {
  if (!ptr || ptr.m_PathID == 0) return null;
  const c = ptr.m_FileID ? files[cab].externals[ptr.m_FileID - 1] : cab;
  return files[c]?.objs[ptr.m_PathID] && { cab: c, ...files[c].objs[ptr.m_PathID] };
};

// ---------- images: the AssetStudio export (extract/ui_raw) named by asset; slices from the Sprite's own border
fs.mkdirSync(`${OUT}/img`, { recursive: true }); fs.mkdirSync(`${OUT}/fonts`, { recursive: true }); fs.mkdirSync(`${OUT}/layouts`, { recursive: true });
const pngW = f => fs.readFileSync(f).readUInt32BE(16);
const images = {}, missing = new Set();
function image(o) { // -> {url, slice: [t, r, b, l] in file pixels, size: [w, h] in UI pixels} | null
  const key = o.cab + o.pathId; if (key in images) return images[key];
  const dir = o.classId === 213 ? 'Sprite' : 'Texture2D', src = [`extract/ui_raw/${dir}/${o.name}.png`, `extract/ui_raw/Texture2D/${o.name}.png`].find(f => fs.existsSync(f));
  if (!src) { missing.add(o.name); return images[key] = null; }
  const file = `${o.name.replace(/[^\w.-]/g, '_')}.png`;
  if (!fs.existsSync(`${OUT}/img/${file}`)) fs.copyFileSync(src, `${OUT}/img/${file}`);
  const v = o.value, w = v.m_Rect?.width ?? v.m_Width, k = pngW(src) / w, b = v.m_Border; // file may be the 1x/2x twin of this sprite
  const ppu = (v.m_PixelsToUnits || 100) / 100;
  return images[key] = { url: `ui/uitk/img/${file}`, k, ppu, slice: b && (b.x || b.y || b.z || b.w) ? [b.w, b.z, b.y, b.x] : null };
}
const fonts = fs.readdirSync('extract/ui_fonts').filter(f => !f.includes(' #'));
for (const f of fonts) fs.copyFileSync(`extract/ui_fonts/${f}`, `${OUT}/fonts/${f}`);
const fontOf = name => fonts.find(f => name.startsWith(f.replace('.ttf', '')))?.replace('.ttf', '') || 'Lexend-Regular';

// ---------- USS values -> CSS text
const esc = s => s.replace(/[^\w-]/g, c => '\\' + c);
const color = c => `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${+c.a.toFixed(3)})`;
function values(sheet, cab, prop, vals) { // -> [css text, image info of the last asset]
  let out = [], img = null;
  const one = i => { // value at i -> [text, next index]
    const { m_ValueType: t, valueIndex: x } = vals[i];
    if (t !== 10) { const [s, im] = values(sheet, cab, prop, [vals[i]]); if (im) img = im; return [s, i + 1]; }
    const name = FUNCS[x], n = sheet.floats[vals[i + 1].valueIndex], args = [];
    let j = i + 2; for (let c = 0; c < n && j < vals.length; c++) { const [s, k] = one(j); args.push(s); j = k; }
    return [`${name}(${args.join(' ').replace(/ ,/g, ',')})`, j];
  };
  for (let i = 0; i < vals.length;) {
    if (vals.length > 1 || vals[i].m_ValueType === 10) { const [s, k] = one(i); out.push(s); i = k; continue; }
    const { m_ValueType: t, valueIndex: x } = vals[i++];
    if (t === 1) out.push(KEYWORDS[x]);
    else if (t === 2) { const f = sheet.floats[x]; out.push(f && LENGTH.test(prop) ? f + 'px' : String(+f.toFixed(4))); }
    else if (t === 3) { const d = sheet.dimensions[x]; out.push(+d.value.toFixed(4) + UNITS[d.unit]); }
    else if (t === 4) out.push(color(sheet.colors[x]));
    else if (t === 6 || t === 12) {
      const o = deref(cab, t === 6 ? sheet.assets[x] : sheet.scalableImages[x].normalImage);
      if (!o) out.push('none');
      else if (o.classId === 213 || o.classId === 28) { img = image(o); out.push(img ? `url(${img.url})` : 'none'); }
      else out.push(`"${fontOf(o.name)}"`); // FontAsset / Font
    }
    else if (t === 7 || t === 8 || t === 9) out.push(sheet.strings[x]); // enum, --variable, string
    else if (t === 11) out.push(',');
    else out.push('none'); // resource path / missing asset
  }
  return [out.join(' ').replace(/ ,/g, ','), img];
}
const ALIGN = { upper: 'flex-start', middle: 'center', lower: 'flex-end' };
function declarations(sheet, cab, props) { // USS properties -> 'a:b;c:d'
  const d = []; let bgImg, slices = {};
  for (const p of props) {
    const name = p.m_Id === -1 ? p.m_CustomName : PROP[p.m_Id];
    if (!name || DROP.test(name)) continue;
    const [v, img] = values(sheet, cab, name, p.m_Values);
    if (name.startsWith('--')) { d.push(`${name}:${v}`); continue; }
    switch (name) {
      case '-unity-font': case '-unity-font-definition': if (v !== 'none' && !v.startsWith('initial')) d.push(`font-family:${v},sans-serif`); break;
      case '-unity-font-style': d.push(`font-weight:${v.includes('bold') ? 700 : 400}`, `font-style:${v.includes('italic') ? 'italic' : 'normal'}`); break;
      case '-unity-text-align': { const [vv, h] = v.split('-'); d.push(`text-align:${h === 'center' ? 'center' : h}`, `--uta-v:${ALIGN[vv] || 'flex-start'}`); break; }
      case '-unity-text-outline-width': d.push(`--uto-w:${v}`); break;
      case '-unity-text-outline-color': d.push(`--uto-c:${v}`); break;
      case '-unity-text-outline': { const [w, ...c] = v.split(' '); d.push(`--uto-w:${w}`, `--uto-c:${c.join(' ') || 'currentColor'}`); break; }
      case '-unity-background-scale-mode': d.push(`background-size:${{ 'scale-and-crop': 'cover', 'scale-to-fit': 'contain' }[v] || '100% 100%'}`); break;
      case '-unity-slice-left': case '-unity-slice-right': case '-unity-slice-top': case '-unity-slice-bottom': case '-unity-slice-scale': slices[name.slice(13)] = parseFloat(v); break;
      case 'background-image': bgImg = img; d.push(`background-image:${v}`, `--u-img:${v}`); break;
      case '-unity-background-image-tint-color': if (/^(rgba|var)\(/.test(v)) d.push(`--u-tint:${v}`); break; // drawn by a ::before masked with the image (TINT)
      case 'transition-timing-function': d.push(`${name}:${v.split(', ').map(e => EASE.test(e) ? e : 'ease').join(', ')}`); break;
      case 'filter': if (!/^(blur|grayscale|opacity|brightness|contrast|sepia|invert|hue-rotate|saturate)\(/.test(v)) break; d.push(`${name}:${v}`); break;
      case 'text-shadow': d.push(`${name}:${v.replace(/^(\S+ \S+) (rgba\()/, '$1 0 $2')}`); break;
      default: d.push(`${name}:${v}`);
    }
  }
  // 9-slice: sprite border (or -unity-slice-*) -> border-image drawn over the whole box; slices in UI px = file px / k / ppu * scale
  if (bgImg && (bgImg.slice || 'left' in slices)) {
    const s = bgImg.slice ? [...bgImg.slice] : [0, 0, 0, 0];
    ['top', 'right', 'bottom', 'left'].forEach((k, i) => { if (k in slices) s[i] = slices[k] * bgImg.k; else s[i] *= bgImg.k; });
    const sc = slices.scale || 1, w = s.map(x => +(x / bgImg.k / bgImg.ppu * sc).toFixed(2) + 'px');
    const i = d.findIndex(x => x.startsWith('background-image:'));
    d[i] = `border-image:url(${bgImg.url}) ${s.map(x => Math.round(x)).join(' ')} fill / ${w.join(' ')} stretch;background-image:none`;
  } else if (d.includes('background-image:none')) d.push('border-image:none');
  return d.join(';');
}
// tinted image = tint colour masked by the (white) sprite, like Unity's multiply; a ::before behind the children
const TINT = "--u-img:inherit;--u-tint:inherit;content:'';position:absolute;inset:0;pointer-events:none;background:var(--u-tint);-webkit-mask:var(--u-img) center/100% 100% no-repeat;mask:var(--u-img) center/100% 100% no-repeat;border-radius:inherit";
const PSEUDO = { hover: ':hover', active: ':active', focus: ':focus', root: ':where(.uitk-root)', disabled: '.is-disabled', enabled: ':not(.is-disabled)', checked: '.is-checked', selected: '.is-selected', inactive: ':not(:active)' };
function selector(cs) {
  return cs.m_Selectors.map((s, i) => (i ? (s.m_PreviousRelationship === 1 ? ' > ' : ' ') : '') + s.m_Parts.map(p =>
    p.m_Type === 1 ? '*' : p.m_Type === 2 ? `[data-t="${p.m_Value}"]` : p.m_Type === 3 ? '.' + esc(p.m_Value) : p.m_Type === 6 ? '#' + esc(p.m_Value)
      : p.m_Type === 4 || p.m_Type === 5 ? (PSEUDO[p.m_Value] ?? '.is-' + esc(p.m_Value)) : '').join('')).join('');
}
// a sheet attached to an element (m_Stylesheets) applies to it and its subtree only: its rules are scoped by a class on that
// element, inside :where() so the client's specificities stay as they are
const scoped = (sel, sc) => [`:where(.${sc}) ${sel}`, `${sel}:where(.${sc})`];
function css(o, sc) {
  const s = o.value; let out = `/* ${o.name} */\n`;
  for (const r of s.m_Rules) {
    let sel = r.m_ComplexSelectors.map(selector).filter(Boolean); if (!sel.length) continue;
    if (sc) sel = sel.flatMap(x => scoped(x, sc));
    const d = declarations(s, o.cab, r.m_Properties); if (d) out += `${sel.join(',')}{${d}}\n`;
    if (d.includes('--u-tint:')) out += `${sel.map(x => x + '::before').join(',')}{${TINT}}${sel.join(',')}{background-image:none!important}\n`;
  }
  return out;
}

// ---------- stylesheets: fonts, UI Toolkit defaults (every element is a column flexbox), Unity's controls, theme, project sheets
const sheets = [], layouts = {};
for (const cab in files) for (const id in files[cab].objs) {
  const o = { cab, ...files[cab].objs[id] }, v = o.value;
  if (v?.m_Rules && o.name !== 'inlineStyle') sheets.push(o);
  if (v?.m_VisualTree) (layouts[o.name] ??= o);
}
const pick = n => sheets.find(s => s.name === n);
let out = fonts.map(f => `@font-face{font-family:"${f.replace('.ttf', '')}";src:url(ui/uitk/fonts/${f})}`).join('\n') + `
.uitk-root,.uitk-root *{display:flex;flex-direction:column;flex-shrink:1;box-sizing:border-box;position:relative;min-width:0;min-height:0;margin:0;padding:0;border:0 solid transparent;
  background:center/100% 100% no-repeat;font-family:"Lexend-Regular",sans-serif;font-size:12px}
.uitk-root{color:#fff;-webkit-font-smoothing:antialiased}
.uitk-root .unity-text-element{justify-content:var(--uta-v,flex-start);-webkit-text-stroke:var(--uto-w,0) var(--uto-c,transparent);paint-order:stroke fill;white-space:normal}
@property --u-img{syntax:'<image>';inherits:false;initial-value:linear-gradient(#0000,#0000)}@property --u-tint{syntax:'*';inherits:false}
.uitk-root .tinted::before{${TINT}}.uitk-root .tinted{background-image:none!important}
`;
for (const n of ['default', 'Standard', 'MediumFont_Standard', 'MergedUSS']) out += pick(n) ? css(pick(n)) : `/* missing ${n} */\n`;
// + the sheets the layouts attach to their elements (m_Stylesheets): most layout rules live there, each scoped (class ss<n>)
const used = new Map(), GLOBAL = ['default', 'Standard', 'MediumFont_Standard', 'MergedUSS'];
for (const o of Object.values(layouts)) (function walk(n) {
  for (const p of n.m_Stylesheets || []) { const s = deref(o.cab, p); if (s?.value?.m_Rules && !GLOBAL.includes(s.name) && !used.has(s.cab + s.pathId)) used.set(s.cab + s.pathId, { ...s, sc: 'ss' + used.size }); }
  for (const c of n.m_Children || []) walk(c);
})(o.value.m_VisualTree);
for (const s of used.values()) out += css(s, s.sc);
const scopes = (vta, n) => (n.m_Stylesheets || []).map(p => { const s = deref(vta.cab, p); return s && used.get(s.cab + s.pathId)?.sc; }).filter(Boolean);
fs.writeFileSync('public/uitk-client.css', out);

// ---------- layouts -> HTML. Dofus' own controls (Core.UILogic.Components.*) build their parts in C#: rebuilt here from their
// UXML attributes with the client's sprites, looked up by name (icon="info" -> info.png, img-url=…/characteristic.png)
const SPR = {}; for (const d of ['Texture2D', 'Sprite']) for (const f of fs.readdirSync(`extract/ui_raw/${d}`)) if (!f.includes(' #')) SPR[f.slice(0, -4).toLowerCase()] = `extract/ui_raw/${d}/${f}`;
const icon = n => { // sprite name or asset path -> url | ''
  if (!n) return ''; const k = path.basename(n).replace(/\.png$/i, '').toLowerCase(), src = SPR[k]; if (!src) return '';
  const file = path.basename(src).replace(/[^\w.-]/g, '_'); if (!fs.existsSync(`${OUT}/img/${file}`)) fs.copyFileSync(src, `${OUT}/img/${file}`);
  return `ui/uitk/img/${file}`;
};
const html = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const text = s => html(String(s).trim().replace(/^\[(.*)\]$/s, '$1'));
const BUILTIN = { Label: 'unity-text-element unity-label', DofusLabel: 'unity-text-element unity-label', Button: 'unity-text-element unity-button', ScrollView: 'unity-scroll-view', DofusScrollView: 'unity-scroll-view',
  ListView: 'unity-list-view unity-scroll-view', TextField: 'unity-base-field unity-text-field', Toggle: 'unity-toggle', Image: 'unity-image', ProgressBar: 'unity-progress-bar' };
function control(t, a, inner) { // -> [extra classes, inner html]
  const bar = (lo, hi, v) => `<div class="pb-fill" style="width:${Math.max(0, Math.min(100, (v - lo) / ((hi - lo) || 1) * 100))}%"></div>`;
  switch (t) {
    case 'MagneticDragWindow': // HUD widget: header (icon, title) shown on hover, dragged by it
      return ['mdw', (a['has-header'] === 'false' ? '' : `<div class="mdw-head">${icon(a['header-icon']) ? `<div class="dbtn-icon" style="--i:url(${icon(a['header-icon'])})"></div>` : ''}<div class="mdw-title">${text(a['header-title'] || '')}</div></div>`) + inner];
    case 'WindowFigma': return [`wf wf--${(a['header-style'] || 'primary').toLowerCase()}`, (a['with-title-bar'] === 'false' || a['hide-title-bar'] === 'true' ? '' :
      `<div class="wf-head">${icon(a['img-url']) ? `<img class="wf-icon" src="${icon(a['img-url'])}">` : ''}<div class="wf-title">${text(a.title || '')}</div>` +
      `${a['show-help-button'] === 'true' ? `<div class="wf-btn" style="--i:url(${icon(a['help-icon'] || 'questionMark')})"></div>` : ''}${a['show-close-button'] === 'false' ? '' : '<div class="wf-btn wf-close"></div>'}</div>`) + `<div class="wf-body">${inner}</div>`];
    case 'DofusButtonCustom': case 'DofusButton': case 'DofusToggleButtonCustom': {
      const ic = a['icon-type'] === 'Image' || !(a['icon-value'] || a.icon) ? icon(a['image-url'] || a['icon-url']) || icon(a['icon-value'] || a.icon) : icon(a['icon-value'] || a.icon) || icon(a['image-url'] || a['icon-url']); // icon-type=Image: the picture, else the named icon
      return [`dbtn dbtn--${(a['main-style'] || (t === 'DofusToggleButtonCustom' ? 'secondary' : 'primary')).toLowerCase()} dbtn--${a.size || a['toggle-size'] || 'medium'}${a.text ? '' : ' dbtn--icon'}`,
        (ic ? `<div class="dbtn-icon" style="--i:url(${ic})"></div>` : '') + (a.text ? `<div class="dbtn-label">${text(a.text)}</div>` : '') + inner];
    }
    case 'DofusIcon': return ['dicon', inner, icon(a.icon)];
    case 'Divider': return [`divider${a.orientation === 'vertical' ? ' divider--v' : ''}`, `<i></i>${icon(a.diamond) ? `<img src="${icon(a.diamond)}">` : ''}<i></i>`];
    case 'ExtendedProgressBarInt': case 'ExtendedProgressBarFloat': case 'ExtendedProgressBarLong':
      return [`pb pb--${a['gauge-color'] || 'primary'} pb--${a['gauge-size'] || 'large'}`, bar(+a['low-value'] || 0, +a['high-value'] || (+a.value <= 1 ? 1 : 100), +a.value || 0)]; // no high value: a 0..1 ratio (weight bar);
    case 'Slot': return [`slot slot--${a['slot-size'] || 'medium'}`, (icon(a['icon-value']) ? `<div class="slot-icon" style="--i:url(${icon(a['icon-value'])})"></div>` : '') + inner];
    case 'SlotGrid': return ['slotgrid', inner || `<div class="slot slot--${a['slot-size'] || 'small'}"></div>`.repeat(Math.min(60, (+a['fixed-row-count'] || 2) * (+a['fixed-column-count'] || 6)))];
    case 'CheckboxCustom': case 'Toggle': case 'Switch': case 'RadioButton': return ['dcheck', `<div class="dcheck-box"></div>${a.text || a.label ? `<div class="unity-text-element">${text(a.text || a.label)}</div>` : ''}${inner}`];
    case 'TextInput': case 'TextField': case 'DofusTextField': case 'TextInputToValidate': return ['dinput', `<input placeholder="${text(a.placeholder || a['placeholder-text'] || '')}" value="${text(a.value || '')}">`];
    case 'Dropdown': return ['dinput ddrop', `<div class="unity-text-element">${text(a.text || a.label || '…')}</div>`];
    case 'DofusTab': return [`dtab${a.selected === 'true' || a['is-selected'] === 'true' ? ' is-checked' : ''}`, (icon(a.icon || a['icon-value']) ? `<div class="dbtn-icon" style="--i:url(${icon(a.icon || a['icon-value'])})"></div>` : '') + `<div class="unity-text-element">${text(a.text || a.label || '')}</div>` + inner];
    case 'SectionHeader': return ['sheader', `<div class="unity-text-element">${text(a.text || a.title || '')}</div>${inner}`];
    case 'TableColumnHeader': return ['thead', `<div class="unity-text-element">${text(a.text || a.title || '')}</div>${inner}`];
    case 'Tag': return ['dtag', `<div class="unity-text-element">${text(a.text || '')}</div>`];
  }
  return ['', inner];
}
['cross', 'emptySlot', 'slotInventory_silverM', 'slotInventory_goldM', 'checkboxActive', 'chevronBottom', // public/uitk-controls.css
  ...'characteristic spells inventory quest success job guild alliance social alignment almanax encyclopedia guide mount companions cosmetics build groupSearch webShop map cog questionMark'.split(' ')].forEach(icon); // + banner menu (hud.js)
let built = 0;
function element(vta, n, depth, usings) {
  const t = n.m_FullTypeName.split('.').pop(), a = {}; for (const p of n.m_Properties || []) a[p.name] = p.value;
  let inner = (n.m_Children || []).map(c => element(vta, c, depth, usings)).join('');
  // template instance, or a control that loads its namesake layout (EquipmentComponentCharacter -> EquipmentComponent)
  const own = t === 'UXML' || t === 'VisualElement' ? null : layouts[t] ? t : Object.keys(layouts).filter(k => k.length > 8 && t.startsWith(k)).sort((x, y) => y.length - x.length)[0];
  const tpl = n.m_TemplateAlias ? usings[n.m_TemplateAlias] : own && own !== vta.name ? layouts[own] : null;
  if (tpl && depth < 8) inner = layout(tpl, depth + 1, true) + inner;
  if (t === 'UXML') { // sheets on the document root: on the layout's wrapper, or a display:contents box when nested in another layout
    const sc = scopes(vta, n); if (!sc.length) return inner;
    if (!vta.nested) { vta.rootClasses = sc; return inner; }
    return `<div class="${sc.join(' ')}" style="display:contents">${inner}</div>`;
  }
  const st = n.m_RuleIndex >= 0 && vta.inline ? declarations(vta.inline.value, vta.inline.cab, vta.inline.value.m_Rules[n.m_RuleIndex].m_Properties) : '';
  let [cls, body, bg] = control(t, a, inner), extra = '';
  if (a['gap-value']) extra += `gap:${a['gap-value']}px;`;
  if (a['uxml-path']) { // InlineXmlGrid: items cloned at runtime from this layout (uitk.js fillGrid)
    extra += 'flex-direction:row;flex-wrap:wrap;';
    body += `<template data-item="${path.basename(a['uxml-path'], '.uxml')}" data-w="${a['item-width'] || ''}" data-h="${a['item-height'] || ''}"></template>`;
  }
  const st2 = extra + st;
  if (a.text != null && BUILTIN[t]?.includes('text')) body = text(a.text) + body;
  const classes = [BUILTIN[t], cls, ...scopes(vta, n), st.includes('--u-tint:') && 'tinted', ...(n.m_Classes || [])].filter(Boolean).join(' ');
  return `<div data-t="${t}"${a.name ? ` id="${html(a.name)}"` : ''}${classes ? ` class="${html(classes)}"` : ''}${st2 || bg ? ` style="${html((bg ? `--i:url(${bg});--u-img:url(${bg});` : '') + st2)}"` : ''}${a.tooltip ? ` title="${text(a.tooltip)}"` : ''}>${body}</div>`;
}
function layout(o, depth = 0, nested = false) {
  const v = o.value, vta = { name: o.name, cab: o.cab, nested, inline: deref(o.cab, v.inlineSheet) }, usings = {};
  for (const u of v.m_Usings || []) { const t = deref(o.cab, u.asset); if (t) usings[u.alias] = layouts[t.name] || { cab: t.cab, ...t }; }
  built++;
  const body = element(vta, v.m_VisualTree, depth, usings);
  return nested ? body : `<div class="${['uitk-root', ...(vta.rootClasses || [])].join(' ')}" data-layout="${o.name}">${body}</div>`;
}
for (const n in layouts) fs.writeFileSync(`${OUT}/layouts/${n}.html`, layout(layouts[n]));
fs.writeFileSync(`${OUT}/layouts/index.json`, JSON.stringify(Object.keys(layouts).sort()));
console.log(`uitk: css ${(out.length / 1024 | 0)} KB, ${Object.keys(layouts).length} layouts (${built} trees with templates), ${missing.size} missing images, ${fs.readdirSync(`${OUT}/img`).length} images`);
