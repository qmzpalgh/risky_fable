// Pairwise AI strength check: node scripts/duel.mjs [games]
import * as E from '../src/game/engine.js';
import * as AI from '../src/game/ai.js';
function step(s) {
  if (s.phase === 'draft') return E.claim(s, AI.aiDraftPick(s));
  if (s.phase === 'deploy') return E.deploy(s, AI.aiPlacement(s));
  if (s.phase === 'reinforce') { let set; while ((set = AI.aiTrade(s))) E.trade(s, set); while (s.pool > 0) E.place(s, AI.aiPlacement(s), Math.ceil(s.pool / 2)); return E.beginAttack(s); }
  if (s.phase === 'attack') {
    if (s.pending) return E.occupy(s, AI.aiOccupy(s));
    if (E.mustTrade(s) || (s.forcedTrade && E.canTrade(s))) return E.trade(s, AI.aiTrade(s));
    if (s.pool > 0) return E.place(s, AI.aiPlacement(s), s.pool);
    const a = AI.aiAttack(s); if (a) return E.attack(s, a.from, a.to, a.dice); return E.endAttack(s);
  }
  const f = AI.aiFortify(s); if (f) E.fortify(s, f.from, f.to, f.n); return E.endTurn(s);
}
const games = +process.argv[2] || 400;
for (const lv of [['easy', 'normal'], ['normal', 'hard'], ['easy', 'hard'], ['easy', 'normal', 'hard']]) {
  const wins = {}; let rounds = 0;
  for (let g = 0; g < games; g++) {
    const players = lv.map((_, i) => ({ name: 'P', color: '#fff', isAI: true, level: lv[(i + g) % lv.length] }));
    const s = E.createGame({ seed: g * 7 + 3, setup: 'quick', players });
    let n = 0; while (s.phase !== 'over' && n++ < 80000) step(s);
    if (s.phase === 'over') { const l = s.players[s.winner].level; wins[l] = (wins[l] || 0) + 1; rounds += s.round; }
  }
  console.log(lv.join(' vs '), wins, 'avg rounds', (rounds / games).toFixed(1));
}
