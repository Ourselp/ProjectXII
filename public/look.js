// Character look: class, sex, head, 5 colours, cosmetic skins; kept in localStorage (?look= overrides).
// Forms: #look-form (appearance window) and #equip-form (inventory window). buildLook(gl) -> {ready, move, idle, skins, cols, scale}.
const V = new URL(import.meta.url).search;
const { loadRig, loadSkin, colorsOf, BUST } = await import('./rig.js' + V);

let D, state;
export const SLOTS = { hat: 'Chapeau', cape: 'Cape', shield: 'Bouclier', wings: 'Ailes' };
const hex = n => '#' + (n >>> 0).toString(16).padStart(6, '0').slice(-6);
export const lookState = () => state;
export const breedOf = () => D.breeds.find(x => x.id === state.breed) || D.breeds[0];
export const cosmetics = slot => D.equip[slot] || []; // skin ids wearable in a slot
export function equip(slot, id) { state[slot] = String(state[slot]) === String(id) ? '' : String(id); changed(); } // same id again = take it off

export async function setupLook() {
  D = await fetch('data/looks.json' + BUST, { cache: 'no-store' }).then(r => r.json());
  state = { breed: 8, gender: 0, head: 0, colors: null, hat: '', cape: '', shield: '', wings: '',
    ...JSON.parse(localStorage.look || '{}'), ...JSON.parse(new URLSearchParams(location.search).get('look') || '{}') };
  if (!D.breeds.some(b => b.id === state.breed)) state.breed = 8;
  const onChange = e => {
    const k = e.target.dataset.k, c = e.target.dataset.c;
    if (k) { state[k] = ['breed', 'gender', 'head'].includes(k) ? +e.target.value : e.target.value; if (k === 'breed' || k === 'gender') { state.head = 0; state.colors = null; } }
    if (c != null) { state.colors = [...(state.colors || breedOf().looks[state.gender].colors)]; state.colors[c] = parseInt(e.target.value.slice(1), 16); }
    changed();
  };
  for (const id of ['look-form', 'equip-form']) document.getElementById(id).addEventListener('change', onChange);
  document.getElementById('look-form').addEventListener('click', e => { if (e.target.dataset.reset != null) { state.colors = null; changed(); } });
  changed();
}
function changed() { render(); localStorage.look = JSON.stringify(state); dispatchEvent(new CustomEvent('look', { detail: state })); }

function render() {
  const b = breedOf(), heads = D.heads[`${b.id}_${state.gender}`] || [], colors = state.colors || b.looks[state.gender].colors;
  const sel = (label, k, opts) => `<label>${label}<select data-k="${k}">${opts}</select></label>`;
  document.getElementById('look-form').innerHTML =
    sel('Classe', 'breed', D.breeds.map(x => `<option value="${x.id}" ${x.id === b.id ? 'selected' : ''}>${x.name}</option>`).join('')) +
    sel('Sexe', 'gender', ['Mâle', 'Femelle'].map((n, i) => `<option value="${i}" ${i === state.gender ? 'selected' : ''}>${n}</option>`).join('')) +
    sel('Tête', 'head', heads.map((h, i) => `<option value="${i}" ${i === state.head ? 'selected' : ''}>${h.label}</option>`).join('')) +
    `<label>Couleurs<span class="cols">${colors.slice(0, 5).map((c, i) => `<input type="color" data-c="${i}" value="${hex(c)}">`).join('')}</span></label>` +
    `<button type="button" data-reset>Couleurs par défaut</button>`;
  document.getElementById('equip-form').innerHTML = Object.entries(SLOTS).map(([s, n]) =>
    sel(n, s, `<option value="">—</option>` + (D.equip[s] || []).map(id => `<option ${String(id) === String(state[s]) ? 'selected' : ''}>${id}</option>`).join(''))).join('');
}

// load everything the current look needs into a WebGL context
export async function buildLook(gl, over = {}) { // over: look fields to override (cosmetic thumbnails)
  const state = { ...lookState(), ...over }, b = D.breeds.find(x => x.id === state.breed) || D.breeds[0], L = b.looks[state.gender], head = (D.heads[`${b.id}_${state.gender}`] || [])[state.head];
  const ids = [head?.skin, ...Object.keys(SLOTS).map(s => state[s]), L.skin].filter(Boolean);
  const [move, idle, ...skins] = await Promise.all([loadRig(gl, '1-movement'), loadRig(gl, '1-static'), ...ids.map(id => loadSkin(gl, id))]);
  return { ready: !!(move && idle), move, idle, skins: skins.filter(Boolean), cols: colorsOf(state.colors || L.colors), scale: L.scale / 100, hideHair: !!state.hat };
}
