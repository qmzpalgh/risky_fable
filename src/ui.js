// DOM interface: menu, HUD panels, action bar, modals. Pure presentation —
// every interaction is reported back through callbacks.
import { CONTINENTS, CONT_MEMBERS, CONT_OF, TERRITORIES } from './game/map.js';
import { territoriesOf, armiesOf, reinforcements, isSet, tradeValue, findSet, CARD_NAMES } from './game/engine.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

export const COLORS = [
  { name: 'Crimson', hex: '#d0353f' }, { name: 'Cobalt', hex: '#2f74d6' }, { name: 'Emerald', hex: '#2fa565' },
  { name: 'Amber', hex: '#e2a829' }, { name: 'Violet', hex: '#9357d9' }, { name: 'Ivory', hex: '#ddd6c4' },
];
const AI_NAMES = ['Marshal Vane', 'Admiral Okoro', 'General Lindqvist', 'Countess Arai', 'Baron Castellanos', 'Commander Temür'];

const ICON = {
  land: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1 2 4v5c0 3 2.6 5 6 6 3.4-1 6-3 6-6V4z"/></svg>',
  army: '<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="4" r="2.6"/><path d="M4.5 14c0-4 1-6.5 3.5-6.5s3.5 2.500 3.500 6.5z"/></svg>',
  card: '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="3.500" y="1.500" width="9" height="13" rx="1.500"/></svg>',
};
const CARD_ART = [
  '<svg viewBox="0 0 48 48" fill="#3a2e1a"><circle cx="24" cy="10" r="6"/><path d="M14 44c0-14 3-22 10-22s10 8 10 22z"/><rect x="35" y="8" width="2.500" height="34" rx="1"/></svg>',
  '<svg viewBox="0 0 48 48" fill="#3a2e1a"><path d="M10 44h28l-3-9-7-9 2-9 12 2 3-6-7-8-9-3-2-5-5 6-8 8-4 13 2 10z"/></svg>',
  '<svg viewBox="0 0 48 48" fill="#3a2e1a"><path d="M6 22 38 8l4 7L12 31z"/><circle cx="18" cy="34" r="9" fill="none" stroke="#3a2e1a" stroke-width="3.500"/><circle cx="18" cy="34" r="2.500"/><path d="M4 42h40v3H4z"/></svg>',
  '<svg viewBox="0 0 48 48" fill="#3a2e1a"><path d="m24 3 6 14 15 1.500-11.500 10L37 44 24 36l-13 8 3.500-15.500L3 18.500 18 17z"/></svg>',
];

export class UI {
  constructor() {
    this.logEl = $('log');
    for (const id of ['players', 'phase', 'tools', 'continents', 'log', 'action', 'tooltip']) $(id).classList.add('plate');
    document.querySelector('#loading')?.classList.add('ready');
  }

