// Character look: class, sex, head, 5 colours and cosmetic skins, chosen in the #look panel and kept in localStorage.
// Data: data/looks.json (tools/extract/looks.js). look() -> {ready, move, idle, skins, cols, scale} for drawRig.
import { loadRig, loadSkin, colorsOf } from './rig.js';

let D, gl, cur = { ready: false }, state;
const SLOTS = { hat: 'Chapeau', cape: 'Cape', shield: 'Bouclier', wings: 'Ailes', pet: 'Familier' };
const hex = n => '#' + (n >>> 0).toString(16).padStart(6, '0').slice(-6);

export const look = () => cur;
export async function setupLook(g) {
  gl = g; D = await fetch('data/looks.json').then(r => r.json());
  state = { breed: 8, gender: 0, head: 0, colors: null, hat: '', cape: '', shield: '', wings: '', ...JSON.parse(localStorage.look || '{}'), ...JSON.parse(new URLSearchParams(location.search).get('look') || '{}') };
  const el = document.getElementById('look'), sel = (k, opts) => `<label>${k[0]}<select data-k="${k[1]}">${opts}</select></label>`;
  const render = () => {
    const b = D.breeds.find(x => x.id === state.breed) || D.breeds[0], heads = D.heads[`${b.id}_${state.gender}`] || [];
    const colors = state.colors || b.looks[state.gender].colors;
    el.querySelector('.f').innerHTML =
      sel(['Classe', 'breed'], D.breeds.map(x => `<option value="${x.id}" ${x.id === b.id ? 'selected' : ''}>${x.name}</option>`).join('')) +
      sel(['Sexe', 'gender'], ['Mâle', 'Femelle'].map((n, i) => `<option value="${i}" ${i === state.gender ? 'selected' : ''}>${n}</option>`).join('')) +
      sel(['Tête', 'head'], heads.map((h, i) => `<option value="${i}" ${i === state.head ? 'selected' : ''}>${h.label}</option>`).join('')) +
      `<label>Couleurs<span>${colors.slice(0, 5).map((c, i) => `<input type="color" data-c="${i}" value="${hex(c)}">`).join('')}</span></label>` +
      Object.entries(SLOTS).filter(([s]) => D.equip[s]?.length).map(([s, n]) => sel([n, s], `<option value="">—</option>` +
        D.equip[s].map(id => `<option ${String(id) === String(state[s]) ? 'selected' : ''}>${id}</option>`).join(''))).join('') +
      `<button type="button" data-reset>Couleurs par défaut</button>`;
  };
  el.addEventListener('change', e => {
    const k = e.target.dataset.k, c = e.target.dataset.c;
    if (k) { state[k] = ['breed', 'gender', 'head'].includes(k) ? +e.target.value : e.target.value; if (k === 'breed' || k === 'gender') { state.head = 0; state.colors = null; } }
    if (c != null) { const b = D.breeds.find(x => x.id === state.breed); state.colors = [...(state.colors || b.looks[state.gender].colors)]; state.colors[c] = parseInt(e.target.value.slice(1), 16); }
    render(); apply();
  });
  el.addEventListener('click', e => { if (e.target.dataset.reset != null) { state.colors = null; render(); apply(); } });
  render(); await apply();
}

async function apply() {
  localStorage.look = JSON.stringify(state);
  const b = D.breeds.find(x => x.id === state.breed) || D.breeds[0], L = b.looks[state.gender];
  const head = (D.heads[`${b.id}_${state.gender}`] || [])[state.head];
  const ids = [head?.skin, ...Object.keys(SLOTS).map(s => state[s]), L.skin].filter(Boolean);
  const [move, idle, ...skins] = await Promise.all([loadRig(gl, '1-movement'), loadRig(gl, '1-static'), ...ids.map(id => loadSkin(gl, id))]);
  cur = { ready: !!(move && idle), move, idle, skins: skins.filter(Boolean), cols: colorsOf(state.colors || L.colors), scale: L.scale / 100 };
}
