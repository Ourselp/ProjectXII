// HUD (own design): character plate, life / AP / MP, class spell bar with tooltips, chat log, name above the hero.
const NAME = 'Chabou';
const $ = s => document.querySelector(s);
let spells = {}, breeds = [];

export async function setupHud() {
  [spells, { breeds }] = await Promise.all([fetch('data/spells.json', { cache: 'no-cache' }).then(r => r.json()), fetch('data/looks.json', { cache: 'no-cache' }).then(r => r.json())]);
  $('#hud-name').textContent = NAME; $('#heroname').textContent = NAME;
  const tip = $('#tip');
  $('#spells').addEventListener('mousemove', e => {
    const s = e.target.closest('[data-i]'); if (!s) { tip.hidden = true; return; }
    const sp = spells[s.dataset.b][s.dataset.i];
    tip.innerHTML = `<b>${sp.name}</b><span>${sp.ap} PA · portée ${sp.range[0]}–${sp.range[1]}</span><p>${sp.desc}</p>`;
    tip.hidden = false; tip.style.left = Math.min(innerWidth - 280, e.clientX + 12) + 'px'; tip.style.bottom = innerHeight - e.clientY + 12 + 'px';
  });
  $('#spells').addEventListener('mouseleave', () => tip.hidden = true);
  $('#spells').addEventListener('click', e => {
    const s = e.target.closest('[data-i]'); if (!s) return;
    const sp = spells[s.dataset.b][s.dataset.i];
    chat(`${NAME} prépare ${sp.name} (${sp.ap} PA). Pas de combat ici… pour l'instant.`, 'info');
    s.classList.remove('cast'); void s.offsetWidth; s.classList.add('cast');
  });
  document.addEventListener('keydown', e => { // 1..0 = first spells
    if (e.target.tagName === 'INPUT') return;
    const k = '1234567890'.indexOf(e.key); if (k >= 0) $(`#spells [data-i="${k}"]`)?.click();
  });
  chat(`Bienvenue, ${NAME} ! Clique sur une case pour te déplacer, sur le bord de la carte pour en changer.`, 'info');
}

// called when the look changes
export function setClass(breedId, gender) {
  const b = breeds.find(x => x.id === breedId); if (!b) return;
  const skin = b.looks[gender].skin;
  $('#portrait').src = `ui/Head_${skin}.png`; $('#portrait').onerror = () => { $('#portrait').src = `ui/class_${breedId}.png`; };
  $('#hud-class').textContent = `${b.name} · niveau 1`;
  $('#spells').innerHTML = (spells[breedId] || []).map((s, i) =>
    `<button data-b="${breedId}" data-i="${i}">${s.icon ? `<img src="ui/${s.icon}" alt="">` : s.name.slice(0, 2)}${i < 10 ? `<kbd>${(i + 1) % 10}</kbd>` : ''}</button>`).join('');
}

export function chat(text, kind = '') {
  const log = $('#chatlog'), line = document.createElement('div');
  line.className = kind; line.textContent = `[${new Date().toTimeString().slice(0, 5)}] ${text}`;
  log.append(line); while (log.children.length > 60) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}

// name label above the hero, in CSS pixels
export function nameAt(x, y) { const n = $('#heroname'); n.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`; }