  // ---------- menu ----------
  showMenu({ onStart, onContinue, hasSave }) {
    const root = $('menu');
    const rows = [
      { name: 'You', type: 'human', color: 0 }, { name: AI_NAMES[1], type: 'normal', color: 1 }, { name: AI_NAMES[2], type: 'normal', color: 2 },
    ];
    const opts = { setup: 'quick', fortify: 'adjacent' };
    root.hidden = false;
    root.innerHTML = `
      <div class="title-block">
        <h1>Risky <span>Fable</span></h1>
        <p>Forty-two territories, six continents, one table. Muster your armies, roll the dice, and take the world before your rivals do.</p>
      </div>
      <div class="setup plate">
        <h2>Who is at the table?</h2>
        <div id="prows"></div>
        <button class="btn" id="add-player">Add a player</button>
        <h3>House rules</h3>
        <label class="opt"><span>Opening<small>How territories are handed out</small></span>
          <select id="opt-setup">
            <option value="quick">Quick start — dealt and garrisoned</option>
            <option value="deal">Dealt — place your own armies</option>
            <option value="draft">Draft — claim territories in turn</option>
          </select></label>
        <label class="opt"><span>Fortifying<small>The one troop move that ends a turn</small></span>
          <select id="opt-fortify">
            <option value="adjacent">To a neighbouring territory</option>
            <option value="connected">Anywhere along your own lines</option>
          </select></label>
        <div class="spacer"></div>
        <div class="go">
          ${hasSave ? '<button class="btn" id="continue">Resume saved game</button>' : ''}
          <button class="btn primary" id="start">Start the war</button>
        </div>
        <div class="foot">Drag to pan, scroll to zoom, right-drag to tilt and turn the table.</div>
      </div>`;
    const list = root.querySelector('#prows');
    const render = () => {
      list.innerHTML = '';
      rows.forEach((r, i) => {
        const row = h(`<div class="prow" style="margin-bottom:8px">
          <button class="swatch" title="Change colour" aria-label="Colour: ${COLORS[r.color].name}" style="background:${COLORS[r.color].hex}"></button>
          <input value="${esc(r.name)}" maxlength="18" aria-label="Player name" />
          <select aria-label="Player type">
            <option value="human">Human</option><option value="easy">AI — cautious</option><option value="normal">AI — seasoned</option><option value="hard">AI — ruthless</option>
          </select>
          <button class="rm" title="Remove player" aria-label="Remove player" ${rows.length <= 2 ? 'disabled style="visibility:hidden"' : ''}>×</button></div>`);
        const [sw, name, type, rm] = row.children;
        type.value = r.type;
        sw.onclick = () => { let c = r.color; do { c = (c + 1) % COLORS.length; } while (rows.some((o) => o !== r && o.color === c)); r.color = c; render(); };
        name.oninput = () => { r.name = name.value; r.custom = true; };
        type.onchange = () => {
          const was = r.type; r.type = type.value;
          if (!r.custom) { r.name = r.type === 'human' ? (rows.filter((o) => o.type === 'human').length > 1 ? `Player ${i + 1}` : 'You') : AI_NAMES[i]; if (was !== r.type) render(); }
        };
        rm.onclick = () => { rows.splice(i, 1); render(); };
        list.appendChild(row);
      });
      root.querySelector('#add-player').hidden = rows.length >= 6;
    };
    render();
    root.querySelector('#add-player').onclick = () => {
      const color = COLORS.findIndex((_, c) => !rows.some((r) => r.color === c));
      rows.push({ name: AI_NAMES[rows.length], type: 'normal', color }); render();
    };
    root.querySelector('#opt-setup').onchange = (e) => (opts.setup = e.target.value);
    root.querySelector('#opt-fortify').onchange = (e) => (opts.fortify = e.target.value);
    root.querySelector('#start').onclick = () => onStart({
      ...opts,
      players: rows.map((r, i) => ({ name: r.name.trim() || `Player ${i + 1}`, color: COLORS[r.color].hex, isAI: r.type !== 'human', level: r.type === 'human' ? 'normal' : r.type })),
    });
    const cont = root.querySelector('#continue');
    if (cont) cont.onclick = onContinue;
  }
  hideMenu() { $('menu').hidden = true; $('hud').hidden = false; }
  showHud(on) { $('hud').hidden = !on; }

