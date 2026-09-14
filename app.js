/* Rune del Drago — interfaccia, rendering canvas, salvataggio */
(function () {
  'use strict';
  const E = window.RuneEngine;
  const $ = s => document.querySelector(s);
  const canvas = $('#board'), ctx = canvas.getContext('2d');
  const STORE = 'rdd.state.v1';

  const state = Object.assign({ level: 1, maxLevel: 1, done: {}, totalMoves: 0, hintsUsed: 0 }, load() || {});
  let lv, sim, moves = 0, hints = 3, lastChange = 0, wonAt = 0, anims = new Map(), cell = 0, pad = 0, dpr = 1;

  function load() { try { return JSON.parse(localStorage.getItem(STORE)); } catch (e) { return null; } }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { } }

  const TUTORIAL = {
    1: 'Tocca una tessera per ruotarla. Porta il soffio del drago fino alla porta della tana.',
    2: 'Le rocce non si ruotano. I canali sono collegati solo se entrambe le tessere si aprono l\'una verso l\'altra.',
    4: 'Il ghiaccio blocca il fuoco. Porta il fulmine dalla runa del tuono fino al ghiaccio per spaccarlo: il fulmine si scarica lì e non prosegue.',
    5: 'Attento: se il fulmine tocca il drago o la porta, il livello fallisce. Tieni i due circuiti separati, uniti solo dal ghiaccio.',
    10: 'Non tutto il ghiaccio va spaccato: alcune tessere gelate sono solo distrazioni.',
    13: 'Due ghiacci: il fulmine si ferma sul primo che tocca, quindi la runa deve raggiungerli con due rami diversi.',
  };

  // ---------- livello ----------
  function startLevel(level) {
    state.level = level; save();
    lv = E.generate(level);
    lv.tiles.forEach(t => t.locked = false);
    moves = 0; hints = 3; wonAt = 0; anims.clear();
    resim();
    $('#lvl').textContent = level;
    $('#moves').textContent = '0';
    $('#hint').textContent = 'Indizio (' + hints + ')';
    $('#prev').disabled = level <= 1;
    $('#next').disabled = level >= state.maxLevel;
    $('#win').hidden = true;
    const tip = TUTORIAL[level];
    $('#tip').textContent = tip || '';
    $('#tip').hidden = !tip;
    resize();
  }

  function resim() {
    sim = E.simulate(lv.tiles, lv.n);
    lastChange = performance.now();
    if (sim.win) wonAt = lastChange + sim.maxDepth * 70 + 500;
    updateStatus();
  }

  function updateStatus() {
    const s = $('#status');
    if (sim.win) { s.textContent = 'Tana raggiunta!'; s.className = 'ok'; return; }
    if (sim.zapped.length) {
      const t = lv.tiles[sim.zapped[0]].type;
      s.textContent = t === 'dragon' ? 'Il fulmine ha folgorato il drago!' : 'Il fulmine ha sigillato la porta!';
      s.className = 'bad'; return;
    }
    const blocked = sim.blocked.some(b => b);
    if (blocked) { s.textContent = 'Il fuoco è bloccato dal ghiaccio.'; s.className = 'warn'; return; }
    if (sim.doorReached) { s.textContent = ''; return; }
    s.textContent = lv.rune >= 0 ? 'Porta il fuoco alla tana. Spacca il ghiaccio col fulmine.' : 'Porta il fuoco alla tana.';
    s.className = '';
  }

  // ---------- input ----------
  canvas.addEventListener('pointerdown', ev => {
    if (!lv || sim.win) return;
    const r = canvas.getBoundingClientRect();
    const x = (ev.clientX - r.left) - pad / dpr, y = (ev.clientY - r.top) - pad / dpr;
    const cs = cell / dpr;
    const cx = Math.floor(x / cs), cy = Math.floor(y / cs);
    if (cx < 0 || cy < 0 || cx >= lv.n || cy >= lv.n) return;
    rotate(cy * lv.n + cx, true);
  });

  function rotate(i, count) {
    const t = lv.tiles[i];
    if (t.fixed || t.type === 'rock' || t.locked) { bump(i); return; }
    t.rot = (t.rot + 1) % 4;
    anims.set(i, { start: performance.now(), from: -90 });
    if (count) { moves++; $('#moves').textContent = moves; }
    resim();
    if (navigator.vibrate) navigator.vibrate(8);
  }
  function bump(i) { anims.set(i, { start: performance.now(), from: 0, bump: true }); }

  $('#reset').onclick = () => startLevel(state.level);
  $('#prev').onclick = () => startLevel(state.level - 1);
  $('#next').onclick = () => { if (state.level < state.maxLevel) startLevel(state.level + 1); };
  $('#hint').onclick = () => {
    if (hints <= 0 || sim.win) return;
    const i = E.applyHint(lv);
    if (i < 0) return;
    hints--; $('#hint').textContent = 'Indizio (' + hints + ')';
    state.hintsUsed++; save();
    anims.set(i, { start: performance.now(), from: -90 });
    resim();
  };
  $('#winNext').onclick = () => startLevel(state.level + 1);
  $('#help').onclick = () => { $('#rules').hidden = false; };
  $('#rulesClose').onclick = () => { $('#rules').hidden = true; };
  $('#tip').onclick = () => { $('#tip').hidden = true; };

  // ---------- layout ----------
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const wrap = $('#boardWrap');
    const size = Math.floor(Math.min(wrap.clientWidth, wrap.clientHeight));
    canvas.style.width = size + 'px'; canvas.style.height = size + 'px';
    canvas.width = Math.round(size * dpr); canvas.height = Math.round(size * dpr);
    pad = Math.round(6 * dpr);
    cell = (canvas.width - pad * 2) / lv.n;
  }
  window.addEventListener('resize', resize);

  // ---------- rendering ----------
  const C = {
    bg: '#1b1714', stone: '#2e2823', stoneEdge: '#3b332c', rock: '#221d19', groove: '#120f0d',
    fire: '#ff8a1f', fireCore: '#ffd27a', bolt: '#7fe3ff', boltCore: '#ffffff',
    ice: '#bfe4ff', iceDark: '#6fb3e0', crack: '#1c3a52', gold: '#e6b84a', red: '#ff5252', green: '#4caf50',
  };

  function draw(now) {
    requestAnimationFrame(draw);
    if (!lv) return;
    const n = lv.n, cs = cell;
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const elapsed = now - lastChange;
    for (let i = 0; i < n * n; i++) {
      const t = lv.tiles[i];
      const x = pad + (i % n) * cs, y = pad + ((i / n) | 0) * cs;
      ctx.save();
      ctx.translate(x + cs / 2, y + cs / 2);
      let ang = 0, scale = 1;
      const a = anims.get(i);
      if (a) {
        const k = Math.min(1, (now - a.start) / 160);
        if (a.bump) scale = 1 - 0.08 * Math.sin(k * Math.PI);
        else ang = a.from * (1 - easeOut(k));
        if (k >= 1) anims.delete(i);
      }
      ctx.scale(scale, scale);
      drawTileBase(t, cs, i);
      ctx.save();
      ctx.rotate((t.rot * 90 + ang) * Math.PI / 180);
      drawChannels(t, cs, i, now, elapsed);
      ctx.restore();
      drawOverlay(t, cs, i, now, elapsed);
      ctx.restore();
    }
    if (wonAt && now > wonAt) {
      wonAt = 0;
      if (state.level >= state.maxLevel) state.maxLevel = state.level + 1;
      const prev = state.done[state.level];
      state.done[state.level] = prev ? Math.min(prev, moves) : moves;
      state.totalMoves += moves;
      save();
      $('#winMoves').textContent = moves;
      $('#win').hidden = false;
      $('#next').disabled = false;
    }
  }
  const easeOut = k => 1 - Math.pow(1 - k, 3);

  function rr(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawTileBase(t, cs, i) {
    const g = cs * 0.04;
    if (t.type === 'rock') {
      ctx.fillStyle = C.rock; rr(-cs / 2 + g, -cs / 2 + g, cs - 2 * g, cs - 2 * g, cs * 0.12); ctx.fill();
      ctx.fillStyle = '#2a2420';
      const rng = E.mulberry32(i * 31 + 7);
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc((rng() - 0.5) * cs * 0.6, (rng() - 0.5) * cs * 0.6, cs * (0.05 + rng() * 0.07), 0, 7); ctx.fill(); }
      return;
    }
    ctx.fillStyle = t.type === 'ice' ? '#284455' : C.stone;
    rr(-cs / 2 + g, -cs / 2 + g, cs - 2 * g, cs - 2 * g, cs * 0.12); ctx.fill();
    ctx.strokeStyle = t.locked ? C.gold : (t.type === 'ice' ? '#3f6a82' : C.stoneEdge);
    ctx.lineWidth = t.locked ? cs * 0.035 : cs * 0.02; ctx.stroke();
  }

  function drawChannels(t, cs, i, now, elapsed) {
    const m = t.base; // disegnato nel sistema ruotato
    if (!m) return;
    const w = cs * 0.3, half = cs / 2 - cs * 0.04;
    const isIce = t.type === 'ice';
    const hasFire = sim.fire[i] && sim.fireDepth[i] * 70 < elapsed;
    const hasBolt = sim.lit[i] && sim.litDepth[i] * 70 < elapsed;
    const cracked = sim.cracked[i] && hasBolt;
    // scanalatura
    let col = isIce && !cracked ? C.ice : C.groove;
    strokeMask(m, w, half, col, 'round');
    if (isIce && !cracked) {
      strokeMask(m, w * 0.45, half, '#e9f6ff', 'round');
    }
    if (cracked) {
      strokeMask(m, w, half, C.iceDark, 'round');
      // crepe
      ctx.strokeStyle = C.crack; ctx.lineWidth = cs * 0.025; ctx.beginPath();
      const rng = E.mulberry32(i * 17 + 3);
      for (let k = 0; k < 3; k++) { ctx.moveTo((rng() - 0.5) * cs * 0.5, (rng() - 0.5) * cs * 0.5); ctx.lineTo((rng() - 0.5) * cs * 0.6, (rng() - 0.5) * cs * 0.6); ctx.lineTo((rng() - 0.5) * cs * 0.7, (rng() - 0.5) * cs * 0.7); }
      ctx.stroke();
    }
    if (hasBolt) {
      const flick = 0.75 + 0.25 * Math.sin(now / 60 + i);
      ctx.globalAlpha = flick;
      strokeMask(m, w * 0.5, half, C.bolt, 'round');
      ctx.setLineDash([cs * 0.08, cs * 0.12]); ctx.lineDashOffset = -now / 25;
      strokeMask(m, w * 0.18, half, C.boltCore, 'butt');
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    if (hasFire) {
      const flick = 0.85 + 0.15 * Math.sin(now / 90 + i * 2);
      ctx.shadowColor = C.fire; ctx.shadowBlur = cs * 0.25 * flick;
      strokeMask(m, w * 0.62, half, C.fire, 'round');
      ctx.shadowBlur = 0;
      strokeMask(m, w * 0.25, half, C.fireCore, 'round');
    }
    // tappi delle estremità cieche
    if (!hasFire && !hasBolt && !isIce) {
      ctx.fillStyle = '#1a1512'; ctx.beginPath(); ctx.arc(0, 0, w * 0.55, 0, 7); ctx.fill();
    }
  }

  function strokeMask(m, w, half, color, cap) {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = cap; ctx.lineJoin = 'round';
    ctx.beginPath();
    const dirs = [[0, -half], [half, 0], [0, half], [-half, 0]];
    let bits = 0;
    for (let d = 0; d < 4; d++) if (m & (1 << d)) { ctx.moveTo(0, 0); ctx.lineTo(dirs[d][0], dirs[d][1]); bits++; }
    ctx.stroke();
    if (bits === 1) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, w * 0.5, 0, 7); ctx.fill(); }
  }

  function drawOverlay(t, cs, i, now, elapsed) {
    const hasFire = sim.fire[i] && sim.fireDepth[i] * 70 < elapsed;
    const zap = sim.zapped.includes(i) && sim.litDepth[i] * 70 < elapsed;
    if (t.type === 'dragon') {
      // testa del drago vista dall'alto, con la bocca rivolta verso l'apertura
      ctx.save();
      const d = [1, 2, 4, 8].indexOf(t.base & 15);
      if (d >= 0) ctx.rotate((d * 90 + 180) * Math.PI / 180);
      ctx.fillStyle = zap ? '#7a2a2a' : '#2f5d3a';
      ctx.beginPath(); ctx.arc(0, 0, cs * 0.3, 0, 7); ctx.fill();
      ctx.strokeStyle = zap ? C.red : '#8fd48f'; ctx.lineWidth = cs * 0.03; ctx.stroke();
      // corna
      ctx.strokeStyle = '#c9d6a8'; ctx.lineWidth = cs * 0.05; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-cs * 0.16, -cs * 0.2); ctx.lineTo(-cs * 0.26, -cs * 0.34); ctx.moveTo(cs * 0.16, -cs * 0.2); ctx.lineTo(cs * 0.26, -cs * 0.34); ctx.stroke();
      // occhi
      ctx.fillStyle = zap ? '#fff' : '#ffd23f';
      ctx.beginPath(); ctx.arc(-cs * 0.1, -cs * 0.06, cs * 0.05, 0, 7); ctx.arc(cs * 0.1, -cs * 0.06, cs * 0.05, 0, 7); ctx.fill();
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(-cs * 0.1, -cs * 0.06, cs * 0.02, 0, 7); ctx.arc(cs * 0.1, -cs * 0.06, cs * 0.02, 0, 7); ctx.fill();
      // narici / bocca
      ctx.fillStyle = C.fire; ctx.beginPath(); ctx.arc(0, cs * 0.12, cs * 0.06 + Math.sin(now / 120) * cs * 0.01, 0, 7); ctx.fill();
      ctx.restore();
      if (zap) label('⚡', cs);
    } else if (t.type === 'door') {
      // porta ad arco
      ctx.fillStyle = hasFire ? '#4a3418' : '#3a2f28';
      ctx.beginPath(); ctx.moveTo(-cs * 0.26, cs * 0.3); ctx.lineTo(-cs * 0.26, -cs * 0.05); ctx.arc(0, -cs * 0.05, cs * 0.26, Math.PI, 0); ctx.lineTo(cs * 0.26, cs * 0.3); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = zap ? C.red : (hasFire ? C.gold : '#6b5a4c'); ctx.lineWidth = cs * 0.035; ctx.stroke();
      ctx.strokeStyle = zap ? C.red : (hasFire ? C.fireCore : '#8a7360'); ctx.lineWidth = cs * 0.03;
      ctx.beginPath(); ctx.moveTo(0, -cs * 0.2); ctx.lineTo(0, cs * 0.2); ctx.moveTo(-cs * 0.12, -cs * 0.05); ctx.lineTo(cs * 0.12, -cs * 0.05); ctx.stroke();
      if (zap) label('⚡', cs);
    } else if (t.type === 'rune') {
      // runa del tuono: cerchio con sigillo a zig-zag
      const pulse = 0.9 + 0.1 * Math.sin(now / 200);
      ctx.fillStyle = '#1e2b3a'; ctx.beginPath(); ctx.arc(0, 0, cs * 0.26 * pulse, 0, 7); ctx.fill();
      ctx.strokeStyle = C.bolt; ctx.lineWidth = cs * 0.03; ctx.stroke();
      ctx.strokeStyle = '#eaffff'; ctx.lineWidth = cs * 0.05; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(cs * 0.06, -cs * 0.17); ctx.lineTo(-cs * 0.07, cs * 0.01); ctx.lineTo(cs * 0.04, cs * 0.01); ctx.lineTo(-cs * 0.06, cs * 0.17); ctx.stroke();
    }
    if (t.type === 'ice' && sim.blocked[i] && !sim.cracked[i]) {
      // fuoco che sbatte contro il ghiaccio: vapore
      const k = (now / 700) % 1;
      ctx.globalAlpha = 0.6 * (1 - k);
      ctx.fillStyle = '#ffffff';
      for (let p = 0; p < 3; p++) { ctx.beginPath(); ctx.arc((p - 1) * cs * 0.12, -cs * 0.05 - k * cs * 0.25 + p * cs * 0.03, cs * 0.05 + k * cs * 0.05, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    if (t.locked) { ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(cs * 0.38, -cs * 0.38, cs * 0.05, 0, 7); ctx.fill(); }
  }
  function label(txt, cs) {
    ctx.font = Math.round(cs * 0.3) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff'; ctx.fillText(txt, cs * 0.28, -cs * 0.28);
  }

  // ---------- home ----------
  const WORLDS = [
    { from: 1, name: 'La Bocca della Tana' },
    { from: 4, name: 'Le Grotte di Ghiaccio' },
    { from: 10, name: 'La Sala del Tuono' },
    { from: 23, name: 'Il Cuore del Vulcano' },
    { from: 36, name: 'Le Profondità' },
  ];
  function worldOf(level) {
    let w = WORLDS[0], next = null;
    for (let k = 0; k < WORLDS.length; k++) if (level >= WORLDS[k].from) { w = WORLDS[k]; next = WORLDS[k + 1] || null; }
    return { w, next };
  }

  function showHome() {
    const home = $('#home');
    const { w, next } = worldOf(state.maxLevel);
    $('#hWorld').textContent = w.name;
    $('#hLevel').textContent = state.maxLevel;
    if (next) {
      const span = next.from - w.from, at = state.maxLevel - w.from;
      $('#hBar').style.width = Math.round(100 * at / span) + '%';
      $('#hBarL').textContent = w.name;
      $('#hBarR').textContent = (next.from - state.maxLevel) + ' livelli a ' + next.name;
    } else {
      $('#hBar').style.width = '100%';
      $('#hBarL').textContent = w.name; $('#hBarR').textContent = 'livelli infiniti';
    }
    const doneCount = Object.keys(state.done).length;
    $('#hDone').textContent = doneCount;
    $('#hMoves').textContent = state.totalMoves;
    $('#hHints').textContent = state.hintsUsed;
    $('#hPlay').textContent = doneCount ? 'Continua · livello ' + state.level : 'Inizia l\'avventura';
    // griglia livelli: sbloccati + 4 bloccati in anteprima
    const chips = $('#hChips'); chips.innerHTML = '';
    const total = state.maxLevel + 4;
    for (let L = 1; L <= total; L++) {
      const c = document.createElement('button'); c.className = 'chip';
      const done = state.done[L];
      if (L > state.maxLevel) c.classList.add('locked');
      else if (done) c.classList.add('done');
      if (L === state.level) c.classList.add('current');
      c.innerHTML = L + (done ? '<small>✓ ' + done + '</small>' : '<small>' + E.paramsFor(L).n + '×' + E.paramsFor(L).n + '</small>');
      if (L <= state.maxLevel) c.onclick = () => { startLevel(L); hideHome(); };
      chips.appendChild(c);
    }
    home.hidden = false;
    startFx();
  }
  function hideHome() { $('#home').hidden = true; stopFx(); resize(); }
  $('#hPlay').onclick = () => { startLevel(state.level); hideHome(); };
  $('#hRules').onclick = () => { $('#rules').hidden = false; };
  $('#homeBtn').onclick = showHome;

  // particelle: braci che salgono e scintille di fulmine
  const fx = $('#homeFx'), fctx = fx.getContext('2d');
  let fxRun = false, parts = [];
  function startFx() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    fxRun = true; parts = [];
    fx.width = fx.clientWidth * dpr; fx.height = fx.clientHeight * dpr;
    for (let i = 0; i < 70; i++) parts.push(newPart(true));
    requestAnimationFrame(fxFrame);
  }
  function stopFx() { fxRun = false; }
  function newPart(anywhere) {
    const bolt = Math.random() < 0.12;
    return { x: Math.random() * fx.width, y: anywhere ? Math.random() * fx.height : fx.height + 10, r: (1 + Math.random() * 2.2) * dpr, vy: (0.25 + Math.random() * 0.6) * dpr, vx: (Math.random() - 0.5) * 0.3 * dpr, life: Math.random(), bolt, ph: Math.random() * 7 };
  }
  function fxFrame(now) {
    if (!fxRun) return;
    requestAnimationFrame(fxFrame);
    fctx.clearRect(0, 0, fx.width, fx.height);
    // bagliore in basso (la tana)
    const g = fctx.createRadialGradient(fx.width / 2, fx.height * 1.05, 0, fx.width / 2, fx.height * 1.05, fx.height * 0.7);
    g.addColorStop(0, 'rgba(255,138,31,.22)'); g.addColorStop(1, 'rgba(255,138,31,0)');
    fctx.fillStyle = g; fctx.fillRect(0, 0, fx.width, fx.height);
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.y -= p.vy; p.x += p.vx + Math.sin(now / 900 + p.ph) * 0.2 * dpr; p.life -= 0.0025;
      if (p.y < -10 || p.life <= 0) { parts[i] = newPart(false); continue; }
      const a = Math.min(1, p.life * 2) * (p.bolt ? (0.5 + 0.5 * Math.sin(now / 80 + p.ph)) : 1);
      fctx.globalAlpha = a * 0.85;
      fctx.fillStyle = p.bolt ? '#7fe3ff' : (p.r > 2.2 * dpr ? '#ffd27a' : '#ff8a1f');
      fctx.beginPath(); fctx.arc(p.x, p.y, p.r, 0, 7); fctx.fill();
    }
    fctx.globalAlpha = 1;
  }

  // ---------- avvio ----------
  if (state.level > state.maxLevel) state.level = state.maxLevel;
  startLevel(state.level);
  requestAnimationFrame(draw);
  showHome();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  }
})();
