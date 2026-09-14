/* Rune del Drago — interfaccia, rendering canvas, salvataggio */
(function () {
  'use strict';
  const E = window.RuneEngine;
  const $ = s => document.querySelector(s);
  const canvas = $('#board'), ctx = canvas.getContext('2d');
  const STORE = 'rdd.state.v1';

  const state = Object.assign({ level: 1, maxLevel: 1, done: {}, totalMoves: 0, hintsUsed: 0, sound: true }, load() || {});
  for (const k in state.done) if (typeof state.done[k] === 'number') state.done[k] = { m: state.done[k], s: 1 }; // migrazione v1
  let lv, sim, par = 0, hintsThisLevel = 0, moves = 0, hints = 3, lastChange = 0, wonAt = 0, anims = new Map(), cell = 0, pad = 0, dpr = 1;

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
    moves = 0; hints = 3; hintsThisLevel = 0; wonAt = 0; anims.clear();
    par = E.parMoves(lv);
    $('#par').textContent = par;
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
    if (t.fixed || t.type === 'rock' || t.locked) { bump(i); sfx('thud'); return; }
    const before = sim;
    t.rot = (t.rot + 1) % 4;
    anims.set(i, { start: performance.now(), from: -90 });
    if (count) { moves++; $('#moves').textContent = moves; }
    resim();
    sfx('tap');
    const crackedNow = sim.cracked.reduce((a, b) => a + b, 0), crackedBefore = before.cracked.reduce((a, b) => a + b, 0);
    if (crackedNow > crackedBefore) sfx('crack');
    if (sim.zapped.length && !before.zapped.length) sfx('zap');
    if (sim.win) setTimeout(() => sfx('win'), Math.min(1200, sim.maxDepth * 70));
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
    hints--; hintsThisLevel++; $('#hint').textContent = 'Indizio (' + hints + ')';
    state.hintsUsed++; save(); sfx('hint');
    anims.set(i, { start: performance.now(), from: -90 });
    resim();
  };
  $('#winNext').onclick = () => startLevel(state.level + 1);
  $('#winHome').onclick = () => { startLevel(state.level + 1); showHome(); };
  $('#winRetry').onclick = () => startLevel(state.level);
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
    ctx.fillStyle = '#14100d'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const vg = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, canvas.width * 0.2, canvas.width / 2, canvas.height / 2, canvas.width * 0.75);
    vg.addColorStop(0, 'rgba(60,45,30,.25)'); vg.addColorStop(1, 'rgba(0,0,0,.45)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, canvas.width, canvas.height);
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
      const st = E.stars(moves, par, hintsThisLevel);
      const prev = state.done[state.level];
      state.done[state.level] = { m: prev ? Math.min(prev.m, moves) : moves, s: prev ? Math.max(prev.s, st) : st };
      state.totalMoves += moves;
      save();
      $('#winMoves').textContent = moves; $('#winPar').textContent = par;
      $('#winStars').textContent = '★'.repeat(st) + '☆'.repeat(3 - st);
      $('#winNote').textContent = st === 3 ? 'Perfetto: nessuna mossa sprecata.' : st === 2 ? (hintsThisLevel ? 'Bene, ma con un indizio.' : 'Bene. Il minimo era ' + par + '.') : 'Risolto. Il minimo era ' + par + ' mosse: riprova per le stelle.';
      $('#win').hidden = false;
      $('#next').disabled = false;
    }
  }
  const easeOut = k => 1 - Math.pow(1 - k, 3);

  function rr(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  // ---- basi delle tessere: pre-renderizzate e messe in cache -------------
  const baseCache = new Map();
  function tileBaseImage(t, cs, i) {
    const key = t.type + '|' + (t.locked ? 'L' : '') + '|' + Math.round(cs) + '|' + i;
    let img = baseCache.get(key);
    if (img) return img;
    if (baseCache.size > 400) baseCache.clear();
    img = document.createElement('canvas'); img.width = img.height = Math.ceil(cs);
    const c = img.getContext('2d');
    c.translate(cs / 2, cs / 2);
    const rng = E.mulberry32(i * 131 + 17);
    const g = cs * 0.045;
    if (t.type === 'rock') {
      // pozzo scuro + masso irregolare sfaccettato
      c.fillStyle = '#17130f'; rr(c, -cs / 2 + g, -cs / 2 + g, cs - 2 * g, cs - 2 * g, cs * 0.12); c.fill();
      const pts = [];
      const k = 7 + Math.floor(rng() * 3);
      for (let p = 0; p < k; p++) { const a = (p / k) * Math.PI * 2, r = cs * (0.26 + rng() * 0.12); pts.push([Math.cos(a) * r, Math.sin(a) * r * 0.92]); }
      c.beginPath(); pts.forEach((p, q) => q ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath();
      c.fillStyle = '#2b2521'; c.fill();
      c.strokeStyle = '#3a322c'; c.lineWidth = cs * 0.02; c.stroke();
      // sfaccettature chiare in alto a sinistra, scure in basso a destra
      c.save(); c.clip();
      c.fillStyle = 'rgba(255,240,220,.07)'; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let p = 1; p < 4; p++) c.lineTo(pts[p][0], pts[p][1]); c.lineTo(-cs * 0.05, -cs * 0.02); c.closePath(); c.fill();
      c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.moveTo(pts[4][0], pts[4][1]); for (let p = 5; p < k; p++) c.lineTo(pts[p][0], pts[p][1]); c.lineTo(cs * 0.04, cs * 0.06); c.closePath(); c.fill();
      c.restore();
      baseCache.set(key, img); return img;
    }
    const isIce = t.type === 'ice';
    // lastra di pietra con leggera sfumatura
    const grad = c.createLinearGradient(-cs / 2, -cs / 2, cs / 2, cs / 2);
    if (isIce) { grad.addColorStop(0, '#2f5266'); grad.addColorStop(1, '#213a4a'); }
    else { grad.addColorStop(0, '#352e28'); grad.addColorStop(1, '#27211c'); }
    c.fillStyle = grad; rr(c, -cs / 2 + g, -cs / 2 + g, cs - 2 * g, cs - 2 * g, cs * 0.12); c.fill();
    // grana
    for (let p = 0; p < 26; p++) {
      const x = (rng() - 0.5) * (cs - 3 * g), y = (rng() - 0.5) * (cs - 3 * g), r = cs * (0.006 + rng() * 0.014);
      c.fillStyle = rng() < 0.5 ? 'rgba(255,235,210,.05)' : 'rgba(0,0,0,.18)';
      c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    }
    if (isIce) {
      // venature di brina
      c.strokeStyle = 'rgba(200,235,255,.16)'; c.lineWidth = cs * 0.012; c.beginPath();
      for (let p = 0; p < 5; p++) { const x = (rng() - 0.5) * cs * 0.8, y = (rng() - 0.5) * cs * 0.8; c.moveTo(x, y); c.lineTo(x + (rng() - 0.5) * cs * 0.4, y + (rng() - 0.5) * cs * 0.4); }
      c.stroke();
    }
    // bordo smussato: luce in alto/sinistra, ombra in basso/destra
    c.lineWidth = cs * 0.022;
    c.strokeStyle = isIce ? 'rgba(190,230,255,.28)' : 'rgba(255,235,210,.13)';
    c.beginPath(); c.moveTo(-cs / 2 + g + cs * 0.12, cs / 2 - g); c.lineTo(-cs / 2 + g, cs / 2 - g - cs * 0.12); c.lineTo(-cs / 2 + g, -cs / 2 + g + cs * 0.12); c.arcTo(-cs / 2 + g, -cs / 2 + g, -cs / 2 + g + cs * 0.12, -cs / 2 + g, cs * 0.12); c.lineTo(cs / 2 - g - cs * 0.12, -cs / 2 + g); c.stroke();
    c.strokeStyle = 'rgba(0,0,0,.35)';
    c.beginPath(); c.moveTo(cs / 2 - g - cs * 0.12, -cs / 2 + g); c.lineTo(cs / 2 - g, -cs / 2 + g + cs * 0.12); c.lineTo(cs / 2 - g, cs / 2 - g - cs * 0.12); c.arcTo(cs / 2 - g, cs / 2 - g, cs / 2 - g - cs * 0.12, cs / 2 - g, cs * 0.12); c.lineTo(-cs / 2 + g + cs * 0.12, cs / 2 - g); c.stroke();
    if (t.locked) { c.strokeStyle = C.gold; c.lineWidth = cs * 0.035; rr(c, -cs / 2 + g, -cs / 2 + g, cs - 2 * g, cs - 2 * g, cs * 0.12); c.stroke(); }
    baseCache.set(key, img); return img;
  }

  function drawTileBase(t, cs, i) {
    const img = tileBaseImage(t, cs, i);
    ctx.drawImage(img, -cs / 2, -cs / 2, cs, cs);
  }

  // ---- canali ed elementi -------------------------------------------------
  const DIRV = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  function strokeMask(m, w, half, color, cap) {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = cap; ctx.lineJoin = 'round';
    ctx.beginPath();
    let bits = 0;
    for (let d = 0; d < 4; d++) if (m & (1 << d)) { ctx.moveTo(0, 0); ctx.lineTo(DIRV[d][0] * half, DIRV[d][1] * half); bits++; }
    ctx.stroke();
    if (bits === 1) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, w * 0.5, 0, 7); ctx.fill(); }
  }

  // fulmine frastagliato lungo ogni ramo aperto
  function strokeBolt(m, half, cs, now, i) {
    const seed = Math.floor(now / 70) * 7 + i * 13;
    const rng = E.mulberry32(seed);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let d = 0; d < 4; d++) {
      if (!(m & (1 << d))) continue;
      const dx = DIRV[d][0], dy = DIRV[d][1], px = -dy, py = dx;
      const pts = [[0, 0]];
      for (let s = 1; s <= 3; s++) { const f = s / 4, off = (rng() - 0.5) * cs * 0.16; pts.push([dx * half * f + px * off, dy * half * f + py * off]); }
      pts.push([dx * half, dy * half]);
      const path = () => { ctx.beginPath(); pts.forEach((p, q) => q ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); };
      ctx.strokeStyle = 'rgba(127,227,255,.55)'; ctx.lineWidth = cs * 0.11; path(); ctx.stroke();
      ctx.strokeStyle = '#dff7ff'; ctx.lineWidth = cs * 0.04; path(); ctx.stroke();
    }
  }

  function drawChannels(t, cs, i, now, elapsed) {
    const m = t.base; // disegnato nel sistema ruotato
    if (!m) return;
    const w = cs * 0.3, half = cs / 2 - cs * 0.045;
    const isIce = t.type === 'ice';
    const hasFire = sim.fire[i] && sim.fireDepth[i] * 70 < elapsed;
    const hasBolt = sim.lit[i] && sim.litDepth[i] * 70 < elapsed;
    const cracked = sim.cracked[i] && hasBolt;
    // scanalatura incisa: ombra interna in alto, bordo chiaro in basso
    strokeMask(m, w, half, isIce && !cracked ? '#dff2ff' : '#100d0b', 'round');
    if (!(isIce && !cracked)) {
      ctx.save(); ctx.translate(0, cs * 0.012); strokeMask(m, w * 0.62, half, 'rgba(255,235,210,.05)', 'round'); ctx.restore();
    }
    if (isIce && !cracked) {
      // cristallo: sfaccettature chiare
      strokeMask(m, w * 0.55, half, '#f6fbff', 'round');
      ctx.save(); ctx.translate(-cs * 0.02, -cs * 0.02); strokeMask(m, w * 0.18, half, 'rgba(255,255,255,.9)', 'round'); ctx.restore();
      strokeMask(m, w, half, 'rgba(120,180,220,.35)', 'round');
    }
    if (cracked) {
      strokeMask(m, w, half, '#8ec2e6', 'round');
      strokeMask(m, w * 0.6, half, '#b9dcf3', 'round');
      // crepe e schegge
      const rng = E.mulberry32(i * 17 + 3);
      ctx.strokeStyle = '#173247'; ctx.lineWidth = cs * 0.022; ctx.lineCap = 'round'; ctx.beginPath();
      for (let k = 0; k < 4; k++) { let x = (rng() - 0.5) * cs * 0.3, y = (rng() - 0.5) * cs * 0.3; ctx.moveTo(x, y); for (let s = 0; s < 3; s++) { x += (rng() - 0.5) * cs * 0.3; y += (rng() - 0.5) * cs * 0.3; ctx.lineTo(x, y); } }
      ctx.stroke();
    }
    if (hasBolt) strokeBolt(m, half, cs, now, i);
    if (hasFire) {
      const flick = 0.85 + 0.15 * Math.sin(now / 90 + i * 2);
      ctx.shadowColor = C.fire; ctx.shadowBlur = cs * 0.28 * flick;
      strokeMask(m, w * 0.66, half, '#e8611a', 'round');
      ctx.shadowBlur = 0;
      strokeMask(m, w * 0.42, half, C.fire, 'round');
      strokeMask(m, w * (0.16 + 0.06 * Math.sin(now / 60 + i)), half, '#fff0b0', 'round');
      // braci che scorrono
      const rng = E.mulberry32(i * 7 + 1);
      for (let d = 0; d < 4; d++) {
        if (!(m & (1 << d))) continue;
        for (let k = 0; k < 2; k++) {
          const f = ((now / 900 + rng()) % 1), r = cs * 0.025;
          ctx.fillStyle = 'rgba(255,240,180,' + (0.9 * (1 - f)) + ')';
          ctx.beginPath(); ctx.arc(DIRV[d][0] * half * f + (rng() - 0.5) * cs * 0.08, DIRV[d][1] * half * f + (rng() - 0.5) * cs * 0.08, r, 0, 7); ctx.fill();
        }
      }
    }
    // nodo centrale delle estremità cieche
    if (!hasFire && !hasBolt && !isIce) {
      ctx.fillStyle = '#0b0908'; ctx.beginPath(); ctx.arc(0, 0, w * 0.55, 0, 7); ctx.fill();
    }
  }

  function drawOverlay(t, cs, i, now, elapsed) {
    const hasFire = sim.fire[i] && sim.fireDepth[i] * 70 < elapsed;
    const zap = sim.zapped.includes(i) && sim.litDepth[i] * 70 < elapsed;
    if (t.type === 'dragon') drawDragon(t, cs, i, now, zap);
    else if (t.type === 'door') drawDoor(t, cs, i, now, hasFire, zap);
    else if (t.type === 'rune') drawRune(t, cs, i, now);
    if (t.type === 'ice' && sim.blocked[i] && !sim.cracked[i]) {
      // vapore: il fuoco sbatte contro il ghiaccio
      for (let p = 0; p < 4; p++) {
        const k = ((now / 900) + p * 0.25) % 1;
        ctx.globalAlpha = 0.55 * (1 - k);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc((p - 1.5) * cs * 0.1 + Math.sin(now / 300 + p) * cs * 0.03, cs * 0.05 - k * cs * 0.35, cs * 0.04 + k * cs * 0.07, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (t.locked) { ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(cs * 0.38, -cs * 0.38, cs * 0.05, 0, 7); ctx.fill(); }
  }

  function drawDragon(t, cs, i, now, zap) {
    // testa vista dall'alto, muso rivolto verso l'apertura (+y locale)
    const d = [1, 2, 4, 8].indexOf(t.base & 15);
    const n = lv.n, x = i % n, y = (i / n) | 0;
    let breathing = false;
    if (d >= 0) { const nx = x + DIRV[d][0], ny = y + DIRV[d][1]; if (nx >= 0 && ny >= 0 && nx < n && ny < n) breathing = !!sim.fire[ny * n + nx]; }
    ctx.save();
    if (d >= 0) ctx.rotate((d * 90 + 180) * Math.PI / 180);
    const s = cs;
    // collo
    ctx.fillStyle = zap ? '#5a2a2a' : '#24462c';
    ctx.beginPath(); ctx.ellipse(0, -s * 0.3, s * 0.2, s * 0.16, 0, 0, 7); ctx.fill();
    // testa
    const g = ctx.createLinearGradient(-s * 0.25, 0, s * 0.25, 0);
    if (zap) { g.addColorStop(0, '#6a2f2f'); g.addColorStop(0.5, '#8a3a3a'); g.addColorStop(1, '#5a2626'); }
    else { g.addColorStop(0, '#2f6a3c'); g.addColorStop(0.5, '#4a8f52'); g.addColorStop(1, '#2a5b35'); }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-s * 0.25, -s * 0.22);
    ctx.quadraticCurveTo(-s * 0.3, s * 0.05, -s * 0.1, s * 0.3);
    ctx.quadraticCurveTo(0, s * 0.36, s * 0.1, s * 0.3);
    ctx.quadraticCurveTo(s * 0.3, s * 0.05, s * 0.25, -s * 0.22);
    ctx.quadraticCurveTo(0, -s * 0.34, -s * 0.25, -s * 0.22);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = zap ? '#c94b4b' : '#173a20'; ctx.lineWidth = s * 0.02; ctx.stroke();
    // cresta centrale e scaglie
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = s * 0.015;
    ctx.beginPath(); ctx.moveTo(0, -s * 0.28); ctx.lineTo(0, s * 0.2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.arc((k % 2 ? 1 : -1) * s * 0.12, -s * 0.15 + k * s * 0.06, s * 0.035, 0, 7); ctx.fill(); }
    // corna
    ctx.strokeStyle = '#d9d2b0'; ctx.lineWidth = s * 0.06; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-s * 0.18, -s * 0.24); ctx.quadraticCurveTo(-s * 0.3, -s * 0.32, -s * 0.28, -s * 0.42);
    ctx.moveTo(s * 0.18, -s * 0.24); ctx.quadraticCurveTo(s * 0.3, -s * 0.32, s * 0.28, -s * 0.42); ctx.stroke();
    // occhi con pupilla a fessura
    for (const sx of [-1, 1]) {
      ctx.fillStyle = zap ? '#ffffff' : '#ffd23f';
      ctx.beginPath(); ctx.ellipse(sx * s * 0.12, -s * 0.06, s * 0.06, s * 0.045, sx * 0.4, 0, 7); ctx.fill();
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.ellipse(sx * s * 0.12, -s * 0.06, s * 0.015, s * 0.04, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#173a20'; ctx.lineWidth = s * 0.02; ctx.beginPath(); ctx.moveTo(sx * s * 0.05, -s * 0.13); ctx.lineTo(sx * s * 0.19, -s * 0.1); ctx.stroke();
    }
    // narici
    ctx.fillStyle = '#0f2415';
    ctx.beginPath(); ctx.ellipse(-s * 0.05, s * 0.23, s * 0.025, s * 0.018, 0, 0, 7); ctx.ellipse(s * 0.05, s * 0.23, s * 0.025, s * 0.018, 0, 0, 7); ctx.fill();
    if (breathing) {
      // getto di fiamma dalla bocca verso il canale
      const f = 0.85 + 0.15 * Math.sin(now / 70);
      ctx.shadowColor = C.fire; ctx.shadowBlur = s * 0.2;
      ctx.fillStyle = 'rgba(255,138,31,.9)';
      ctx.beginPath(); ctx.moveTo(-s * 0.09, s * 0.28); ctx.quadraticCurveTo(0, s * 0.62 * f, s * 0.09, s * 0.28); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff0b0';
      ctx.beginPath(); ctx.moveTo(-s * 0.04, s * 0.3); ctx.quadraticCurveTo(0, s * 0.5 * f, s * 0.04, s * 0.3); ctx.closePath(); ctx.fill();
    } else if (!zap) {
      // sbuffi di fumo dalle narici
      for (let p = 0; p < 2; p++) {
        const k = ((now / 1400) + p * 0.5) % 1;
        ctx.globalAlpha = 0.35 * (1 - k);
        ctx.fillStyle = '#cfcfcf';
        ctx.beginPath(); ctx.arc((p ? 1 : -1) * s * 0.06 + Math.sin(now / 400 + p) * s * 0.02, s * 0.26 + k * s * 0.2, s * 0.02 + k * s * 0.05, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (zap) label('⚡', cs);
  }

  function drawDoor(t, cs, i, now, open, zap) {
    const s = cs;
    // arco di pietra
    ctx.fillStyle = '#3d342c';
    ctx.beginPath(); ctx.moveTo(-s * 0.33, s * 0.34); ctx.lineTo(-s * 0.33, -s * 0.04); ctx.arc(0, -s * 0.04, s * 0.33, Math.PI, 0); ctx.lineTo(s * 0.33, s * 0.34); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = zap ? C.red : '#5a4d42'; ctx.lineWidth = s * 0.025; ctx.stroke();
    // conci
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = s * 0.012; ctx.beginPath();
    for (let a = 0; a <= 6; a++) { const th = Math.PI + a * Math.PI / 6; ctx.moveTo(Math.cos(th) * s * 0.26, -s * 0.04 + Math.sin(th) * s * 0.26); ctx.lineTo(Math.cos(th) * s * 0.33, -s * 0.04 + Math.sin(th) * s * 0.33); }
    ctx.stroke();
    // interno: buio oppure luce calda quando la porta è aperta
    ctx.save();
    ctx.beginPath(); ctx.moveTo(-s * 0.25, s * 0.34); ctx.lineTo(-s * 0.25, -s * 0.04); ctx.arc(0, -s * 0.04, s * 0.25, Math.PI, 0); ctx.lineTo(s * 0.25, s * 0.34); ctx.closePath(); ctx.clip();
    if (open) {
      const g = ctx.createRadialGradient(0, s * 0.1, 0, 0, s * 0.1, s * 0.4);
      g.addColorStop(0, '#ffd27a'); g.addColorStop(0.6, '#ff8a1f'); g.addColorStop(1, '#7a2f08');
      ctx.fillStyle = g; ctx.fillRect(-s / 2, -s / 2, s, s);
      // battenti aperti
      ctx.fillStyle = '#4a2f18';
      ctx.fillRect(-s * 0.25, -s * 0.3, s * 0.07, s * 0.65); ctx.fillRect(s * 0.18, -s * 0.3, s * 0.07, s * 0.65);
    } else {
      ctx.fillStyle = '#4a3521'; ctx.fillRect(-s / 2, -s / 2, s, s);
      // assi e bande di ferro
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = s * 0.012; ctx.beginPath();
      for (let k = -2; k <= 2; k++) { ctx.moveTo(k * s * 0.09, -s * 0.35); ctx.lineTo(k * s * 0.09, s * 0.35); }
      ctx.stroke();
      ctx.fillStyle = '#2a2a2e'; ctx.fillRect(-s * 0.25, -s * 0.02, s * 0.5, s * 0.04); ctx.fillRect(-s * 0.25, s * 0.18, s * 0.5, s * 0.04);
      // runa sigillo al centro
      ctx.strokeStyle = zap ? C.red : (sim.doorReached ? C.fire : '#8a7360'); ctx.lineWidth = s * 0.025; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, -s * 0.18); ctx.lineTo(0, s * 0.14); ctx.moveTo(-s * 0.08, -s * 0.1); ctx.lineTo(0, -s * 0.02); ctx.lineTo(s * 0.08, -s * 0.1); ctx.stroke();
    }
    ctx.restore();
    if (open) {
      // bagliore che esce dalla porta
      const f = 0.8 + 0.2 * Math.sin(now / 120);
      ctx.shadowColor = C.fire; ctx.shadowBlur = s * 0.3 * f;
      ctx.strokeStyle = C.gold; ctx.lineWidth = s * 0.03;
      ctx.beginPath(); ctx.moveTo(-s * 0.33, s * 0.34); ctx.lineTo(-s * 0.33, -s * 0.04); ctx.arc(0, -s * 0.04, s * 0.33, Math.PI, 0); ctx.lineTo(s * 0.33, s * 0.34); ctx.stroke();
      ctx.shadowBlur = 0;
    }
    if (zap) label('⚡', cs);
  }

  function drawRune(t, cs, i, now) {
    const s = cs, active = sim.lit[i];
    const pulse = 0.92 + 0.08 * Math.sin(now / 220 + i);
    // disco di pietra scolpito
    ctx.fillStyle = '#1d2733'; ctx.beginPath(); ctx.arc(0, 0, s * 0.3, 0, 7); ctx.fill();
    ctx.strokeStyle = '#3a4c60'; ctx.lineWidth = s * 0.03; ctx.stroke();
    ctx.strokeStyle = 'rgba(127,227,255,.35)'; ctx.lineWidth = s * 0.012; ctx.beginPath(); ctx.arc(0, 0, s * 0.24, 0, 7); ctx.stroke();
    // tacche sul bordo
    ctx.strokeStyle = 'rgba(127,227,255,.5)'; ctx.lineWidth = s * 0.015; ctx.beginPath();
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + now / 4000; ctx.moveTo(Math.cos(a) * s * 0.25, Math.sin(a) * s * 0.25); ctx.lineTo(Math.cos(a) * s * 0.29, Math.sin(a) * s * 0.29); }
    ctx.stroke();
    // glifo del tuono
    ctx.shadowColor = C.bolt; ctx.shadowBlur = s * 0.18 * pulse;
    ctx.strokeStyle = '#eaffff'; ctx.lineWidth = s * 0.055; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(s * 0.07, -s * 0.18); ctx.lineTo(-s * 0.07, s * 0.01); ctx.lineTo(s * 0.04, s * 0.01); ctx.lineTo(-s * 0.07, s * 0.18); ctx.stroke();
    ctx.shadowBlur = 0;
    // archi elettrici intermittenti
    if (active) {
      const rng = E.mulberry32(Math.floor(now / 90) + i * 31);
      ctx.strokeStyle = 'rgba(223,247,255,.8)'; ctx.lineWidth = s * 0.015;
      for (let k = 0; k < 2; k++) {
        if (rng() > 0.6) continue;
        const a = rng() * Math.PI * 2; let x = Math.cos(a) * s * 0.3, y = Math.sin(a) * s * 0.3;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let q = 0; q < 3; q++) { x += (rng() - 0.5) * s * 0.14; y += (rng() - 0.5) * s * 0.14; ctx.lineTo(x, y); }
        ctx.stroke();
      }
    }
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
      $('#hBarL').textContent = 'Prossimo mondo tra ' + (next.from - state.maxLevel) + (next.from - state.maxLevel === 1 ? ' livello' : ' livelli');
      $('#hBarR').textContent = next.name + ' →';
    } else {
      $('#hBar').style.width = '100%';
      $('#hBarL').textContent = 'Ultimo mondo'; $('#hBarR').textContent = 'livelli infiniti';
    }
    const doneCount = Object.keys(state.done).length;
    let starSum = 0; for (const k in state.done) starSum += state.done[k].s || 0;
    $('#hDone').textContent = doneCount;
    $('#hStars').textContent = starSum;
    $('#hSound').textContent = state.sound ? '🔊 Suoni attivi' : '🔇 Suoni disattivati';
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
      c.innerHTML = L + (done ? '<small class="st">' + '★'.repeat(done.s) + '</small>' : '<small>' + E.paramsFor(L).n + '×' + E.paramsFor(L).n + '</small>');
      if (L <= state.maxLevel) c.onclick = () => { startLevel(L); hideHome(); };
      chips.appendChild(c);
    }
    home.hidden = false;
    startFx();
  }
  function hideHome() { $('#home').hidden = true; stopFx(); resize(); }
  $('#hPlay').onclick = () => { startLevel(state.level); hideHome(); };
  $('#hRules').onclick = () => { $('#rules').hidden = false; };
  $('#hSound').onclick = () => { state.sound = !state.sound; save(); $('#hSound').textContent = state.sound ? '🔊 Suoni attivi' : '🔇 Suoni disattivati'; if (state.sound) sfx('tap'); };

  // ---------- suoni (sintetizzati, nessun file) ----------
  let ac = null;
  function sfx(name) {
    if (!state.sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      const t0 = ac.currentTime;
      const tone = (freq, dur, type, gain, delay, slide) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = type; o.frequency.setValueAtTime(freq, t0 + delay);
        if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + delay + dur);
        g.gain.setValueAtTime(0.0001, t0 + delay); g.gain.exponentialRampToValueAtTime(gain, t0 + delay + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + dur);
        o.connect(g).connect(ac.destination); o.start(t0 + delay); o.stop(t0 + delay + dur + 0.02);
      };
      const noise = (dur, gain, delay, hp) => {
        const buf = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
        const src = ac.createBufferSource(); src.buffer = buf;
        const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
        const g = ac.createGain(); g.gain.value = gain;
        src.connect(f).connect(g).connect(ac.destination); src.start(t0 + delay);
      };
      switch (name) {
        case 'tap': tone(520, 0.06, 'triangle', 0.12, 0, 380); break;
        case 'thud': tone(120, 0.08, 'sine', 0.15, 0, 80); break;
        case 'crack': noise(0.18, 0.25, 0, 1800); tone(1400, 0.12, 'sine', 0.08, 0.02, 600); break;
        case 'zap': noise(0.25, 0.2, 0, 400); tone(160, 0.3, 'sawtooth', 0.12, 0, 60); break;
        case 'hint': tone(880, 0.12, 'sine', 0.1, 0); tone(1320, 0.18, 'sine', 0.1, 0.1); break;
        case 'win': [523, 659, 784, 1047].forEach((f, k) => tone(f, 0.35, 'triangle', 0.14, k * 0.11)); noise(0.5, 0.06, 0.3, 3000); break;
      }
    } catch (e) { }
  }
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