  // ---------- HUD ----------
  renderTools(items) {
    const el = $('tools'); el.innerHTML = '';
    for (const it of items) { const b = h(`<button class="btn ghost" title="${esc(it.title || '')}">${esc(it.label)}</button>`); b.onclick = it.onClick; el.appendChild(b); }
  }
  renderPlayers(s, viewer) {
    $('players').innerHTML = s.players.map((p, i) => `
      <div class="player ${i === s.turn && s.phase !== 'over' ? 'current' : ''} ${p.alive ? '' : 'out'}">
        <span class="chip" style="background:${p.color}"></span>
        <span class="pname">${esc(p.name)}${p.isAI ? '<small>AI</small>' : ''}</span>
        <span class="pstats"><span title="Territories">${ICON.land}<b>${territoriesOf(s, i).length}</b></span><span title="Armies">${ICON.army}<b>${armiesOf(s, i) + (s.phase === 'draft' || s.phase === 'deploy' ? s.reserve[i] : 0)}</b></span><span title="Cards">${ICON.card}<b>${p.cards.length}</b></span></span>
      </div>`).join('');
  }
  renderPhase(s) {
    const p = s.players[s.turn];
    const setup = s.phase === 'draft' || s.phase === 'deploy';
    const order = ['reinforce', 'attack', 'fortify'], names = ['Reinforce', 'Attack', 'Fortify'];
    const at = order.indexOf(s.phase);
    $('phase').innerHTML = `<div class="who"><span class="chip" style="background:${p.color}"></span>${esc(p.name)}${setup ? '' : `<span style="color:var(--muted);font:500 15px var(--ui)">round ${s.round}</span>`}</div>
      <div class="steps">${setup ? `<span class="on">${s.phase === 'draft' ? 'Claiming territories' : 'Placing opening armies'}</span>` : names.map((n, i) => `<span class="${i === at ? 'on' : i < at ? 'done' : ''}">${n}</span>`).join('<i></i>')}</div>`;
  }
  renderContinents(s) {
    $('continents').innerHTML = CONTINENTS.map((c, ci) => {
      const o = s.owner[CONT_MEMBERS[ci][0]];
      const held = o >= 0 && CONT_MEMBERS[ci].every((t) => s.owner[t] === o);
      return `<div class="cont"><span class="sw" style="background:${c.color}"></span><span>${c.name}${held ? `<span class="holder"><span class="chip" style="background:${s.players[o].color}"></span>${esc(s.players[o].name)}</span>` : ''}</span><b>+${c.bonus}</b></div>`;
    }).join('');
  }
  log(html, cls = '') {
    const p = h(`<p class="${cls}">${html}</p>`);
    this.logEl.appendChild(p);
    while (this.logEl.children.length > 80) this.logEl.firstChild.remove();
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }
  clearLog() { this.logEl.innerHTML = ''; }
  name(p) { return `<em style="color:${p.color}">${esc(p.name)}</em>`; }

  // Action bar. spec: { msg, sub, thinking, controls: [ {type:'button'|'seg'|'slider', ...} ] }
  setAction(spec) {
    const el = $('action');
    const key = JSON.stringify(spec, (k, v) => (typeof v === 'function' ? undefined : v));
    if (key === this._actionKey) return;
    this._actionKey = key;
    el.innerHTML = `<div class="msg ${spec.thinking ? 'thinking' : ''}">${spec.msg}${spec.sub ? `<span class="sub">${spec.sub}</span>` : ''}</div><div class="controls"></div>`;
    const box = el.lastElementChild;
    this.primary = null;
    for (const c of spec.controls || []) {
      if (c.type === 'seg') {
        const seg = h('<div class="seg" role="group"></div>');
        seg.title = c.title || '';
        for (const o of c.options) {
          const b = h(`<button class="${o.value === c.value ? 'on' : ''}" ${o.disabled ? 'disabled' : ''}>${esc(o.label)}</button>`);
          b.onclick = () => c.onChange(o.value); seg.appendChild(b);
        }
        box.appendChild(seg);
      } else if (c.type === 'slider') {
        const w = h(`<label class="slider"><input type="range" min="${c.min}" max="${c.max}" value="${c.value}" aria-label="${esc(c.label || 'Armies')}" /><output>${c.value}</output></label>`);
        const [inp, out] = w.children;
        inp.oninput = () => { out.textContent = inp.value; c.onChange(+inp.value); };
        if (c.min === c.max) inp.disabled = true;
        box.appendChild(w);
      } else {
        const b = h(`<button class="btn ${c.kind || ''}" ${c.disabled ? 'disabled' : ''} title="${esc(c.title || '')}">${esc(c.label)}</button>`);
        b.onclick = c.onClick; box.appendChild(b);
        if (c.primary && !c.disabled) this.primary = b;
      }
    }
  }
  pressPrimary() { if (this.primary && !document.querySelector('#modal-root .modal')) { this.primary.click(); return true; } return false; }

