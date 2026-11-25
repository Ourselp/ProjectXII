// Quest progress (data/quests.json from tools/extract/quests.js), kept in localStorage.questState:
//   {active: {questId: stepIndex}, done: {objectiveId: 1}, finished: {questId: 1}}
// Which NPC stands where follows the progress: a quest's giver stands on its start map; an objective NPC
// ("aller voir", "ramener à"…) appears on the objective's map while that step is active.
// Start criteria are evaluated for quests (Qf finished, Qa active, Qc/Qo started-or-done) and level (PL); others count as met.
let D = null, S = JSON.parse(localStorage.questState || '{"active":{},"done":{},"finished":{}}');
const listeners = [];
const save = () => { localStorage.questState = JSON.stringify(S); listeners.forEach(f => f()); };
export const onQuestChange = f => listeners.push(f);
export const questData = () => D;
export async function loadQuests(bust = '') { D ??= await fetch('data/quests.json' + bust, { cache: 'no-store' }).then(r => r.json()); return D; }

const level = () => { try { return JSON.parse(localStorage.stats || '{}').level ?? 200; } catch { return 200; } };
const TALK = [1, 2, 3, 9, 12];                      // objectives validated by talking to their NPC
function criterion(c) {
  if (!c) return true;
  const expr = c.replace(/([A-Za-z]{2})([=!<>~])([^&|()]*)/g, (_, k, op, v) => {
    const n = +v, cmp = x => op === '=' ? x === n : op === '!' ? x !== n : op === '<' ? x < n : op === '>' ? x > n : true;
    switch (k) {
      case 'Qf': return op === '!' ? !S.finished[n] : !!S.finished[n];
      case 'Qa': return op === '!' ? S.active[n] == null : S.active[n] != null;
      case 'Qc': case 'Qo': return op === '!' ? !(S.active[n] != null || S.finished[n]) : (S.active[n] != null || !!S.finished[n]);
      case 'PL': return cmp(level());
      default: return true;
    }
  });
  if (!/^[truefals&|()! ]*$/.test(expr)) return true; // unknown syntax: don't block
  try { return Function(`return (${expr.replace(/&/g, '&&').replace(/\|/g, '||')})`)(); } catch { return true; }
}
export const available = id => S.active[id] == null && !S.finished[id] && criterion(D.q[id][3]);
const step = id => D.q[id][5][S.active[id]];
const pending = id => D.s[step(id)]?.[3].filter(o => !S.done[o]) || [];

// NPCs on a map: [{npc, give: [questIds available here], todo: [objectiveIds to validate with them]}]
export function npcsOn(mapId) {
  const out = new Map(), get = npc => out.get(npc) || (out.set(npc, { npc, give: [], todo: [], giver: false }), out.get(npc));
  for (const [id, q] of Object.entries(D.q)) for (const [m, npc] of q[4]) if (m === mapId) { const e = get(npc); e.giver = true; if (available(id)) e.give.push(+id); }
  for (const id of Object.keys(S.active)) for (const o of pending(id)) { const [t, npc, m] = D.o[o]; if (TALK.includes(t) && m === mapId && npc) get(npc).todo.push(o); }
  return [...out.values()];
}
export function start(id) { S.active[id] = 0; save(); return D.q[id][0]; }
// validate an objective; returns messages for the chat
export function validate(o) {
  const msgs = []; S.done[o] = 1;
  for (const id of Object.keys(S.active)) {
    if (!D.s[step(id)]?.[3].includes(o)) continue;
    if (pending(id).length) continue;
    msgs.push(`Étape terminée : ${D.s[step(id)][1]}`);
    if (++S.active[id] >= D.q[id][5].length) { delete S.active[id]; S.finished[id] = 1; msgs.push(`Quête terminée : ${D.q[id][0]} !`); }
    else msgs.push(`Nouvelle étape : ${D.s[step(id)][1]}`);
  }
  save(); return msgs;
}
// entering a map: "discover the map / subarea" objectives of active steps
export function visit(mapId, subArea) {
  const msgs = [];
  for (const id of Object.keys(S.active)) for (const o of pending(id)) {
    const [t, , m, , sub] = D.o[o];
    if ((t === 4 && m === mapId) || (t === 5 && sub === subArea)) msgs.push(`Objectif accompli : ${D.o[o][3]}`, ...validate(o));
  }
  return msgs;
}
export const abandon = id => { delete S.active[id]; save(); };

// journal: active quests with their current step and objectives
export function journal(el, { pos, teleport, chat }) {
  const act = Object.keys(S.active);
  el.innerHTML = `<div style="max-width:520px;max-height:65vh;overflow:auto">${act.length ? '' : '<p>Aucune quête en cours. Les personnages avec un <b>!</b> en proposent.</p>'}${act.map(id => {
    const st = D.s[step(id)] || [], objs = (st[3] || []).map(o => {
      const [t, , m, text] = D.o[o], done = S.done[o], where = m && pos(m);
      return `<div style="margin:3px 0;opacity:${done ? .5 : 1}">${done ? '✔' : '•'} ${text}${where ? ` <small>[${where}]</small> <button data-tp="${m}" title="Se téléporter">↪</button>` : ''}${!done && !TALK.includes(t) && t !== 4 && t !== 5 ? ` <button data-skip="${o}" title="Pas encore de combats / d'objets : valider">Valider</button>` : ''}</div>`;
    }).join('');
    return `<div style="border-bottom:1px solid #fff2;padding:6px 0"><b>${D.q[id][0]}</b> <small>· ${D.q[id][1]} · étape ${S.active[id] + 1}/${D.q[id][5].length}</small> <button data-ab="${id}" title="Abandonner">✕</button>
      <div style="margin:4px 0;font-weight:600">${st[1] || ''}</div><div style="opacity:.75;font-size:12px">${st[2] || ''}</div>${objs}</div>`;
  }).join('')}<p style="opacity:.6;font-size:12px">${Object.keys(S.finished).length} quête(s) terminée(s).</p></div>`;
  el.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.tp) teleport(+b.dataset.tp);
    if (b.dataset.skip) validate(+b.dataset.skip).forEach(m => chat(m, 'info'));
    if (b.dataset.ab) abandon(b.dataset.ab);
    journal(el, { pos, teleport, chat });
  };
}