  tooltip(html, e) {
    const el = $('tooltip');
    if (!html) { el.hidden = true; return; }
    el.innerHTML = html; el.hidden = false;
    this.moveTooltip(e);
  }
  moveTooltip(e) {
    const el = $('tooltip'); if (el.hidden || !e) return;
    const w = el.offsetWidth, hh = el.offsetHeight;
    el.style.left = Math.min(window.innerWidth - w - 8, e.clientX + 18) + 'px';
    el.style.top = Math.max(8, Math.min(window.innerHeight - hh - 8, e.clientY + 18)) + 'px';
  }
  territoryTip(s, t) {
    const o = s.owner[t], c = CONTINENTS[CONT_OF[t]];
    return `<h4>${TERRITORIES[t].name}</h4><div class="row"><span class="sw" style="width:9px;height:9px;border-radius:2px;background:${c.color}"></span>${c.name} · +${c.bonus}</div>` +
      (o >= 0 ? `<div class="row"><span class="chip" style="background:${s.players[o].color};width:10px;height:10px"></span>${esc(s.players[o].name)} — <b>${s.armies[t]}</b> ${s.armies[t] === 1 ? 'army' : 'armies'}</div>` : '<div class="row">Unclaimed</div>');
  }

  banner(title, sub = '', color = '') {
    const el = $('banner');
    el.hidden = true; void el.offsetWidth;
    el.innerHTML = `<h2 style="${color ? `color:${color}` : ''}">${title}</h2>${sub ? `<p>${sub}</p>` : ''}`;
    el.hidden = false;
    clearTimeout(this._bt); this._bt = setTimeout(() => (el.hidden = true), 2100);
  }

  showTray(on) { $('tray').hidden = !on; if (!on) $('roll-result').innerHTML = ''; }
  rollResult(att, def, res) {
    $('roll-result').innerHTML = `<div class="side"><span class="chip" style="background:${att.color}"></span>${esc(att.name)} ${res && res.aLoss ? `<span class="lossn">−${res.aLoss}</span>` : ''}</div><div class="side">${res && res.dLoss ? `<span class="lossn">−${res.dLoss}</span>` : ''} ${esc(def.name)}<span class="chip" style="background:${def.color}"></span></div>`;
  }

  // ---------- modals ----------
  modal(html) {
    const root = $('modal-root');
    root.innerHTML = '';
    const m = h(`<div class="modal plate" role="dialog" aria-modal="true">${html}</div>`);
    root.appendChild(m);
    return m;
  }
  closeModal() { $('modal-root').innerHTML = ''; }
  get modalOpen() { return !!$('modal-root').firstChild; }

  showCards(s, { canTrade, must, onTrade, onClose }) {
    const p = s.players[s.turn];
    const sel = new Set(findSet(s, s.turn) && (canTrade || must) ? findSet(s, s.turn) : []);
    const value = tradeValue(s.trades);
    const m = this.modal(`<h2>${esc(p.name)}’s cards</h2>
      <p>Trade three of a kind, one of each, or any set with a wild card. The next set is worth <b>${value} armies</b>. A traded card showing a territory you hold adds 2 armies there.</p>
      <div class="hand"></div>
      <div class="actions"><span id="trade-hint" style="margin-right:auto;color:var(--muted);align-self:center"></span>${must ? '' : '<button class="btn" id="close">Close</button>'}<button class="btn primary" id="trade">Trade for ${value} armies</button></div>`);
    const hand = m.querySelector('.hand'), btn = m.querySelector('#trade'), hint = m.querySelector('#trade-hint');
    if (!p.cards.length) hand.innerHTML = '<p>No cards yet. Conquer at least one territory in a turn to earn one.</p>';
    const upd = () => {
      [...hand.children].forEach((c, i) => c.classList?.toggle('sel', sel.has(i)));
      const ok = sel.size === 3 && isSet([...sel].map((i) => p.cards[i]));
      btn.disabled = !(ok && (canTrade || must));
      hint.textContent = must ? 'You hold five or more cards and must trade.' : !canTrade ? 'Cards can be traded at the start of your turn.' : sel.size === 3 && !ok ? 'Those three do not make a set.' : '';
    };
    p.cards.forEach((c, i) => {
      const el = h(`<button class="card"><span class="cname">${c.t >= 0 ? TERRITORIES[c.t].name : 'Wild card'}</span>${CARD_ART[c.type]}<span><span class="ctype">${CARD_NAMES[c.type]}</span>${c.t >= 0 && s.owner[c.t] === s.turn ? '<br><span class="mine">You hold this +2</span>' : ''}</span></button>`);
      el.onclick = () => { sel.has(i) ? sel.delete(i) : sel.size < 3 && sel.add(i); upd(); };
      hand.appendChild(el);
    });
    upd();
    btn.onclick = () => { this.closeModal(); onTrade([...sel]); };
    const close = m.querySelector('#close');
    if (close) close.onclick = () => { this.closeModal(); onClose?.(); };
  }

  showHelp() {
    const m = this.modal(`<h2>How to play</h2>
      <p>Take every territory on the map. Each turn has three steps.</p>
      <h3>Reinforce</h3>
      <ul><li>You receive one army per three territories you hold (never fewer than 3), plus a bonus for every continent you hold completely.</li>
      <li>Trade sets of three cards for more armies — each set traded in the game is worth more than the last. Holding five cards forces a trade.</li></ul>
      <h3>Attack</h3>
      <ul><li>Pick one of your territories with at least 2 armies, then a neighbouring enemy. Dotted lines mark sea routes.</li>
      <li>The attacker rolls up to 3 dice, the defender up to 2. Highest dice are compared, then second highest; the lower die loses an army and ties go to the defender.</li>
      <li>Blitz keeps rolling until the territory falls or you run out of troops. Conquer at least one territory in a turn to earn a card. Eliminate a player to take theirs.</li></ul>
      <p>Double-click an enemy territory to blitz and automatically move all surviving armies in, leaving one behind. If you have not picked an attacker, your strongest neighbouring territory attacks.</p>
      <h3>Fortify</h3>
      <ul><li>Make one troop movement between your territories, then your turn ends.</li></ul>
      <h3>Controls</h3>
      <ul><li>Drag to pan · scroll or pinch to zoom · right-drag (or two fingers) to tilt and rotate.</li>
      <li><kbd>Enter</kbd> confirms the highlighted action · <kbd>Esc</kbd> or right-click cancels a selection · <kbd>C</kbd> opens your cards · <kbd>H</kbd> recentres the camera.</li>
      <li>Hold <kbd>Shift</kbd> while placing to drop 5 armies at once.</li></ul>
      <div class="actions"><button class="btn primary" id="close">Back to the table</button></div>`);
    m.querySelector('#close').onclick = () => this.closeModal();
  }

  confirm(title, text, yes, onYes) {
    const m = this.modal(`<h2>${title}</h2><p>${text}</p><div class="actions"><button class="btn" id="no">Keep playing</button><button class="btn danger" id="yes">${yes}</button></div>`);
    m.querySelector('#no').onclick = () => this.closeModal();
    m.querySelector('#yes').onclick = () => { this.closeModal(); onYes(); };
  }

  showVictory(s, onAgain) {
    const w = s.players[s.winner];
    const m = this.modal(`<p style="margin:0;color:var(--brass)">The world is won in round ${s.round}</p>
      <div class="victor"><span class="chip" style="background:${w.color}"></span>${esc(w.name)}</div>
      <table class="stats"><thead><tr><th>Commander</th><th>Territories taken</th><th>Territories lost</th><th>Armies destroyed</th><th>Armies lost</th><th>Sets traded</th></tr></thead><tbody>
      ${s.players.map((p) => `<tr><td><span class="chip" style="background:${p.color}"></span>${esc(p.name)}</td><td>${p.stats.conquered}</td><td>${p.stats.lost}</td><td>${p.stats.killed}</td><td>${p.stats.casualties}</td><td>${p.stats.trades}</td></tr>`).join('')}
      </tbody></table>
      <div class="actions"><button class="btn" id="look">Admire the map</button><button class="btn primary" id="again">Play again</button></div>`);
    m.querySelector('#again').onclick = () => { this.closeModal(); onAgain(); };
    m.querySelector('#look').onclick = () => this.closeModal();
  }
}

export { reinforcements };
